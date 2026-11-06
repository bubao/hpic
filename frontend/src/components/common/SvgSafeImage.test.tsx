import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, waitFor, fireEvent } from '@testing-library/react';
import { SvgSafeImage } from './SvgSafeImage';

const RAW_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="990" height="1020"><rect width="990" height="1020" fill="#123456"/></svg>';

function mockSvgFetch(svgText: string = RAW_SVG) {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(svgText, { status: 200, headers: { 'Content-Type': 'image/svg+xml' } })
  );
  return fetchMock;
}

describe('SvgSafeImage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('非 SVG 资源渲染为 <img> 并保持原有属性', () => {
    const onError = vi.fn();
    render(
      <SvgSafeImage
        src="https://example.com/photo.jpg"
        alt="photo"
        className="thumb"
        loading="lazy"
        onError={onError}
      />
    );
    const img = document.querySelector('img.thumb') as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toBe('https://example.com/photo.jpg');
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(document.querySelector('object')).toBeNull();
  });

  it('SVG 渲染为 <object>，自动补全 viewBox 并改写根尺寸为 100%', async () => {
    const fetchMock = mockSvgFetch();
    render(<SvgSafeImage src="https://example.com/card.svg" alt="card" fitMode="contain" />);

    const objectEl = document.querySelector('object[type="image/svg+xml"]') as HTMLObjectElement;
    expect(objectEl).not.toBeNull();
    expect(objectEl.getAttribute('aria-label')).toBe('card');

    // safeUrl 就绪后组件会重挂载 object，需重新查询节点
    await waitFor(() => {
      const current = document.querySelector('object[type="image/svg+xml"]') as HTMLObjectElement;
      expect(current.getAttribute('data') || '').toMatch(/^blob:/);
    });
    expect(fetchMock).toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it('默认点击穿透：object 关闭指针事件，父级仍可响应点击', async () => {
    const onParentClick = vi.fn();
    mockSvgFetch();
    render(
      <div onClick={onParentClick}>
        <SvgSafeImage src="https://example.com/pass.svg" alt="pass" />
      </div>
    );
    const objectEl = document.querySelector('object') as HTMLObjectElement;
    expect(objectEl.style.pointerEvents).toBe('none');
    // 点击穿透后事件由下层父元素承接
    fireEvent.click(objectEl);
    expect(onParentClick).toHaveBeenCalled();
  });

  it('clickThrough=false 时提供透明遮罩层承接点击', async () => {
    const onClick = vi.fn();
    mockSvgFetch();
    const { container } = render(
      <SvgSafeImage src="https://example.com/interactive.svg" alt="interactive" fitMode="cover" onClick={onClick} clickThrough={false} />
    );

    const objectEl = container.querySelector('object') as HTMLObjectElement;
    expect(objectEl.style.pointerEvents).toBe('none');

    // 遮罩层位于 object 之后
    const mask = objectEl.nextElementSibling as HTMLElement;
    expect(mask).not.toBeNull();
    fireEvent.click(mask);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('支持 Data URI 形式的 SVG（含 charset 声明）', async () => {
    const dataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(RAW_SVG)}`;
    render(<SvgSafeImage src={dataUri} alt="data-uri" />);

    const objectEl = document.querySelector('object') as HTMLObjectElement;
    expect(objectEl).not.toBeNull();
    await waitFor(() => {
      const current = document.querySelector('object') as HTMLObjectElement;
      expect(current.getAttribute('data') || '').toMatch(/^blob:/);
    });
  });

  it('直连失败时回退到本地图像代理抓取', async () => {
    // 首次（直连原 URL）失败，代理路径成功
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const target = String(input);
      if (target.includes('/api/image/proxy')) {
        return new Response(RAW_SVG, { status: 200, headers: { 'Content-Type': 'image/svg+xml' } });
      }
      throw new Error('CORS blocked');
    });

    render(<SvgSafeImage src="https://cdn.example.com/fallback.svg" alt="fallback" />);

    await waitFor(() => {
      const current = document.querySelector('object') as HTMLObjectElement;
      expect(current.getAttribute('data') || '').toMatch(/^blob:/);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain('/api/image/proxy?url=');
    fetchMock.mockRestore();
  });
});
