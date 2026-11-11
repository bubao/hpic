import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { Lightbox } from './Lightbox';
import { ToastProvider } from '../context/ToastContext';
import { FavoritesProvider } from '../context/FavoritesContext';
import { api } from '../api';

vi.mock('../api', () => ({
  api: {
    checkImageHealth: vi.fn(),
    openSystemURL: vi.fn(),
    getFavorites: vi.fn(),
    addFavorite: vi.fn(),
    removeFavorite: vi.fn(),
    updateFavoriteTags: vi.fn(),
  },
}));

describe('Lightbox — Esc 键关闭功能', () => {
  const defaultProps = {
    isOpen: true,
    url: 'https://example.com/test.jpg',
    fallbackUrl: 'https://example.com/fallback.jpg',
    title: '测试图片',
    onClose: vi.fn(),
  };

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ToastProvider>
      <FavoritesProvider>{children}</FavoritesProvider>
    </ToastProvider>
  );

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    (api.checkImageHealth as any).mockResolvedValue({ is_broken: false, need_proxy: false });
    (api.getFavorites as any).mockResolvedValue({ items: [], tags: [], total: 0 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('渲染 Lightbox 时显示标题和图片', () => {
    render(<Lightbox {...defaultProps} />, { wrapper });

    expect(screen.getByText('测试图片')).toBeDefined();
  });

  it('按下 Escape 键触发 onClose', () => {
    const onClose = vi.fn();
    render(<Lightbox {...defaultProps} onClose={onClose} />, { wrapper });

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('按下其他键不触发 onClose', () => {
    const onClose = vi.fn();
    render(<Lightbox {...defaultProps} onClose={onClose} />, { wrapper });

    fireEvent.keyDown(window, { key: 'Enter' });
    fireEvent.keyDown(window, { key: 'a' });
    fireEvent.keyDown(window, { key: 'Tab' });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('Lightbox 关闭后 Escape 不再触发 onClose', async () => {
    const onClose = vi.fn();
    const { rerender } = render(<Lightbox {...defaultProps} onClose={onClose} />, { wrapper });

    // 先关闭 Lightbox
    rerender(<Lightbox {...defaultProps} isOpen={false} onClose={onClose} />);

    // 再按 Escape
    fireEvent.keyDown(window, { key: 'Escape' });

    // onClose 不应被调用（Lightbox 已关闭，没有注册监听器）
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Escape 事件 stopPropagation 防止冒泡', () => {
    const onClose = vi.fn();
    const parentHandler = vi.fn();

    render(
      <div onKeyDown={parentHandler}>
        <Lightbox {...defaultProps} onClose={onClose} />
      </div>,
      { wrapper }
    );

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('多次按下 Escape 每次都触发 onClose', () => {
    const onClose = vi.fn();
    render(<Lightbox {...defaultProps} onClose={onClose} />, { wrapper });

    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('渲染 SVG 图片时应使用 object 标签以兼容 WebKit foreignObject 渲染', () => {
    const svgUrl = 'https://cdn.jsdelivr.net/gh/bubao/picgo_db_tiny/img/20210325223847.svg';
    render(
      <Lightbox
        {...defaultProps}
        url={svgUrl}
        title="SVG 图标"
      />,
      { wrapper }
    );

    const objElement = document.querySelector('object.lightbox-preview-img');
    expect(objElement).not.toBeNull();
    expect(objElement?.getAttribute('type')).toBe('image/svg+xml');
    expect(objElement?.getAttribute('data')).toBe(svgUrl);
  });
});

describe('Lightbox — 破图标记仅在源站确证 404 时触发', () => {
  const defaultProps = {
    isOpen: true,
    url: 'https://example.com/test.jpg',
    fallbackUrl: 'https://example.com/fallback.jpg',
    title: '测试图片',
    onClose: vi.fn(),
  };

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ToastProvider>
      <FavoritesProvider>{children}</FavoritesProvider>
    </ToastProvider>
  );

  const healthResult = (overrides: Record<string, unknown>) => ({
    url: defaultProps.url,
    ok: false,
    status_code: 404,
    need_proxy: false,
    is_broken: true,
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    (api.getFavorites as any).mockResolvedValue({ items: [], tags: [], total: 0 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('源站返回 404 时标记破图', async () => {
    const onMarkBroken = vi.fn();
    (api.checkImageHealth as any).mockResolvedValue(healthResult({ status_code: 404 }));

    render(<Lightbox {...defaultProps} onMarkBroken={onMarkBroken} />, { wrapper });
    await act(async () => {});

    expect(onMarkBroken).toHaveBeenCalledWith(defaultProps.url);
  });

  it('非 404 的失效（如 500）只展示失效态，不写入破图标记', async () => {
    const onMarkBroken = vi.fn();
    (api.checkImageHealth as any).mockResolvedValue(healthResult({ status_code: 500 }));

    render(<Lightbox {...defaultProps} onMarkBroken={onMarkBroken} />, { wrapper });
    await act(async () => {});

    expect(onMarkBroken).not.toHaveBeenCalled();
  });

  it('网络层错误不标记破图', async () => {
    const onMarkBroken = vi.fn();
    (api.checkImageHealth as any).mockResolvedValue(
      healthResult({ is_broken: false, network_error: true, status_code: 0 })
    );

    render(<Lightbox {...defaultProps} onMarkBroken={onMarkBroken} />, { wrapper });
    await act(async () => {});

    expect(onMarkBroken).not.toHaveBeenCalled();
  });

  it('过期的探测响应不会覆盖最新一次结果', async () => {
    const onMarkBroken = vi.fn();
    let resolveFirst: (v: unknown) => void = () => {};
    let resolveSecond: (v: unknown) => void = () => {};
    (api.checkImageHealth as any)
      .mockImplementationOnce(() => new Promise(res => { resolveFirst = res; }))
      .mockImplementationOnce(() => new Promise(res => { resolveSecond = res; }));

    const { rerender } = render(
      <Lightbox {...defaultProps} url="https://example.com/a.jpg" onMarkBroken={onMarkBroken} />,
      { wrapper }
    );
    rerender(
      <Lightbox {...defaultProps} url="https://example.com/b.jpg" onMarkBroken={onMarkBroken} />
    );

    // 旧请求（a.jpg，404）后返回，应被丢弃
    await act(async () => { resolveFirst(healthResult({ status_code: 404 })); });
    expect(onMarkBroken).not.toHaveBeenCalled();

    // 新请求（b.jpg，正常）先返回，状态应被接受
    await act(async () => {
      resolveSecond(healthResult({ is_broken: false, ok: true, status_code: 200 }));
    });
    expect(onMarkBroken).not.toHaveBeenCalled();
  });
});
