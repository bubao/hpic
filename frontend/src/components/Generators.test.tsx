import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Generators } from './Generators';
import { FavoritesProvider } from '../context/FavoritesContext';
import { ToastProvider } from '../context/ToastContext';
import { api } from '../api';
import type { PostInfo } from '../types';

vi.mock('../api', () => ({
  api: {
    getFavorites: vi.fn(),
    addFavorite: vi.fn(),
    removeFavorite: vi.fn(),
    updateFavoriteTags: vi.fn(),
    openSystemURL: vi.fn(),
    searchGalleryProvider: vi.fn(),
  },
}));

const dummyPost = { title: '优化测试博文', images: {} } as PostInfo;

const renderGenerators = () =>
  render(
    <ToastProvider>
      <FavoritesProvider>
        <Generators
          post={dummyPost}
          coverFields={['index_img']}
          defaultOwner="bubao"
          onApplyImage={vi.fn()}
          onOpenLightbox={vi.fn()}
        />
      </FavoritesProvider>
    </ToastProvider>,
  );

describe('Generators 生成器分组', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    (api.getFavorites as any).mockResolvedValue({ items: [], tags: [], total: 0 });
  });

  it('主区域只展示常用生成器，其余收进「更多」', () => {
    renderGenerators();
    expect(screen.getByRole('tab', { name: /Socialify 开源卡片/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /SkillIcons 技术栈/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /极客海报/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /OpenGraph 网页封面/ })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: /Lorem Picsum 随机/ })).toBeNull();
    expect(screen.getByRole('button', { name: '更多' })).toBeTruthy();
  });

  it('展开「更多」后按分组列出其余生成器，并可切换', () => {
    renderGenerators();
    const moreBtn = screen.getByRole('button', { name: '更多' });
    expect(moreBtn.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(moreBtn);
    expect(moreBtn.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('图片生成')).toBeTruthy();
    expect(screen.getByText('徽章与统计')).toBeTruthy();
    expect(screen.getByText('图表与工具')).toBeTruthy();

    fireEvent.click(screen.getByRole('menuitem', { name: /Lorem Picsum 随机/ }));
    expect(moreBtn.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByText(/种子 \(Seed\)/)).toBeTruthy();
  });

  it('点击面板外部关闭「更多」', () => {
    renderGenerators();
    const moreBtn = screen.getByRole('button', { name: '更多' });
    fireEvent.click(moreBtn);
    expect(moreBtn.getAttribute('aria-expanded')).toBe('true');
    fireEvent.mouseDown(document.body);
    expect(moreBtn.getAttribute('aria-expanded')).toBe('false');
  });
});
