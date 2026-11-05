import React, { useState } from 'react';
import { Modal } from './Modal';
import { FilePlus, FileText, FolderGit2, Loader2, Sparkles } from 'lucide-react';
import { PostInfo } from '../types';
import { api } from '../api';
import { useToast } from '../context/ToastContext';

interface CreatePostModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPostCreated: (post: PostInfo) => void;
}

export const CreatePostModal: React.FC<CreatePostModalProps> = ({
  isOpen,
  onClose,
  onPostCreated,
}) => {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [isDraft, setIsDraft] = useState(false);
  const [categories, setCategories] = useState('');
  const [tags, setTags] = useState('');
  const [filename, setFilename] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      toast.error('请输入文章标题');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await api.createPost({
        title: cleanTitle,
        file_name: filename.trim() || undefined,
        categories: categories.trim() || undefined,
        tags: tags.trim() || undefined,
        is_draft: isDraft,
      });

      if (res.success && res.post) {
        toast.success(`成功创建${isDraft ? '草稿' : '文章'}「${cleanTitle}」！`);
        onPostCreated(res.post);
        // 重置表单并关闭
        setTitle('');
        setCategories('');
        setTags('');
        setFilename('');
        setIsDraft(false);
        onClose();
      } else {
        toast.error(`创建失败: ${res.error || '未知错误'}`);
      }
    } catch (err: any) {
      toast.error(`创建异常: ${err.message || '网络连接失败'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isDraft ? "新建本地草稿 (source/_drafts)" : "新建正式文章 (source/_posts)"}
      icon={<FilePlus size={16} color="var(--accent-color)" />}
      width={480}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* 文章类型切换 (正式 vs 草稿) */}
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">发布状态 / 目标位置:</label>
          <div className="filter-pill-tabs" style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className={`filter-pill ${!isDraft ? 'active' : ''}`}
              onClick={() => setIsDraft(false)}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              <FileText size={12} style={{ marginRight: 4 }} />
              正式文章 (_posts)
            </button>
            <button
              type="button"
              className={`filter-pill ${isDraft ? 'active' : ''}`}
              onClick={() => setIsDraft(true)}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              <FolderGit2 size={12} style={{ marginRight: 4 }} />
              本地草稿 (_drafts)
            </button>
          </div>
        </div>

        {/* 文章标题 */}
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">
            文章标题 <span style={{ color: '#f87171' }}>*</span>:
          </label>
          <input
            type="text"
            className="form-input"
            placeholder="例如: 探索 Hexo 现代化配图最佳实践"
            value={title}
            onChange={e => setTitle(e.target.value)}
            autoFocus
            required
          />
        </div>

        {/* 分类与标签 */}
        <div className="form-row-2">
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">文章分类 (Categories):</label>
            <input
              type="text"
              className="form-input"
              placeholder="例如: 技术 或 前端"
              value={categories}
              onChange={e => setCategories(e.target.value)}
            />
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">标签 (Tags，逗号分隔):</label>
            <input
              type="text"
              className="form-input"
              placeholder="例如: Hexo, 博客"
              value={tags}
              onChange={e => setTags(e.target.value)}
            />
          </div>
        </div>

        {/* 自定义文件名 (可选) */}
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">
            自定义文件名 (可选，留空将根据标题自动生成 slug):
          </label>
          <input
            type="text"
            className="form-input"
            placeholder="例如: hexo-cover-image-guide (无需输入 .md)"
            value={filename}
            onChange={e => setFilename(e.target.value)}
          />
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
            规范：正文自动遵循一句话引言后紧跟 <code>&lt;!-- more --&gt;</code> 截断，无额外 description 堆叠。
          </span>
        </div>

        {/* 底部按钮 */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={isSubmitting}>
            取消
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isSubmitting || !title.trim()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            {isSubmitting ? <Loader2 size={13} className="spin-icon" /> : <Sparkles size={13} />}
            <span>{isDraft ? '创建草稿' : '创建正式文章'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
