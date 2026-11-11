import React, { useEffect, useMemo, useRef } from 'react';
import { marked, type RendererObject } from 'marked';
import { isSvgUrl } from '../utils/imageMeta';
import { resolveSafeSvgUrl } from '../utils/svgFixer';

interface MarkdownViewProps {
  content: string;
  className?: string;
  style?: React.CSSProperties;
  /** 是否对历史版本进行自动折叠（默认对包含多个版本节点的 Changelog 开启） */
  collapseOlderVersions?: boolean;
}

/** 文本内容转义：保留已有实体（&amp; / &#39; 等），仅转义 & < > */
const escapeHtmlText = (value: string): string =>
  value
    .replace(/&(?!#?\w+;)/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/** 属性值转义：在文本转义基础上再处理引号 */
const escapeHtmlAttr = (value: string): string =>
  escapeHtmlText(value)
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * 链接协议白名单：仅放行 http/https/mailto 与无协议的相对路径。
 * 浏览器会忽略 URL 中的空白/控制字符，因此先剔除再做 scheme 判定，
 * 防止 `java\tscript:`、`&#14;javascript:` 之类绕过。
 */
const sanitizeLinkHref = (href: string): string => {
  const raw = (href || '').trim();
  if (!raw) return '#';
  // 逐字符剔除控制字符与空白，避免在正则中直接书写控制字符字面量
  const compact = Array.from(raw)
    .filter(ch => {
      const code = ch.charCodeAt(0);
      return code > 0x20 && code !== 0x7f;
    })
    .join('')
    .toLowerCase();
  // 无 scheme 的相对地址（#anchor、/path、./、../、foo/bar、//host）直接放行
  if (!/^[a-z][a-z0-9+.-]*:/.test(compact)) return raw;
  return /^(https?:|mailto:)/.test(compact) ? raw : '#';
};

// 配置 marked 解析规则：支持 GFM 表格/删除线、自动换行、外部链接安全跳转
const customRenderer: RendererObject = {
  link({ href, title, tokens }) {
    const safeHref = sanitizeLinkHref(href);
    const titleAttr = title ? ` title="${escapeHtmlAttr(title)}"` : '';
    // 链接文本按 inline token 渲染（保留粗体/图片等），其中原始 HTML token 已在 html 渲染器统一转义；
    // href/title 做实体转义，未知协议降级为 #
    const textHtml = this.parser.parseInline(tokens);
    return `<a href="${escapeHtmlAttr(safeHref)}" target="_blank" rel="noopener noreferrer"${titleAttr}>${textHtml}</a>`;
  },
  // 禁止 marked 透传原始 HTML：统一转义为文本，从源头切断 HTML 注入
  html({ text }) {
    return escapeHtmlText(text);
  },
};

marked.use({
  gfm: true,
  breaks: true,
  renderer: customRenderer,
});

/** Changelog 版本拆分结果：最新一段 + 可折叠的历史段 */
interface ChangelogSplit {
  latest: string;
  older: string | null;
  olderCount: number;
  firstOlderVersion: string;
}

/**
 * 智能折叠历史版本：仅默认展开当前最新版本，将历史版本收敛在原生 <details> 折叠栏中。
 * 返回拆分结果而非拼接 HTML —— 折叠结构由 React 渲染，避免向 markdown 源注入原始 HTML。
 */
export function splitChangelogVersions(rawContent: string): ChangelogSplit {
  if (!rawContent) return { latest: rawContent, older: null, olderCount: 0, firstOlderVersion: '' };

  const versionRegex = /(?:^|\n)(## \[[^\]]+\][^\n]*)/g;
  const matches: { index: number; header: string }[] = [];
  let m;
  while ((m = versionRegex.exec(rawContent)) !== null) {
    matches.push({
      index: m.index + (m[0].startsWith('\n') ? 1 : 0),
      header: m[1],
    });
  }

  // 少于 2 个版本节点时无需折叠
  if (matches.length < 2) {
    return { latest: rawContent, older: null, olderCount: 0, firstOlderVersion: '' };
  }

  const secondVersionIdx = matches[1].index;
  const firstOlderMatch = matches[1].header.match(/\[([^\]]+)\]/);

  return {
    latest: rawContent.slice(0, secondVersionIdx).trim(),
    older: rawContent.slice(secondVersionIdx).trim(),
    olderCount: matches.length - 1,
    firstOlderVersion: firstOlderMatch ? firstOlderMatch[1] : '',
  };
}

/**
 * 将正文内残留的 SVG `<img>` 节点升级为经 safe SVG 修复的 `<object>` 节点。
 *
 * 背景：正文通过 dangerouslySetInnerHTML 渲染，无法直接挂载组件；而 WebKit / Safari
 * 在 `<img>` 中无法正确渲染含 foreignObject 的 SVG，且根标签的绝对宽高会把整图裁切。
 * 因此在此统一做命令式升级：
 * 1. 仅处理 URL 判定为 SVG 的 `<img>`；
 * 2. 等待 Blob 版安全 SVG 就绪（含 CORS 代理兜底）后再替换，避免闪烁；
 * 3. 保留原始 class / inline style / 宽高属性，并透出宽高比元数据。
 */
function upgradeSvgImagesToObjects(root: HTMLElement, onCancelled: () => boolean): void {
  const imgs = Array.from(root.querySelectorAll('img')) as HTMLImageElement[];

  for (const img of imgs) {
    if (onCancelled()) return;
    const src = img.getAttribute('src') || '';
    if (!isSvgUrl(src)) continue;

    resolveSafeSvgUrl(src, 'contain')
      .then(entry => {
        if (onCancelled() || !img.isConnected) return;
        // 连抓取都失败时保留原 `<img>`（可能只是临时网络问题，不改变展示路径）
        if (entry.failed) return;

        const obj = document.createElement('object');
        obj.setAttribute('data', entry.url);
        obj.setAttribute('type', 'image/svg+xml');
        obj.setAttribute('role', 'img');
        obj.setAttribute('aria-label', img.getAttribute('alt') || '');
        if (img.title) obj.setAttribute('title', img.title);
        obj.className = img.className;

        // 保留原始宽度属性（属性尺寸是 object 的固有尺寸来源），其余交给 CSS
        if (img.hasAttribute('width')) {
          obj.setAttribute('width', img.getAttribute('width')!);
        } else if (entry.dimensions) {
          obj.setAttribute('width', String(entry.dimensions.width));
        }
        if (img.hasAttribute('height')) {
          obj.setAttribute('height', img.getAttribute('height')!);
        } else if (entry.dimensions) {
          obj.setAttribute('height', String(entry.dimensions.height));
        }

        // 继承内联样式（如 max-width、margin），再强制矢量容器规范；
        // 布局规范由 `.markdown-body object` 样式统一承办
        obj.style.cssText = img.style.cssText;
        obj.style.objectFit = 'contain';
        // 内嵌文档会拦截点击（图片被链接包裹时尤为关键），保持指针穿透
        obj.style.pointerEvents = 'none';

        img.replaceWith(obj);
      })
      .catch(() => {
        // 解析失败时保留原 `<img>`，平滑降级（原有渲染路径）
      });
  }
}

/** 渲染单段 markdown 为已消毒的 HTML（原始 HTML 会被转义为文本） */
function renderMarkdown(content: string): string {
  if (!content) return '';
  try {
    return marked.parse(content) as string;
  } catch (err) {
    console.error('Failed to parse markdown:', err);
    return `<pre>${escapeHtmlText(content)}</pre>`;
  }
}

export const MarkdownView: React.FC<MarkdownViewProps> = ({
  content,
  className = '',
  style,
  collapseOlderVersions = true,
}) => {
  const rootRef = useRef<HTMLDivElement | null>(null);

  const html = useMemo(() => {
    if (!content) return '';

    const { latest, older, olderCount, firstOlderVersion } = collapseOlderVersions
      ? splitChangelogVersions(content)
      : { latest: content, older: null, olderCount: 0, firstOlderVersion: '' };

    const parts: string[] = [renderMarkdown(latest)];
    if (older !== null) {
      // <details> 结构由组件自身生成（可信 HTML）；版本号文本做实体转义
      const versionHint = firstOlderVersion ? `，如 ${escapeHtmlText(firstOlderVersion)}` : '';
      parts.push(
        `<details class="changelog-older-versions">\n` +
          `<summary>展开查看历史版本记录（共 ${olderCount} 个历史版本${versionHint}）</summary>\n\n` +
          `${renderMarkdown(older)}\n\n` +
          `</details>`
      );
    }
    return parts.join('\n\n');
  }, [content, collapseOlderVersions]);

  // 正文 HTML 是命令式注入的，SVG 安全升级只能在渲染后递归处理
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !html) return;
    let cancelled = false;
    upgradeSvgImagesToObjects(root, () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [html]);

  return (
    <div
      ref={rootRef}
      className={`markdown-body ${className}`}
      style={style}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};
