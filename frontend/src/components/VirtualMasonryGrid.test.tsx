import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render } from '@testing-library/react';
import { VirtualMasonryGrid } from './VirtualMasonryGrid';

interface Row {
  id: string;
}

const rows = (n: number): Row[] => Array.from({ length: n }, (_, i) => ({ id: `r${i}` }));

const renderCard = (r: Row) => <div className="card">{r.id}</div>;

/**
 * happy-dom 没有布局引擎，ResizeObserver / getBoundingClientRect / offsetHeight
 * 均不可用。这里注入可控替身，让虚拟化逻辑可以被打断点验证。
 */
function installDomStubs(width: number, viewportHeight: number) {
  const instances: Array<(entries: Array<{ contentRect: { width: number } }>) => void> = [];

  class FakeResizeObserver {
    cb: (entries: Array<{ contentRect: { width: number } }>) => void;
    constructor(cb: (entries: Array<{ contentRect: { width: number } }>) => void) {
      this.cb = cb;
      instances.push(cb);
    }
    observe() {
      this.cb([{ contentRect: { width } }]);
    }
    disconnect() {}
  }

  vi.stubGlobal('ResizeObserver', FakeResizeObserver);

  const innerHeight = viewportHeight;
  Object.defineProperty(window, 'innerHeight', { value: innerHeight, configurable: true });

  return {
    instances,
    setGridTop(top: number) {
      const el = document.querySelector('.vmg-test');
      if (!el) return;
      el.getBoundingClientRect = () =>
        ({ top, left: 0, right: width, bottom: top + 400, width, height: 400 }) as DOMRect;
      window.dispatchEvent(new Event('scroll'));
    },
  };
}

describe('VirtualMasonryGrid', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('空列表不渲染任何内容', () => {
    installDomStubs(1200, 720);
    const { container } = render(
      <VirtualMasonryGrid items={[]} renderItem={renderCard} keyOf={r => r.id} className="vmg-test" />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('长列表只渲染视口窗口内的卡片', () => {
    installDomStubs(1200, 720);
    const items = rows(100);

    const { container } = render(
      <VirtualMasonryGrid items={items} renderItem={renderCard} keyOf={r => r.id} className="vmg-test" />,
    );

    const rendered = container.querySelectorAll('.card');
    // 4 列 × (视口 720px + 上下各 2 行 overscan) ≈ 20 张，远小于 100
    expect(rendered.length).toBeGreaterThan(0);
    expect(rendered.length).toBeLessThan(items.length);

    // 容器总高度按全部行撑开，滚动条长度与真实内容一致
    const grid = container.querySelector('.vmg-test') as HTMLElement;
    expect(grid.style.position).toBe('relative');
    expect(grid.style.height).toMatch(/^\d+(\.\d+)?px$/);
    const total = parseFloat(grid.style.height);
    expect(total).toBeGreaterThan(720);
  });

  it('小列表全部渲染', () => {
    installDomStubs(1200, 720);
    const items = rows(3);

    const { container } = render(
      <VirtualMasonryGrid items={items} renderItem={renderCard} keyOf={r => r.id} className="vmg-test" />,
    );

    expect(container.querySelectorAll('.card')).toHaveLength(3);
  });

  it('滚动后切换渲染窗口，且已渲染卡片使用绝对定位', () => {
    const stubs = installDomStubs(1200, 720);
    const items = rows(100);

    const { container } = render(
      <VirtualMasonryGrid items={items} renderItem={renderCard} keyOf={r => r.id} className="vmg-test" />,
    );

    const firstBatch = Array.from(container.querySelectorAll('.card')).map(n => n.textContent);
    expect(firstBatch.length).toBeGreaterThan(0);

    // 滚动到很深的位置
    act(() => {
      stubs.setGridTop(-5000);
    });
    const secondBatch = Array.from(container.querySelectorAll('.card')).map(n => n.textContent);
    expect(secondBatch.length).toBeGreaterThan(0);
    // 窗口内容应完全切换（不与首屏重叠）
    const overlap = secondBatch.filter(id => firstBatch.includes(id));
    expect(overlap).toHaveLength(0);

    // 每个卡片都被绝对定位在网格单元格内
    const cell = container.querySelector('[data-vmg-cell]') as HTMLElement;
    expect(cell.style.position).toBe('absolute');
    expect(cell.style.left).toMatch(/^\d+(\.\d+)?px$/);
    expect(cell.style.top).toMatch(/^\d+(\.\d+)?px$/);
  });

  it('列宽随容器宽度变化（窄容器列数减少）', () => {
    installDomStubs(600, 720);
    const items = rows(40);

    const { container } = render(
      <VirtualMasonryGrid items={items} renderItem={renderCard} keyOf={r => r.id} className="vmg-test" />,
    );

    const cells = container.querySelectorAll('[data-vmg-cell]');
    expect(cells.length).toBeGreaterThan(0);
    // 600px 容器 → floor((600+16)/296) = 2 列
    const lefts = new Set(Array.from(cells).map(c => (c as HTMLElement).style.left));
    expect(lefts.size).toBeLessThanOrEqual(2);
  });

  it('滚动容器缺省时退化为 window', () => {
    installDomStubs(1200, 720);
    const items = rows(20);

    // 确保不存在 .app-main-content，走 window 分支
    render(
      <VirtualMasonryGrid items={items} renderItem={renderCard} keyOf={r => r.id} className="vmg-test" />,
    );

    expect(document.querySelector('.app-main-content')).toBeNull();
    expect(document.querySelector('.vmg-test')).not.toBeNull();
  });
});
