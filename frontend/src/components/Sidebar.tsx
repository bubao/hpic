import React, { useState, useMemo, useEffect } from 'react';
import { PostInfo } from '../types';
import { Search, FileText, X, RotateCw, FilePlus } from 'lucide-react';
import { PostListItem } from './PostListItem';

export type ArticleScope = 'all' | 'posts' | 'drafts';
export type CoverStatusFilter = 'all' | 'missing' | 'complete' | 'broken';

interface SidebarProps {
  posts: PostInfo[];
  selectedPost: PostInfo | null;
  onSelectPost: (post: PostInfo) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  sortBy: string;
  onSortChange: (sort: string) => void;
  brokenPostPaths: Set<string>;
  isRefreshing?: boolean;
  onRefreshPosts?: () => void;
  onOpenCreatePost?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  posts,
  selectedPost,
  onSelectPost,
  searchQuery,
  onSearchChange,
  sortBy,
  onSortChange,
  brokenPostPaths,
  isRefreshing = false,
  onRefreshPosts,
  onOpenCreatePost,
}) => {
  // 层级一：文章范围维度 (全部 / 正式文章 / 本地草稿)
  const [scopeTab, setScopeTab] = useState<ArticleScope>('all');

  // 层级二：配图状态维度 (全部状态 / 待配图 / 已完成 / 失效)
  const [statusTab, setStatusTab] = useState<CoverStatusFilter>('all');

  // 分类筛选
  const [selectedCategory, setSelectedCategory] = useState<string>('');

  // 搜索关键词防抖支持 (优化大体量博文库快速键入时的渲染性能)
  const [localSearchQuery, setLocalSearchQuery] = useState(searchQuery);

  useEffect(() => {
    setLocalSearchQuery(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearchQuery !== searchQuery) {
        onSearchChange(localSearchQuery);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [localSearchQuery, searchQuery, onSearchChange]);

  // 1. 统计文章分类及其包含数量
  const categoryStats = useMemo(() => {
    const counts = new Map<string, number>();
    let uncategorized = 0;

    for (const p of posts) {
      const catStr = (p.categories || '').trim();
      if (!catStr) {
        uncategorized++;
        continue;
      }
      const cats = catStr.split(/[,，]+/).map(c => c.trim()).filter(Boolean);
      if (cats.length === 0) {
        uncategorized++;
      } else {
        for (const c of cats) {
          counts.set(c, (counts.get(c) || 0) + 1);
        }
      }
    }

    const list = Array.from(counts.entries()).map(([name, count]) => ({ name, count }));
    list.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    return { list, uncategorized };
  }, [posts]);

  // 2. 统计文章范围维度 (层级一)
  const countAll = posts.length;
  const countPosts = useMemo(() => posts.filter(p => !p.is_draft).length, [posts]);
  const countDrafts = useMemo(() => posts.filter(p => p.is_draft).length, [posts]);

  // 3. 在当前选定 Scope 下，动态计算配图状态统计 (层级二，正交联动)
  const scopePosts = useMemo(() => {
    if (scopeTab === 'posts') return posts.filter(p => !p.is_draft);
    if (scopeTab === 'drafts') return posts.filter(p => p.is_draft);
    return posts;
  }, [posts, scopeTab]);

  const countMissingInScope = useMemo(() => scopePosts.filter(p => !p.has_all_images).length, [scopePosts]);
  const countCompleteInScope = useMemo(() => scopePosts.filter(p => p.has_all_images).length, [scopePosts]);
  const countBrokenInScope = useMemo(() => scopePosts.filter(p => brokenPostPaths.has(p.file_path)).length, [scopePosts, brokenPostPaths]);

  // 4. 双层正交组合过滤 + 分类过滤 + 多维模糊检索
  const filteredPosts = useMemo(() => {
    return posts.filter(p => {
      // (1) 文章范围层级过滤
      if (scopeTab === 'posts' && p.is_draft) return false;
      if (scopeTab === 'drafts' && !p.is_draft) return false;

      // (2) 封面配图层级过滤
      if (statusTab === 'missing' && p.has_all_images) return false;
      if (statusTab === 'complete' && !p.has_all_images) return false;
      if (statusTab === 'broken' && !brokenPostPaths.has(p.file_path)) return false;

      // (3) 分类过滤
      if (selectedCategory) {
        if (selectedCategory === '__uncategorized__') {
          if ((p.categories || '').trim() !== '') return false;
        } else {
          const pCats = (p.categories || '').toLowerCase();
          if (!pCats.includes(selectedCategory.toLowerCase())) return false;
        }
      }

      // (4) 智能搜索过滤 (支持标题、文件名、分类、标签任意字段模糊匹配)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTitle = (p.title || '').toLowerCase().includes(q);
        const matchFile = (p.file_name || '').toLowerCase().includes(q);
        const matchCat = (p.categories || '').toLowerCase().includes(q);
        const matchTags = (p.tags || '').toLowerCase().includes(q);
        if (!matchTitle && !matchFile && !matchCat && !matchTags) return false;
      }

      return true;
    });
  }, [posts, scopeTab, statusTab, selectedCategory, searchQuery, brokenPostPaths]);

  return (
    <aside className="app-sidebar">
      <div className="sidebar-header">
        {/* 搜索栏与刷新按钮：支持标题分类检索与一键重新扫描 */}
        <div className="search-row">
          <div className="search-wrap">
            <Search size={14} className="search-icon" />
            <input
              type="text"
              className="search-input"
              placeholder="搜索标题、分类或标签..."
              value={localSearchQuery}
              onChange={e => setLocalSearchQuery(e.target.value)}
            />
            {localSearchQuery && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => {
                  setLocalSearchQuery('');
                  onSearchChange('');
                }}
                title="清空搜索"
              >
                <X size={12} />
              </button>
            )}
          </div>
          {onRefreshPosts && (
            <button
              type="button"
              className={`btn-sidebar-refresh ${isRefreshing ? 'spinning' : ''}`}
              onClick={onRefreshPosts}
              disabled={isRefreshing}
              title="重新扫描并刷新博文列表 (快捷同步外部新建/修改的文章)"
            >
              <RotateCw size={13} />
            </button>
          )}
          {onOpenCreatePost && (
            <button
              type="button"
              className="btn btn-primary btn-sm btn-sidebar-create"
              onClick={onOpenCreatePost}
              title="新建文章或本地草稿"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 32, padding: '0 8px', flexShrink: 0 }}
            >
              <FilePlus size={13} />
              <span>新建</span>
            </button>
          )}
        </div>

        {/* 分类筛选与排序方式并排下拉框 */}
        <div className="filter-controls-row">
          <select
            className="sort-select"
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
            title="按博客分类筛选"
          >
            <option value="">全部分类 ({posts.length})</option>
            {categoryStats.list.map(c => (
              <option key={c.name} value={c.name}>
                {c.name} ({c.count})
              </option>
            ))}
            {categoryStats.uncategorized > 0 && (
              <option value="__uncategorized__">
                未分类 ({categoryStats.uncategorized})
              </option>
            )}
          </select>

          <select
            className="sort-select"
            value={sortBy}
            onChange={e => onSortChange(e.target.value)}
            title="选择文章排序方式"
          >
            <option value="date_desc">发布时间 (最新)</option>
            <option value="date_asc">发布时间 (最早)</option>
            <option value="updated_desc">更新时间 (最新)</option>
            <option value="mtime_desc">文件保存 (最近)</option>
            <option value="missing_first">缺封面置顶</option>
            <option value="title_asc">标题 (A - Z)</option>
          </select>
        </div>

        {/* 层级一：文章类型与范围分段控制器 (全部 / 正式文章 / 草稿) */}
        <div className="scope-segmented-bar">
          <button
            type="button"
            className={`scope-segment-btn ${scopeTab === 'all' ? 'active' : ''}`}
            onClick={() => setScopeTab('all')}
          >
            全部 <span className="tab-count-badge">{countAll}</span>
          </button>
          <button
            type="button"
            className={`scope-segment-btn ${scopeTab === 'posts' ? 'active' : ''}`}
            onClick={() => setScopeTab('posts')}
          >
            正式文章 <span className="tab-count-badge">{countPosts}</span>
          </button>
          <button
            type="button"
            className={`scope-segment-btn ${scopeTab === 'drafts' ? 'active' : ''}`}
            onClick={() => setScopeTab('drafts')}
          >
            草稿 <span className="tab-count-badge">{countDrafts}</span>
          </button>
        </div>

        {/* 层级二：配图状态维度胶囊过滤 (与层级一正交组合) */}
        <div className="filter-pill-tabs">
          <button
            type="button"
            className={`filter-pill ${statusTab === 'all' ? 'active' : ''}`}
            onClick={() => setStatusTab('all')}
          >
            全部 <span className="tab-count-badge">{scopePosts.length}</span>
          </button>
          <button
            type="button"
            className={`filter-pill ${statusTab === 'missing' ? 'active' : ''}`}
            onClick={() => setStatusTab('missing')}
          >
            待配图 <span className="tab-count-badge">{countMissingInScope}</span>
          </button>
          <button
            type="button"
            className={`filter-pill ${statusTab === 'complete' ? 'active' : ''}`}
            onClick={() => setStatusTab('complete')}
          >
            已完成 <span className="tab-count-badge">{countCompleteInScope}</span>
          </button>
          {countBrokenInScope > 0 && (
            <button
              type="button"
              className={`filter-pill broken-pill-tab ${statusTab === 'broken' ? 'active' : ''}`}
              onClick={() => setStatusTab('broken')}
              title="当前范围内封面链接返回 404 或失效的文章"
            >
              失效 <span className="tab-count-badge">{countBrokenInScope}</span>
            </button>
          )}
        </div>
      </div>

      {/* 文章卡片垂直滚动列表 */}
      <div className="posts-list-scroll">
        {filteredPosts.length === 0 ? (
          <div className="empty-hint" style={{ padding: '32px 16px', textAlign: 'center' }}>
            <FileText size={28} style={{ opacity: 0.3, marginBottom: 8 }} />
            <div>暂无匹配文章</div>
            {(selectedCategory || searchQuery || statusTab !== 'all' || scopeTab !== 'all') && (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                style={{ marginTop: 10, fontSize: 11 }}
                onClick={() => {
                  setScopeTab('all');
                  setStatusTab('all');
                  setSelectedCategory('');
                  onSearchChange('');
                }}
              >
                重置所有筛选条件
              </button>
            )}
          </div>
        ) : (
          filteredPosts.map(p => (
            <PostListItem
              key={p.file_path}
              post={p}
              isSelected={selectedPost?.file_path === p.file_path}
              isBroken={brokenPostPaths.has(p.file_path)}
              onSelect={onSelectPost}
              onSelectCategory={cat => setSelectedCategory(cat)}
            />
          ))
        )}
      </div>
    </aside>
  );
};
