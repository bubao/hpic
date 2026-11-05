import React from 'react';
import { FolderGit2, FolderOpen, Loader2, FileText } from 'lucide-react';

interface BlogTabProps {
  hexoDir: string;
  setHexoDir: (val: string) => void;
  coverFields: string;
  setCoverFields: (val: string) => void;
  dateField: string;
  setDateField: (val: string) => void;
  updatedField: string;
  setUpdatedField: (val: string) => void;
  autoSearch: boolean;
  setAutoSearch: (val: boolean) => void;
  isBrowsingDir: boolean;
  handleBrowseDir: () => void;
  computedPostsDir: string;
  computedDraftsDir: string;
}

export const BlogTab: React.FC<BlogTabProps> = ({
  hexoDir,
  setHexoDir,
  coverFields,
  setCoverFields,
  dateField,
  setDateField,
  updatedField,
  setUpdatedField,
  autoSearch,
  setAutoSearch,
  isBrowsingDir,
  handleBrowseDir,
  computedPostsDir,
  computedDraftsDir,
}) => {
  return (
    <>
      <div className="settings-card">
        <div className="settings-card-title">
          <FolderGit2 size={16} style={{ color: 'var(--accent-color)' }} />
          <span>Hexo 博客根目录关联</span>
        </div>

        <div className="form-group">
          <label className="form-label">Hexo 博客根目录 (hexo_dir):</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              className="form-input"
              value={hexoDir}
              onChange={e => setHexoDir(e.target.value)}
              placeholder="/Users/username/my-hexo-blog"
              style={{ flex: 1 }}
            />
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={handleBrowseDir}
              disabled={isBrowsingDir}
              style={{ border: '1px solid var(--border-color)', whiteSpace: 'nowrap' }}
            >
              {isBrowsingDir ? (
                <Loader2 size={14} className="spin" />
              ) : (
                <FolderOpen size={14} />
              )}
              <span>{isBrowsingDir ? '等待选择...' : '浏览选择...'}</span>
            </button>
          </div>
          <span style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
            支持原生对话框选择本地 Hexo 项目目录，系统会自动探测 <code>_config.yml</code> 根标识
          </span>
        </div>

        <div className="form-row-2">
          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <FolderOpen size={13} style={{ color: 'var(--accent-color)' }} />
              <span>实际扫描文章目录 (Posts):</span>
            </label>
            <input
              type="text"
              className="form-input"
              value={computedPostsDir}
              disabled
              style={{ opacity: 0.75, cursor: 'not-allowed', background: 'var(--bg-tertiary)', fontSize: 12 }}
            />
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, display: 'block' }}>
              正式发布文章存放目录 (source/_posts)
            </span>
          </div>

          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <FolderOpen size={13} style={{ color: '#a78bfa' }} />
              <span>实际扫描草稿目录 (Drafts):</span>
            </label>
            <input
              type="text"
              className="form-input"
              value={computedDraftsDir}
              disabled
              style={{ opacity: 0.75, cursor: 'not-allowed', background: 'var(--bg-tertiary)', fontSize: 12 }}
            />
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, display: 'block' }}>
              未发布草稿箱存放目录 (source/_drafts)
            </span>
          </div>
        </div>
      </div>

      <div className="settings-card">
        <div className="settings-card-title">
          <FileText size={16} style={{ color: '#818cf8' }} />
          <span>Frontmatter 封面字段与时间属性</span>
        </div>

        <div className="form-group">
          <label className="form-label">需要管理的封面字段 (cover_fields，逗号分隔):</label>
          <input
            type="text"
            className="form-input"
            value={coverFields}
            onChange={e => setCoverFields(e.target.value)}
            placeholder="index_img, banner_img, cover"
          />
          <span style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
            系统会根据填写的顺序依次优先检索与更新文章头部 YAML Frontmatter 中的封面图字段
          </span>
        </div>

        <div className="form-row-2">
          <div className="form-group">
            <label className="form-label">创建时间字段 (date_field):</label>
            <input
              type="text"
              className="form-input"
              value={dateField}
              onChange={e => setDateField(e.target.value)}
              placeholder="date"
            />
          </div>

          <div className="form-group">
            <label className="form-label">更新时间字段 (updated_field):</label>
            <input
              type="text"
              className="form-input"
              value={updatedField}
              onChange={e => setUpdatedField(e.target.value)}
              placeholder="updated"
            />
          </div>
        </div>

        <div className="form-group" style={{ marginTop: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={autoSearch}
              onChange={e => setAutoSearch(e.target.checked)}
              style={{ accentColor: 'var(--accent-color)', width: 16, height: 16 }}
            />
            <span style={{ fontSize: 13, fontWeight: 500 }}>
              选中博文时自动提取其标题关键词并发起图库联想搜索 (auto_search)
            </span>
          </label>
        </div>
      </div>
    </>
  );
};
