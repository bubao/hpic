import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MarkdownView } from './MarkdownView';

describe('MarkdownView component tests', () => {
  it('should render empty container when content is empty', () => {
    const { container } = render(<MarkdownView content="" />);
    expect(container.querySelector('.markdown-body')?.innerHTML).toBe('');
  });

  it('should parse headings, lists, bold text and inline code', () => {
    const content = `## 新增特性
- **支持 4K 原图直连**: 提高清晰度
- 修复 \`NaN×NaN\` 徽章展示异常`;

    render(<MarkdownView content={content} />);

    // 检查二级标题
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading.textContent).toBe('新增特性');

    // 检查粗体文本
    expect(screen.getByText('支持 4K 原图直连')).toBeDefined();

    // 检查列表项
    const listItems = screen.getAllByRole('listitem');
    expect(listItems.length).toBe(2);

    // 检查 inline code
    expect(screen.getByText('NaN×NaN')).toBeDefined();
  });

  it('should render external links with target="_blank" and rel="noopener noreferrer"', () => {
    const content = '访问 [GitHub Releases](https://github.com/bubao/hpic/releases) 查看';
    const { container } = render(<MarkdownView content={content} />);

    const link = container.querySelector('a');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe('https://github.com/bubao/hpic/releases');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link?.textContent).toBe('GitHub Releases');
  });

  it('should automatically fold older versions when multiple version headings exist in changelog', () => {
    const changelog = `# 更新日志

## [v0.1.0] - 2026-11-05
- **特性**: 全局防白屏

## [v0.0.2] - 2026-11-04
- **旧特性**: 4K壁纸直连

## [v0.0.1] - 2026-11-01
- **初始版本**: 基础功能`;

    const { container } = render(<MarkdownView content={changelog} />);

    // 最新版本内容应该正常展示在最外层
    expect(screen.getByText('特性')).toBeDefined();

    // 历史版本折叠容器 details 应该存在
    const details = container.querySelector('details.changelog-older-versions');
    expect(details).not.toBeNull();

    // summary 应该展示历史版本数量提示
    const summary = container.querySelector('summary');
    expect(summary?.textContent).toContain('2 个历史版本');
    expect(summary?.textContent).toContain('v0.0.2');
  });

  it('should not fold when collapseOlderVersions is set to false', () => {
    const changelog = `## [v0.1.0] - 2026-11-05
- 特性 1

## [v0.0.2] - 2026-11-04
- 特性 2`;

    const { container } = render(<MarkdownView content={changelog} collapseOlderVersions={false} />);
    const details = container.querySelector('details.changelog-older-versions');
    expect(details).toBeNull();
  });
});
