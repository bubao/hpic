import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MarkdownView } from './MarkdownView';

const RAW_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="990" height="1020"><rect width="990" height="1020" fill="#123456"/></svg>';

/** 每个用例使用唯一 URL，规避 svgFixer 模块级缓存的跨用例串扰 */
function uniqueSvgUrl(): string {
  return `https://example.com/md-${crypto.randomUUID()}.svg`;
}

describe('MarkdownView SVG 升级', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('正文内的 SVG <img> 被升级为修复后的 <object>，并保留 alt / title', async () => {
    const url = uniqueSvgUrl();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(RAW_SVG, { status: 200, headers: { 'Content-Type': 'image/svg+xml' } })
    );

    const markdown = `# 标题\n\n![技能卡片](${url} "技能卡片")`;
    const { container } = render(<MarkdownView content={markdown} />);

    const imgEl = container.querySelector('.markdown-body img');
    expect(imgEl).not.toBeNull();
    expect(imgEl?.getAttribute('src')).toBe(url);

    await waitFor(() => {
      const objectEl = container.querySelector('.markdown-body object[type="image/svg+xml"]');
      expect(objectEl).not.toBeNull();
      expect(objectEl!.getAttribute('data') || '').toMatch(/^blob:/);
    });

    // 原节点已被替换
    expect(container.querySelector('.markdown-body img')).toBeNull();
    // 元数据透传
    const objectEl = container.querySelector('.markdown-body object') as HTMLObjectElement;
    expect(objectEl.getAttribute('aria-label')).toBe('技能卡片');
    expect(objectEl.getAttribute('title')).toBe('技能卡片');
    expect(objectEl.getAttribute('width')).toBe('990');
    expect(objectEl.getAttribute('height')).toBe('1020');
    expect(objectEl.style.pointerEvents).toBe('none');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockRestore();
  });

  it('普通位图 <img> 保持不变', async () => {
    const markdown = '![照片](https://example.com/photo.jpg)';
    const { container } = render(<MarkdownView content={markdown} />);

    const imgEl = container.querySelector('.markdown-body img');
    expect(imgEl).not.toBeNull();
    // 给定宏任务让潜在的升级逻辑执行后再断言
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(container.querySelector('.markdown-body img')).toBe(imgEl);
    expect(container.querySelector('.markdown-body object')).toBeNull();
  });

  it('被链接包裹的 SVG 升级后仍保留外层 <a>', async () => {
    const url = uniqueSvgUrl();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(RAW_SVG, { status: 200, headers: { 'Content-Type': 'image/svg+xml' } })
    );

    // marked 不会解析嵌套在链接语法中的图片，此处用原生 HTML 模拟正文内链式图片
    const markdown = `<a href="https://example.com/target"><img src="${url}" alt="卡片"></a>`;
    const { container } = render(<MarkdownView content={markdown} />);

    await waitFor(() => {
      expect(container.querySelector('.markdown-body object[type="image/svg+xml"]')).not.toBeNull();
    });

    const anchor = container.querySelector('.markdown-body a');
    expect(anchor).not.toBeNull();
    expect(anchor?.getAttribute('href')).toBe('https://example.com/target');
    // object 仍在链接内部
    expect(anchor?.querySelector('object')).not.toBeNull();
  });

  it('直连失败时通过本地图像代理兜底，依然完成升级', async () => {
    const url = uniqueSvgUrl();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      const target = String(input);
      if (target.includes('/api/image/proxy')) {
        return new Response(RAW_SVG, { status: 200, headers: { 'Content-Type': 'image/svg+xml' } });
      }
      throw new Error('CORS blocked');
    });

    const markdown = `![卡片](${url})`;
    const { container } = render(<MarkdownView content={markdown} />);

    await waitFor(() => {
      const objectEl = container.querySelector('.markdown-body object[type="image/svg+xml"]');
      expect(objectEl!.getAttribute('data') || '').toMatch(/^blob:/);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain('/api/image/proxy?url=');
    fetchMock.mockRestore();
  });

  it('所有链路失败时保留原 <img> 平滑降级', async () => {
    const url = uniqueSvgUrl();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));

    const markdown = `![卡片](${url})`;
    const { container } = render(<MarkdownView content={markdown} />);

    // 等待两轮尝试（直连 + 代理）全部失败
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    // 无升级发生，img 仍为原节点
    expect(container.querySelector('.markdown-body img')).not.toBeNull();
    expect(container.querySelector('.markdown-body object')).toBeNull();
  });
});
