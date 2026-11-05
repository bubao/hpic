import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Sidebar } from './Sidebar';
import { PostInfo } from '../types';

describe('Sidebar component tests', () => {
  const dummyPosts: PostInfo[] = [
    {
      title: 'First Post',
      file_name: 'first-post.md',
      file_path: '/posts/first-post.md',
      date: '2026-11-05',
      updated: '2026-11-05',
      mod_time: '2026-11-05',
      is_draft: false,
      categories: 'Tech',
      tags: 'hexo,guide',
      images: { index_img: 'https://example.com/cover1.jpg' },
      has_all_images: true,
      status: 'complete',
    },
    {
      title: 'Second Draft',
      file_name: 'second-draft.md',
      file_path: '/drafts/second-draft.md',
      date: '2026-11-05',
      updated: '2026-11-05',
      mod_time: '2026-11-05',
      is_draft: true,
      categories: 'Life',
      tags: 'daily',
      images: {},
      has_all_images: false,
      status: 'missing',
    },
  ];

  it('should render search input and refresh button', () => {
    const handleRefresh = vi.fn();
    render(
      <Sidebar
        posts={dummyPosts}
        selectedPost={dummyPosts[0]}
        onSelectPost={vi.fn()}
        searchQuery=""
        onSearchChange={vi.fn()}
        sortBy="date_desc"
        onSortChange={vi.fn()}
        brokenPostPaths={new Set()}
        onRefreshPosts={handleRefresh}
      />
    );

    const searchInput = screen.getByPlaceholderText('搜索标题、分类或标签...');
    expect(searchInput).toBeDefined();

    const refreshBtn = screen.getByTitle('重新扫描并刷新博文列表 (快捷同步外部新建/修改的文章)');
    expect(refreshBtn).toBeDefined();

    fireEvent.click(refreshBtn);
    expect(handleRefresh).toHaveBeenCalledTimes(1);
  });

  it('should disable refresh button and apply spinning animation when isRefreshing is true', () => {
    const handleRefresh = vi.fn();
    render(
      <Sidebar
        posts={dummyPosts}
        selectedPost={dummyPosts[0]}
        onSelectPost={vi.fn()}
        searchQuery=""
        onSearchChange={vi.fn()}
        sortBy="date_desc"
        onSortChange={vi.fn()}
        brokenPostPaths={new Set()}
        isRefreshing={true}
        onRefreshPosts={handleRefresh}
      />
    );

    const refreshBtn = screen.getByTitle('重新扫描并刷新博文列表 (快捷同步外部新建/修改的文章)') as HTMLButtonElement;
    expect(refreshBtn.disabled).toBe(true);
    expect(refreshBtn.classList.contains('spinning')).toBe(true);
  });

  it('should filter posts by search query', () => {
    const handleSearch = vi.fn();
    render(
      <Sidebar
        posts={dummyPosts}
        selectedPost={dummyPosts[0]}
        onSelectPost={vi.fn()}
        searchQuery="First"
        onSearchChange={handleSearch}
        sortBy="date_desc"
        onSortChange={vi.fn()}
        brokenPostPaths={new Set()}
      />
    );

    expect(screen.getByText('First Post')).toBeDefined();
    expect(screen.queryByText('Second Draft')).toBeNull();
  });

  it('should mark the selected post with active and selected class', () => {
    const handleSelect = vi.fn();
    const { container } = render(
      <Sidebar
        posts={dummyPosts}
        selectedPost={dummyPosts[1]}
        onSelectPost={handleSelect}
        searchQuery=""
        onSearchChange={vi.fn()}
        sortBy="date_desc"
        onSortChange={vi.fn()}
        brokenPostPaths={new Set()}
      />
    );

    const items = container.querySelectorAll('.post-list-item');
    expect(items.length).toBe(2);
    expect(items[0].classList.contains('selected')).toBe(false);
    expect(items[1].classList.contains('selected')).toBe(true);
    expect(items[1].classList.contains('active')).toBe(true);

    fireEvent.click(items[0]);
    expect(handleSelect).toHaveBeenCalledWith(dummyPosts[0]);
  });
});
