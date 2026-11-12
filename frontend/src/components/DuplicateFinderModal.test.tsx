import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { DuplicateFinderModal } from './DuplicateFinderModal';
import { api } from '../api';
import { ToastProvider } from '../context/ToastContext';
import { FavoriteItem } from '../types';

vi.mock('../api', () => ({
  api: {
    getFavoriteDuplicates: vi.fn(),
    removeFavorite: vi.fn(),
  },
}));

const makeItem = (url: string, title: string): FavoriteItem => ({
  id: url,
  url,
  thumb_url: url,
  title,
  source: 'unsplash',
  tags: [],
  created_at: '2026-01-01T00:00:00Z',
});

const renderModal = (isOpen = true, onChanged = vi.fn()) =>
  render(
    <ToastProvider>
      <DuplicateFinderModal isOpen={isOpen} onClose={vi.fn()} onChanged={onChanged} />
    </ToastProvider>
  );

describe('DuplicateFinderModal Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when closed', () => {
    renderModal(false);
    expect(screen.queryByText('重复图片检测')).toBeNull();
  });

  it('scans on open and shows empty state when no duplicates', async () => {
    vi.mocked(api.getFavoriteDuplicates).mockResolvedValue({
      success: true,
      groups: [],
      scanned: 3,
      failed: 0,
    });

    renderModal(true);

    await waitFor(() => {
      expect(api.getFavoriteDuplicates).toHaveBeenCalledWith(6);
    });
    await waitFor(() => {
      expect(screen.getByText('未发现重复图片')).toBeDefined();
      const summary = document.querySelector('.dup-summary');
      expect(summary?.textContent).toContain('已扫描');
      expect(summary?.textContent).toContain('3');
      expect(summary?.textContent).toContain('发现');
    });
  });

  it('renders groups and removes all but the first with confirm', async () => {
    const onChanged = vi.fn();
    vi.mocked(api.getFavoriteDuplicates).mockResolvedValue({
      success: true,
      groups: [
        {
          hash: 'aabbccddeeff0011',
          items: [makeItem('https://example.com/a.jpg', '山景'), makeItem('https://example.com/b.jpg', '山景 2')],
        },
      ],
      scanned: 2,
      failed: 0,
    });
    vi.mocked(api.removeFavorite).mockResolvedValue({ success: true });

    renderModal(true, onChanged);

    await waitFor(() => {
      expect(screen.getByText('重复组 1')).toBeDefined();
      expect(screen.getByText('保留')).toBeDefined();
      expect(screen.getByText('保留第一张，移除其余 (1)')).toBeDefined();
    });

    fireEvent.click(screen.getByText('保留第一张，移除其余 (1)'));
    await waitFor(() => {
      expect(screen.getByText('确定移除 1 张？')).toBeDefined();
    });

    fireEvent.click(screen.getByText('确定'));

    await waitFor(() => {
      expect(api.removeFavorite).toHaveBeenCalledWith('https://example.com/b.jpg');
      expect(onChanged).toHaveBeenCalled();
    });
    // 移除后自动重新检测
    await waitFor(() => {
      expect(api.getFavoriteDuplicates).toHaveBeenCalledTimes(2);
    });
  });

  it('removes a single duplicate directly', async () => {
    vi.mocked(api.getFavoriteDuplicates).mockResolvedValue({
      success: true,
      groups: [
        {
          hash: '1122334455667788',
          items: [makeItem('https://example.com/a.jpg', 'A'), makeItem('https://example.com/b.jpg', 'B')],
        },
      ],
      scanned: 2,
      failed: 0,
    });
    vi.mocked(api.removeFavorite).mockResolvedValue({ success: true });

    renderModal(true);

    await waitFor(() => {
      expect(screen.getByText('重复组 1')).toBeDefined();
    });

    const removeButtons = screen.getAllByTitle('从收藏夹移除这张图片');
    expect(removeButtons.length).toBe(1);
    fireEvent.click(removeButtons[0]);

    await waitFor(() => {
      expect(api.removeFavorite).toHaveBeenCalledWith('https://example.com/b.jpg');
    });
  });

  it('shows scan error when request fails', async () => {
    vi.mocked(api.getFavoriteDuplicates).mockRejectedValue(new Error('网络异常'));

    renderModal(true);

    await waitFor(() => {
      expect(screen.getByText(/网络异常/)).toBeDefined();
      expect(screen.getByText('重试检测')).toBeDefined();
    });
  });
});
