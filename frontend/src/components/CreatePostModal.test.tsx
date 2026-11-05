import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { CreatePostModal } from './CreatePostModal';
import { api } from '../api';
import { ToastProvider } from '../context/ToastContext';

vi.mock('../api', () => ({
  api: {
    createPost: vi.fn(),
  },
}));

describe('CreatePostModal Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderWithToast = (ui: React.ReactElement) => {
    return render(<ToastProvider>{ui}</ToastProvider>);
  };

  it('renders modal with title input and post/draft toggles', () => {
    renderWithToast(
      <CreatePostModal
        isOpen={true}
        onClose={vi.fn()}
        onPostCreated={vi.fn()}
      />
    );

    expect(screen.getByPlaceholderText(/探索 Hexo 现代化配图最佳实践/i)).toBeDefined();
    expect(screen.getByText('正式文章 (_posts)')).toBeDefined();
    expect(screen.getByText('本地草稿 (_drafts)')).toBeDefined();
  });

  it('submits create post successfully', async () => {
    const handleCreated = vi.fn();
    const handleClose = vi.fn();
    (api.createPost as any).mockResolvedValueOnce({
      success: true,
      post: {
        file_path: '/path/source/_posts/test.md',
        file_name: 'test.md',
        title: '我的测试文章',
        status: 'missing',
        images: {},
      },
    });

    renderWithToast(
      <CreatePostModal
        isOpen={true}
        onClose={handleClose}
        onPostCreated={handleCreated}
      />
    );

    const input = screen.getByPlaceholderText(/探索 Hexo 现代化配图最佳实践/i);
    fireEvent.change(input, { target: { value: '我的测试文章' } });

    const submitBtn = screen.getByRole('button', { name: /创建正式文章/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.createPost).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '我的测试文章',
          is_draft: false,
        })
      );
      expect(handleCreated).toHaveBeenCalled();
      expect(handleClose).toHaveBeenCalled();
    });
  });

  it('toggles to draft mode properly', async () => {
    const handleCreated = vi.fn();
    (api.createPost as any).mockResolvedValueOnce({
      success: true,
      post: {
        file_path: '/path/source/_drafts/my-draft.md',
        title: '我的草稿',
        is_draft: true,
      },
    });

    renderWithToast(
      <CreatePostModal
        isOpen={true}
        onClose={vi.fn()}
        onPostCreated={handleCreated}
      />
    );

    // 点击切换为本地草稿
    const draftToggle = screen.getByText('本地草稿 (_drafts)');
    fireEvent.click(draftToggle);

    const input = screen.getByPlaceholderText(/探索 Hexo 现代化配图最佳实践/i);
    fireEvent.change(input, { target: { value: '我的草稿' } });

    const submitBtn = screen.getByRole('button', { name: /创建草稿/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.createPost).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '我的草稿',
          is_draft: true,
        })
      );
    });
  });
});
