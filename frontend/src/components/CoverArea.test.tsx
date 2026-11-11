import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CoverArea } from './CoverArea';
import { FavoritesProvider } from '../context/FavoritesContext';
import { api } from '../api';
import { PostInfo } from '../types';

vi.mock('../api', () => ({
  api: {
    getFavorites: vi.fn(),
    addFavorite: vi.fn(),
    removeFavorite: vi.fn(),
    updateFavoriteTags: vi.fn(),
  },
}));

const mockPost: PostInfo = {
  title: 'SVG Code Test Post',
  file_name: 'test.md',
  file_path: '/path/to/test.md',
  date: '2026-11-06',
  updated: '2026-11-06',
  categories: 'Tech',
  tags: 'SVG',
  mod_time: '2026-11-06',
  has_all_images: true,
  status: 'complete',
  is_draft: false,
  images: {
    cover: 'https://cdn.jsdelivr.net/gh/bubao/picgo_db_tiny/img/20210326003122.svg',
  },
};

describe('CoverArea Component SVG & Fit Mode tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    (api.getFavorites as any).mockResolvedValue({ items: [], tags: [], total: 0 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders SVG cover in contain mode with ambient blur background by default', async () => {
    // 模拟 Image 加载成功
    const origImage = window.Image;
    class MockImage {
      onload: any = null;
      onerror: any = null;
      referrerPolicy = '';
      naturalWidth = 990;
      naturalHeight = 1020;
      complete = true;
      set src(val: string) {
        setTimeout(() => {
          if (this.onload) this.onload();
        }, 10);
      }
    }
    window.Image = MockImage as any;

    render(
      <FavoritesProvider>
        <CoverArea
          post={mockPost}
          coverFields={['cover']}
          brokenReports={[]}
          brokenUrls={new Set()}
          onOpenLightbox={vi.fn()}
          onClearField={vi.fn()}
          onClearAll={vi.fn()}
          onDropImage={vi.fn()}
          onCopyText={vi.fn()}
          onOpenSystemURL={vi.fn()}
          onMarkBroken={vi.fn()}
        />
      </FavoritesProvider>
    );

    // 默认应该显示模式切换按钮为“完整”
    await waitFor(() => {
      const modeBtn = screen.getByText('完整');
      expect(modeBtn).toBeDefined();
    });

    // 检查是否有 ambient blur 背衬
    const blurImg = document.querySelector('.cover-ambient-blur');
    expect(blurImg).not.toBeNull();

    // 检查前景图容器带有 fit-contain，且内部应使用 object 标签渲染以兼容 WebKit
    const displayWrap = document.querySelector('.cover-img-display.fit-contain');
    expect(displayWrap).not.toBeNull();
    const displayImg = displayWrap?.querySelector('object');
    expect(displayImg).not.toBeNull();
    expect(displayImg?.getAttribute('type')).toBe('image/svg+xml');
    expect(displayImg?.getAttribute('data')).toBe(mockPost.images.cover);

    // 点击切换为铺满模式
    const modeBtn = screen.getByText('完整');
    fireEvent.click(modeBtn);

    // 切换后显示为“铺满”
    expect(screen.getByText('铺满')).toBeDefined();
    const coverDisplayWrap = document.querySelector('.cover-img-display.fit-cover');
    expect(coverDisplayWrap).not.toBeNull();
    expect(coverDisplayWrap?.querySelector('object')).not.toBeNull();

    window.Image = origImage;
  });
});
