import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { PostHistoryModal } from './PostHistoryModal';
import { api } from '../api';
import { ToastProvider } from '../context/ToastContext';
import { PostInfo, OperationRecord } from '../types';

vi.mock('../api', () => ({
  api: {
    getPostHistory: vi.fn(),
    getGlobalHistory: vi.fn(),
    undoPostOperation: vi.fn(),
    deletePostHistory: vi.fn(),
    clearPostHistory: vi.fn(),
  },
}));

describe('PostHistoryModal Component', () => {
  const mockPost: PostInfo = {
    file_path: '/blog/source/_posts/test.md',
    file_name: 'test.md',
    title: '测试历史博文',
    date: '2026-11-01',
    updated: '2026-11-01',
    categories: '',
    tags: '',
    images: { index_img: 'https://example.com/new.jpg' },
    has_all_images: true,
    status: 'complete',
    mod_time: '',
  };

  const mockRecords: OperationRecord[] = [
    {
      id: 101,
      file_path: '/blog/source/_posts/test.md',
      post_title: '测试历史博文',
      operation_type: 'update_cover',
      field: 'index_img',
      old_value: 'https://example.com/old.jpg',
      new_value: 'https://example.com/new.jpg',
      created_at: '2026-11-05T12:00:00Z',
      is_undone: false,
    },
    {
      id: 100,
      file_path: '/blog/source/_posts/test.md',
      post_title: '测试历史博文',
      operation_type: 'clear_cover',
      field: 'banner_img',
      old_value: 'https://example.com/prev_banner.jpg',
      new_value: '',
      created_at: '2026-11-05T11:00:00Z',
      is_undone: true,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = (isOpen = true) => {
    return render(
      <ToastProvider>
        <PostHistoryModal
          isOpen={isOpen}
          onClose={vi.fn()}
          post={mockPost}
          onPostUpdated={vi.fn()}
        />
      </ToastProvider>
    );
  };

  it('renders nothing when closed', () => {
    renderComponent(false);
    expect(screen.queryByText('文章封面变更历史')).toBeNull();
  });

  it('loads and renders history records correctly', async () => {
    vi.mocked(api.getPostHistory).mockResolvedValue({
      success: true,
      history: mockRecords,
    });

    renderComponent(true);

    expect(screen.getByText('测试历史博文')).toBeDefined();
    await waitFor(() => {
      expect(screen.getByText('替换封面')).toBeDefined();
      expect(screen.getByText('清空封面')).toBeDefined();
      expect(screen.getByText('生效中')).toBeDefined();
      expect(screen.getByText('已撤销')).toBeDefined();
    });
  });

  it('global mode groups batch records and rolls back the whole batch', async () => {
    const batchRecord: OperationRecord = {
      ...mockRecords[0],
      id: 201,
      batch_id: 9001,
    };
    const batchRecord2: OperationRecord = {
      ...mockRecords[0],
      id: 202,
      batch_id: 9001,
      field: 'banner_img',
    };
    vi.mocked(api.getGlobalHistory).mockResolvedValue({
      success: true,
      history: [batchRecord, batchRecord2],
    });
    vi.mocked(api.undoPostOperation).mockResolvedValue({
      success: true,
      post: mockPost,
    });

    render(
      <ToastProvider>
        <PostHistoryModal
          isOpen={true}
          onClose={vi.fn()}
          post={mockPost}
          mode="global"
          onPostUpdated={vi.fn()}
        />
      </ToastProvider>
    );

    expect(screen.getByText('全部文章操作历史')).toBeDefined();
    await waitFor(() => {
      expect(screen.getByText('批次 9001')).toBeDefined();
      expect(screen.getByText('撤销整批')).toBeDefined();
      expect(screen.getByText('2 条记录')).toBeDefined();
    });

    fireEvent.click(screen.getByText('撤销整批'));

    await waitFor(() => {
      expect(api.undoPostOperation).toHaveBeenCalledWith(mockPost.file_path, 201);
    });
  });

  it('triggers rollback when clicking rollback button', async () => {
    vi.mocked(api.getPostHistory).mockResolvedValue({
      success: true,
      history: mockRecords,
    });
    vi.mocked(api.undoPostOperation).mockResolvedValue({
      success: true,
      post: mockPost,
    });

    renderComponent(true);

    await waitFor(() => {
      expect(screen.getByText('撤销回退至此时')).toBeDefined();
    });

    const rollbackBtn = screen.getByText('撤销回退至此时');
    fireEvent.click(rollbackBtn);

    await waitFor(() => {
      expect(api.undoPostOperation).toHaveBeenCalledWith(mockPost.file_path, 101);
    });
  });
});
