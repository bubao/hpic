import React, { useEffect, useMemo, useRef } from 'react';
import { marked } from 'marked';
import { isSvgUrl } from '../utils/imageMeta';
import { resolveSafeSvgUrl } from '../utils/svgFixer';

interface MarkdownViewProps {
  content: string;
  className?: string;
  style?: React.CSSProperties;
  /** 是否对历史版本进行自动折叠（默认对包含多个版本节点的 Changelog 开启） */
  collapseOlderVersions?: boolean;
}

// 配置 marked 解析规则：支持 GFM 表格/删除线、自动换行、外部链接安全跳转
const customRenderer = {
  link({ href, title, text }: { href: string; title?: string | null; text: string }) {
    const titleAttr = title ? ` title="${title}"` : '';
    // 强制在新标签页安全打开所有外部链接
    return `<a href="${href}" target="_blank" rel="noopener noreferrer"${titleAttr}>${text}</a>`;
  },
};

marked.use({
  gfm: true,
  breaks: true,
  renderer: customRenderer,
});

/**
 * 智能折叠历史版本：仅默认展开当前最新版本，将历史版本收敛在原生 <details> 折叠栏中
 */
export function foldChangelogVersions(rawContent: string): string {
  if (!rawContent) return rawContent;

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
  if (matches.length < 2) return rawContent;

  const secondVersionIdx = matches[1].index;
  const latestPart = rawContent.slice(0, secondVersionIdx).trim();
  const olderPart = rawContent.slice(secondVersionIdx).trim();
  const olderCount = matches.length - 1;
  const firstOlderMatch = matches[1].header.match(/\[([^\]]+)\]/);
  const firstOlderVersion = firstOlderMatch ? firstOlderMatch[1] : '';

  return `${latestPart}

<details class="changelog-older-versions">
<summary>展开查看历史版本记录（共 ${olderCount} 个历史版本${firstOlderVersion ? `，如 ${firstOlderVersion}` : ''}）</summary>

${olderPart}

</details>
`;
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

export const MarkdownView: React.FC<MarkdownViewProps> = ({
  content,
  className = '',
  style,
  collapseOlderVersions = true,
}) => {
  const rootRef = useRef<HTMLDivElement | null>(null);

  const processedContent = useMemo(() => {
    if (!collapseOlderVersions) return content;
    return foldChangelogVersions(content);
  }, [content, collapseOlderVersions]);

  const html = useMemo(() => {
    if (!processedContent) return '';
    try {
      return marked.parse(processedContent) as string;
    } catch (err) {
      console.error('Failed to parse markdown:', err);
      return `<pre>${processedContent.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;
    }
  }, [processedContent]);

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
