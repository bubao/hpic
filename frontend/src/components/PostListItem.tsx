import React from 'react';
import { PostInfo } from '../types';
import { Calendar, FileText, Folder } from 'lucide-react';

interface PostListItemProps {
  post: PostInfo;
  isSelected: boolean;
  isBroken: boolean;
  onSelect: (post: PostInfo) => void;
  onSelectCategory?: (category: string) => void;
}

export const PostListItem: React.FC<PostListItemProps> = ({
  post,
  isSelected,
  isBroken,
  onSelect,
  onSelectCategory,
}) => {
  let badgeClass = 'badge-missing';
  let badgeText = '待配图';
  let dotColor = '#94a3b8';

  if (isBroken) {
    badgeClass = 'badge-broken';
    badgeText = '配图失效';
    dotColor = '#ef4444';
  } else if (post.status === 'complete') {
    badgeClass = 'badge-complete';
    badgeText = '已配图';
    dotColor = '#10b981';
  } else if (post.status === 'partial') {
    badgeClass = 'badge-partial';
    badgeText = '部分配图';
    dotColor = '#f59e0b';
  }

  const primaryCat = (post.categories || '').split(/[,，]+/)[0]?.trim();
  const metaDateStr = (post.date || post.updated || '').substring(0, 10);

  return (
    <div
      className={`post-list-item ${isSelected ? 'selected' : ''} ${isBroken ? 'has-broken-cover' : ''}`}
      onClick={() => onSelect(post)}
    >
      <div className="item-row-header">
        <span className="post-title-text" title={post.title}>
          {post.is_draft ? (
            <span
              style={{
                fontSize: 10,
                color: '#f59e0b',
                background: 'rgba(245, 158, 11, 0.15)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                padding: '1px 5px',
                borderRadius: 4,
                marginRight: 6,
                fontWeight: 600,
                verticalAlign: '1px',
              }}
            >
              草稿
            </span>
          ) : post.file_path.includes('/source/_posts/') ? (
            <span
              style={{
                fontSize: 10,
                color: '#60a5fa',
                background: 'rgba(96, 165, 250, 0.12)',
                border: '1px solid rgba(96, 165, 250, 0.25)',
                padding: '1px 5px',
                borderRadius: 4,
                marginRight: 6,
                fontWeight: 500,
                verticalAlign: '1px',
              }}
            >
              文章
            </span>
          ) : null}
          {post.title}
        </span>
        <span className={`post-badge ${badgeClass}`}>
          <span className="badge-indicator-dot" style={{ backgroundColor: dotColor }} />
          {badgeText}
        </span>
      </div>

      <div className="item-row-meta">
        {metaDateStr && (
          <span className="meta-date">
            <Calendar size={11} />
            {metaDateStr}
          </span>
        )}
        {primaryCat && (
          <span
            className="post-category-tag"
            title={`分类: ${post.categories}`}
            onClick={e => {
              e.stopPropagation();
              onSelectCategory?.(primaryCat);
            }}
          >
            <Folder size={10} style={{ opacity: 0.8 }} />
            {primaryCat}
          </span>
        )}
        <span className="meta-filename" title={post.file_path}>
          <FileText size={10} style={{ marginRight: 3, verticalAlign: 'middle', opacity: 0.7 }} />
          {post.file_name}
        </span>
      </div>
    </div>
  );
};
