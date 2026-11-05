import React, { useMemo } from 'react';
import { marked } from 'marked';

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
<summary>📜 展开查看历史版本记录（共 ${olderCount} 个历史版本${firstOlderVersion ? `，如 ${firstOlderVersion}` : ''}）</summary>

${olderPart}

</details>
`;
}

export const MarkdownView: React.FC<MarkdownViewProps> = ({
  content,
  className = '',
  style,
  collapseOlderVersions = true,
}) => {
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

  return (
    <div
      className={`markdown-body ${className}`}
      style={style}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};
