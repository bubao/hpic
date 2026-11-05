import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { HealthModal } from './HealthModal';
import { api } from '../api';
import { ToastProvider } from '../context/ToastContext';
import { PostInfo } from '../types';

vi.mock('../api', () => ({
  api: {
    checkHealthStream: vi.fn(),
  },
}));

describe('HealthModal Component', () => {
  const mockPosts: PostInfo[] = [
    {
      file_path: '/path/source/_posts/post1.md',
      file_name: 'post1.md',
      title: '文章一',
      date: '2026-01-01',
      updated: '2026-01-01',
      categories: '',
      tags: '',
      images: { index_img: 'https://example.com/cover1.jpg' },
      has_all_images: true,
      status: 'complete',
      mod_time: '',
    },
    {
      file_path: '/path/source/_posts/post2.md',
      file_name: 'post2.md',
      title: '文章二',
      date: '2026-01-02',
      updated: '2026-01-02',
      categories: '',
      tags: '',
      images: { index_img: 'https://example.com/broken.jpg' },
      has_all_images: true,
      status: 'complete',
      mod_time: '',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderWithToast = (ui: React.ReactElement) => {
    return render(<ToastProvider>{ui}</ToastProvider>);
  };

  it('renders stats row immediately even before check runs', () => {
    renderWithToast(
      <HealthModal
        isOpen={true}
        onClose={vi.fn()}
        onSelectPostByPath={vi.fn()}
        posts={mockPosts}
      />
    );

    // 扫描文章、总封面数、正常有效、失败数量直接显示出来
    expect(screen.getByText('扫描文章')).toBeDefined();
    expect(screen.getByText('总封面数')).toBeDefined();
    expect(screen.getByText('正常有效')).toBeDefined();
    expect(screen.getByText('失败数量')).toBeDefined();

    // 预估的文章总数与总封面数均应显示为 2
    expect(screen.getAllByText('2').length).toBe(2);
    expect(screen.getByText('开始全站体检')).toBeDefined();
  });

  it('handles stream progress events dynamically during check', async () => {
    let progressCallback: any = null;
    (api.checkHealthStream as any).mockImplementation((cb: any) => {
      progressCallback = cb;
      return new Promise((resolve) => {
        // 模拟流式事件推送
        setTimeout(() => {
          cb({
            type: 'start',
            total_posts: 2,
            total_images: 2,
            scanned_images: 0,
            healthy_images: 0,
            broken_count: 0,
          });
          cb({
            type: 'progress',
            total_posts: 2,
            total_images: 2,
            scanned_images: 1,
            healthy_images: 1,
            broken_count: 0,
            current_url: 'https://example.com/cover1.jpg',
          });
          cb({
            type: 'progress',
            total_posts: 2,
            total_images: 2,
            scanned_images: 2,
            healthy_images: 1,
            broken_count: 1,
            current_url: 'https://example.com/broken.jpg',
            last_report: {
              post_title: '文章二',
              file_path: '/path/source/_posts/post2.md',
              file_name: 'post2.md',
              field: 'index_img',
              url: 'https://example.com/broken.jpg',
              status_code: 404,
              error: 'Not Found',
            },
          });
          resolve({
            total_posts: 2,
            total_images: 2,
            healthy_images: 1,
            broken_count: 1,
            broken_reports: [
              {
                post_title: '文章二',
                file_path: '/path/source/_posts/post2.md',
                file_name: 'post2.md',
                field: 'index_img',
                url: 'https://example.com/broken.jpg',
                status_code: 404,
                error: 'Not Found',
              },
            ],
            duration: '150ms',
          });
        }, 10);
      });
    });

    renderWithToast(
      <HealthModal
        isOpen={true}
        onClose={vi.fn()}
        onSelectPostByPath={vi.fn()}
        posts={mockPosts}
      />
    );

    const startBtn = screen.getByRole('button', { name: /开始全站体检/i });
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(screen.getByText(/文章二/i)).toBeDefined();
      expect(screen.getByText('HTTP 404')).toBeDefined();
      expect(screen.getByText('重新开始体检')).toBeDefined();
    });
  });
});
