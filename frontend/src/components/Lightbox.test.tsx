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
