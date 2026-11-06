import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { usePostList } from './usePostList';
import { api } from '../api';
import { ToastProvider } from '../context/ToastContext';
import { PostInfo } from '../types';

vi.mock('../api', () => ({
  api: {
    getPosts: vi.fn(),
    getPostsStatus: vi.fn(),
    getPostHistory: vi.fn(),
  },
}));

describe('usePostList Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ToastProvider>{children}</ToastProvider>
  );

  const mockPosts: PostInfo[] = [
    {
      file_path: '/path/to/hello.md',
      file_name: 'hello.md',
      title: '你好世界',
      date: '2026-11-01',
      updated: '2026-11-01',
      categories: '技术',
      tags: 'Go, Hexo',
      images: { index_img: 'https://example.com/cover1.jpg' },
      index_img: 'https://example.com/cover1.jpg',
      has_all_images: true,
      status: 'complete',
      is_draft: false,
      mod_time: '2026-11-01T10:00:00Z',
    },
    {
      file_path: '/path/to/second.md',
      file_name: 'second.md',
      title: '第二篇文章',
      date: '2026-11-02',
      updated: '2026-11-02',
      categories: '生活',
      tags: '随笔',
      images: {},
      has_all_images: false,
      status: 'missing',
      is_draft: true,
      mod_time: '2026-11-02T10:00:00Z',
    },
  ];

  it('initializes with default empty state', () => {
    const { result } = renderHook(() => usePostList({ autoSync: false }), { wrapper });

    expect(result.current.posts).toEqual([]);
    expect(result.current.selectedPost).toBeNull();
    expect(result.current.searchQuery).toBe('');
    expect(result.current.sortBy).toBe('date_desc');
  });

  it('refreshes posts and selects first post if none selected', async () => {
    (api.getPosts as any).mockResolvedValueOnce({
      success: true,
      posts: mockPosts,
      total: 2,
      last_modified: 1000,
    });

    const { result } = renderHook(() => usePostList({ autoSync: false }), { wrapper });

    await act(async () => {
      await result.current.handleRefreshPosts(true);
    });

    expect(result.current.posts).toHaveLength(2);
    expect(result.current.selectedPost?.title).toBe('你好世界');
  });

  it('preserves currently selected post during refresh', async () => {
    (api.getPosts as any).mockResolvedValueOnce({
      success: true,
      posts: mockPosts,
      total: 2,
      last_modified: 1000,
    });

    const { result } = renderHook(() => usePostList({ autoSync: false }), { wrapper });

    await act(async () => {
      await result.current.handleRefreshPosts(true);
    });

    // Select the second post
    act(() => {
      result.current.setSelectedPost(mockPosts[1]);
    });
    expect(result.current.selectedPost?.file_path).toBe(mockPosts[1].file_path);

    // Refresh with externally modified content for second post
    const modifiedPosts = [
      mockPosts[0],
      {
        ...mockPosts[1],
        title: '第二篇文章 (Obsidian 外部更新)',
        images: { index_img: 'https://example.com/new-cover.jpg' },
      },
    ];
    (api.getPosts as any).mockResolvedValueOnce({
      success: true,
      posts: modifiedPosts,
      total: 2,
      last_modified: 2000,
    });

    await act(async () => {
      await result.current.handleRefreshPosts(true);
    });

    // Verify second post is still selected and reflects new changes
    expect(result.current.selectedPost?.file_path).toBe(mockPosts[1].file_path);
    expect(result.current.selectedPost?.title).toBe('第二篇文章 (Obsidian 外部更新)');
  });

  it('updates selected post and keeps selection on update', async () => {
    const { result } = renderHook(() => usePostList({ autoSync: false }), { wrapper });

    act(() => {
      result.current.setSelectedPost(mockPosts[0]);
    });

    expect(result.current.selectedPost?.title).toBe('你好世界');

    const updatedPost: PostInfo = {
      ...mockPosts[0],
      images: { index_img: 'https://example.com/updated.jpg' },
      index_img: 'https://example.com/updated.jpg',
    };

    act(() => {
      result.current.handleUpdatePost(updatedPost);
    });

    expect(result.current.selectedPost?.images.index_img).toBe('https://example.com/updated.jpg');
  });

  it('loads post history for selected post', async () => {
    (api.getPostHistory as any).mockResolvedValueOnce({
      success: true,
      history: [
        {
          id: 1,
          file_path: '/path/to/hello.md',
          post_title: '你好世界',
          operation_type: 'update_cover',
          field: 'index_img',
          old_value: '',
          new_value: 'https://example.com/cover1.jpg',
          created_at: '2026-11-01T10:00:00Z',
          is_undone: false,
        },
      ],
    });

    const { result } = renderHook(() => usePostList({ autoSync: false }), { wrapper });

    await act(async () => {
      await result.current.loadPostHistory('/path/to/hello.md');
    });

    expect(result.current.postHistory).toHaveLength(1);
    expect(result.current.postHistory[0].operation_type).toBe('update_cover');
  });

  it('detects external changes on checkPostsChange and refreshes list seamlessly', async () => {
    // 1. Initial status query
    (api.getPostsStatus as any).mockResolvedValueOnce({
      success: true,
      last_modified: 1000,
      count: 2,
    });

    const { result } = renderHook(() => usePostList({ autoSync: false }), { wrapper });

    // Initial check initializes baseline
    await act(async () => {
      await result.current.checkPostsChange();
    });
    expect(api.getPosts).not.toHaveBeenCalled();

    // 2. Second check with same status: no refresh
    (api.getPostsStatus as any).mockResolvedValueOnce({
      success: true,
      last_modified: 1000,
      count: 2,
    });
    await act(async () => {
      await result.current.checkPostsChange();
    });
    expect(api.getPosts).not.toHaveBeenCalled();

    // 3. Third check with changed last_modified: triggers refresh!
    (api.getPostsStatus as any).mockResolvedValueOnce({
      success: true,
      last_modified: 2500,
      count: 2,
    });
    (api.getPosts as any).mockResolvedValueOnce({
      success: true,
      posts: mockPosts,
      total: 2,
      last_modified: 2500,
    });

    await act(async () => {
      await result.current.checkPostsChange();
    });
    expect(api.getPosts).toHaveBeenCalledTimes(1);
  });

  it('triggers checkPostsChange on window focus', async () => {
    // Baseline status
    (api.getPostsStatus as any).mockResolvedValueOnce({
      success: true,
      last_modified: 1000,
      count: 2,
    });

    const { result } = renderHook(() => usePostList({ autoSync: true, pollingInterval: 60000 }), { wrapper });

    // Establish baseline
    await act(async () => {
      await result.current.checkPostsChange();
    });

    // Mock external change
    (api.getPostsStatus as any).mockResolvedValueOnce({
      success: true,
      last_modified: 3000,
      count: 2,
    });
    (api.getPosts as any).mockResolvedValueOnce({
      success: true,
      posts: mockPosts,
      total: 2,
      last_modified: 3000,
    });

    // Simulate switching back from VS Code / Obsidian to hpic window
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(api.getPosts).toHaveBeenCalled();
  });

  it('triggers checkPostsChange on background polling interval', async () => {
    vi.useFakeTimers();

    (api.getPostsStatus as any).mockResolvedValue({
      success: true,
      last_modified: 1000,
      count: 2,
    });

    renderHook(() => usePostList({ autoSync: true, pollingInterval: 5000 }), { wrapper });

    // First interval tick initializes baseline
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    // Next tick with new timestamp
    (api.getPostsStatus as any).mockResolvedValue({
      success: true,
      last_modified: 4000,
      count: 2,
    });
    (api.getPosts as any).mockResolvedValue({
      success: true,
      posts: mockPosts,
      total: 2,
      last_modified: 4000,
    });

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(api.getPosts).toHaveBeenCalled();
    vi.useRealTimers();
  });

  // --- 组件卸载保护测试 (isMountedRef) ---

  it('does not update state after unmount (loadPostHistory)', async () => {
    // 延迟 resolve，模拟慢速网络
    let resolvePromise: (value: any) => void;
    (api.getPostHistory as any).mockImplementationOnce(
      () => new Promise(resolve => { resolvePromise = resolve; })
    );

    const { result, unmount } = renderHook(() => usePostList({ autoSync: false }), { wrapper });

    // 启动加载
    act(() => {
      result.current.loadPostHistory('/path/to/hello.md');
    });

    // 在请求完成前卸载组件
    unmount();

    // 现在 resolve 请求 — 这将尝试 setState，但组件已卸载
    resolvePromise!({ success: true, history: [] });

    // 如果运行到这里没有抛出 "Can't perform React state update on unmounted component"，测试通过
    // 给微任务队列一个 tick 让异步回调完成
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  });

  it('does not update state after unmount (handleRefreshPosts)', async () => {
    let resolvePromise: (value: any) => void;
    (api.getPosts as any).mockImplementationOnce(
      () => new Promise(resolve => { resolvePromise = resolve; })
    );

    const { result, unmount } = renderHook(() => usePostList({ autoSync: false }), { wrapper });

    // 启动刷新
    act(() => {
      result.current.handleRefreshPosts(true);
    });

    // 在请求完成前卸载组件
    unmount();

    // resolve 请求
    resolvePromise!({ success: true, posts: mockPosts, total: 2 });

    // 如果运行到这里没有报错，说明 isMountedRef 保护生效
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  });
});
