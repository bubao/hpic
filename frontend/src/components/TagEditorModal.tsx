import React, { useState, useEffect } from 'react';
import { FavoriteItem } from '../types';
import { Tag, Plus, Check, X } from 'lucide-react';
import { Modal } from './Modal';
import { SvgSafeImage } from './common/SvgSafeImage';

interface TagEditorModalProps {
  isOpen: boolean;
  item: FavoriteItem | null;
  onClose: () => void;
  onSaveTags: (idOrUrl: string, tags: string[]) => Promise<void>;
}

export const TagEditorModal: React.FC<TagEditorModalProps> = ({
  isOpen,
  item,
  onClose,
  onSaveTags,
}) => {
  const [tags, setTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (item) {
      setTags(item.tags || []);
      setNewTagInput('');
    }
  }, [item]);

  if (!isOpen || !item) return null;

  const handleAddTag = () => {
    const trimmed = newTagInput.trim();
    if (!trimmed) return;
    // 支持逗号或空格分割批量添加
    const splitTags = trimmed.split(/[,，\s]+/).map(t => t.trim()).filter(Boolean);
    const set = new Set(tags);
    splitTags.forEach(t => set.add(t));
    setTags(Array.from(set));
    setNewTagInput('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(t => t !== tagToRemove));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSaveTags(item.id || item.url, tags);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen && !!item}
      onClose={onClose}
      title="自定义图片标签 (Tags)"
      icon={<Tag size={16} color="var(--primary-color)" />}
      width={440}
    >
      <div className="tag-editor-preview-row">
        <SvgSafeImage
          src={item.thumb_url || item.url}
          alt={item.title}
          className="tag-editor-thumb"
          fitMode="contain"
        />
        <div className="tag-editor-meta">
          <div className="tag-editor-title">
            {item.title || '收藏图片'}
          </div>
          <div className="tag-editor-subtitle">
            完全由您自己定义与维护的标签分类
          </div>
        </div>
      </div>

      <div className="tag-editor-field">
        <label className="tag-editor-label">
          当前标签 ({tags.length})：
        </label>
        <div className="tag-editor-tags-box">
          {tags.length === 0 ? (
            <span className="tag-editor-empty-hint">暂无标签，可在下方输入添加</span>
          ) : (
            tags.map(t => (
              <span key={t} className="tag-editor-pill">
                #{t}
                <button
                  type="button"
                  onClick={() => handleRemoveTag(t)}
                  className="tag-editor-pill-del"
                  title="删除此标签"
                >
                  <X size={10} />
                </button>
              </span>
            ))
          )}
        </div>
      </div>

      <div className="tag-editor-input-row">
        <input
          type="text"
          className="form-input tag-editor-input"
          placeholder="输入标签名按回车添加 (如: 极简, 运维, 摄影)"
          value={newTagInput}
          onChange={e => setNewTagInput(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={handleAddTag}
          disabled={!newTagInput.trim()}
        >
          <Plus size={13} style={{ marginRight: 2 }} />
          添加
        </button>
      </div>

      <div className="tag-editor-actions">
        <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>
          取消
        </button>
        <button
          type="button"
          className="btn btn-sm btn-primary"
          onClick={handleSave}
          disabled={isSaving}
        >
          <Check size={13} style={{ marginRight: 4 }} />
          {isSaving ? '保存中...' : '保存标签'}
        </button>
      </div>
    </Modal>
  );
};
