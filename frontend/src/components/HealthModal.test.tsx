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
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      writable: true,
      configurable: true,
    });
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
    expect(screen.getByText('开始全站体检')).toBeDefined();
  });

  it('handles stream progress events dynamically during check', async () => {
    vi.mocked(api.checkHealthStream).mockImplementation((onProgress) => {
      return new Promise((resolve) => {
        setTimeout(() => {
          onProgress({
            type: 'start',
            total_posts: 2,
            total_images: 2,
            scanned_images: 0,
            healthy_images: 0,
            broken_count: 0,
          });
          onProgress({
            type: 'progress',
            total_posts: 2,
            total_images: 2,
            scanned_images: 1,
            healthy_images: 1,
            broken_count: 0,
            current_url: 'https://example.com/cover1.jpg',
          });
          onProgress({
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

    const onSelectPost = vi.fn();
    const onClose = vi.fn();

    renderWithToast(
      <HealthModal
        isOpen={true}
        onClose={onClose}
        onSelectPostByPath={onSelectPost}
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

    // 测试前往修复按钮
    const fixBtn = screen.getByRole('button', { name: /前往修复配图/i });
    fireEvent.click(fixBtn);
    expect(onSelectPost).toHaveBeenCalledWith('/path/source/_posts/post2.md');
    expect(onClose).toHaveBeenCalled();
  });

  it('renders all-healthy success state when no broken images found', async () => {
    vi.mocked(api.checkHealthStream).mockImplementation((onProgress) => {
      return new Promise((resolve) => {
        setTimeout(() => {
          onProgress({
            type: 'done',
            total_posts: 2,
            total_images: 2,
            scanned_images: 2,
            healthy_images: 2,
            broken_count: 0,
            broken_reports: [],
            duration: '80ms',
          });
          resolve({
            total_posts: 2,
            total_images: 2,
            healthy_images: 2,
            broken_count: 0,
            broken_reports: [],
            duration: '80ms',
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
      expect(screen.getByText(/全站封面健康度 100%/i)).toBeDefined();
      expect(screen.getByText(/全站封面存活状态极佳/i)).toBeDefined();
    });
  });

  it('keeps the health check running in the background when the modal is closed', async () => {
    let aborted = false;
    let completed = false;
    let capturedSignal: AbortSignal | undefined;

    vi.mocked(api.checkHealthStream).mockImplementation((_onProgress, signal) => {
      capturedSignal = signal;
      return new Promise((resolve) => {
        if (signal) {
          signal.addEventListener('abort', () => {
            aborted = true;
          });
        }
        setTimeout(() => {
          completed = true;
          resolve({
            total_posts: 2,
            total_images: 2,
            healthy_images: 2,
            broken_count: 0,
            broken_reports: [],
            duration: '60ms',
          });
        }, 20);
      });
    });

    const view = renderWithToast(
      <HealthModal
        isOpen={true}
        onClose={vi.fn()}
        onSelectPostByPath={vi.fn()}
        posts={mockPosts}
      />
    );

    fireEvent.click(view.getByRole('button', { name: /开始全站体检/i }));
    await waitFor(() => {
      expect(view.getByRole('button', { name: /中止体检/i })).toBeDefined();
    });

    // 体检运行中关闭弹窗
    view.rerender(
      <ToastProvider>
        <HealthModal
          isOpen={false}
          onClose={vi.fn()}
          onSelectPostByPath={vi.fn()}
          posts={mockPosts}
        />
      </ToastProvider>
    );

    // 等待后台任务自然完成，期间不应被 abort
    await waitFor(() => {
      expect(completed).toBe(true);
    });
    expect(aborted).toBe(false);
    expect(capturedSignal?.aborted).toBe(false);

    // 重新打开弹窗，应展示后台已完成的体检结果
    view.rerender(
      <ToastProvider>
        <HealthModal
          isOpen={true}
          onClose={vi.fn()}
          onSelectPostByPath={vi.fn()}
          posts={mockPosts}
        />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(view.getByText(/全站封面健康度 100%/i)).toBeDefined();
      expect(view.getByText('重新开始体检')).toBeDefined();
    });
  });

  it('supports searching and filtering broken reports', async () => {
    vi.mocked(api.checkHealthStream).mockResolvedValue({
      total_posts: 2,
      total_images: 2,
      healthy_images: 0,
      broken_count: 2,
      broken_reports: [
        {
          post_title: '文章一号',
          file_path: '/path/post1.md',
          file_name: 'post1.md',
          field: 'index_img',
          url: 'https://example.com/broken404.jpg',
          status_code: 404,
          error: 'Not Found',
        },
        {
          post_title: '文章二号',
          file_path: '/path/post2.md',
          file_name: 'post2.md',
          field: 'banner_img',
          url: 'https://example.com/broken403.jpg',
          status_code: 403,
          error: 'Forbidden',
        },
      ],
      duration: '100ms',
    });

    renderWithToast(
      <HealthModal
        isOpen={true}
        onClose={vi.fn()}
        onSelectPostByPath={vi.fn()}
        posts={mockPosts}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /开始全站体检/i }));

    await waitFor(() => {
      expect(screen.getByText('文章一号')).toBeDefined();
      expect(screen.getByText('文章二号')).toBeDefined();
    });

    // 搜索过滤
    const searchInput = screen.getByPlaceholderText(/按文章标题、字段、URL 过滤/i);
    fireEvent.change(searchInput, { target: { value: '一号' } });

    expect(screen.getByText('文章一号')).toBeDefined();
    expect(screen.queryByText('文章二号')).toBeNull();

    // 清空搜索
    fireEvent.change(searchInput, { target: { value: '' } });
    expect(screen.getByText('文章二号')).toBeDefined();

    // 标签过滤 403
    const chip403 = screen.getByText(/403 防盗链/i);
    fireEvent.click(chip403);

    expect(screen.queryByText('文章一号')).toBeNull();
    expect(screen.getByText('文章二号')).toBeDefined();

    // 测试导出诊断报告
    const exportBtn = screen.getByRole('button', { name: /导出诊断报告/i });
    fireEvent.click(exportBtn);
    expect(navigator.clipboard.writeText).toHaveBeenCalled();
  });
});
