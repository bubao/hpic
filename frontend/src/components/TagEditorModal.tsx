import React, { useState, useEffect } from 'react';
import { FavoriteItem } from '../types';
import { Tag, Plus, Check, X } from 'lucide-react';
import { Modal } from './Modal';

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
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
            <img
              src={item.thumb_url || item.url}
              alt={item.title}
              style={{ width: 80, height: 48, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--border-color)' }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.title || '收藏图片'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                完全由您自己定义与维护的标签分类
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
              当前标签 ({tags.length})：
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, minHeight: 32, padding: '6px 8px', background: 'rgba(0,0,0,0.2)', borderRadius: 6, border: '1px solid var(--border-color)' }}>
              {tags.length === 0 ? (
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>暂无标签，可在下方输入添加</span>
              ) : (
                tags.map(t => (
                  <span
                    key={t}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      background: 'rgba(99, 102, 241, 0.18)',
                      border: '1px solid rgba(99, 102, 241, 0.35)',
                      color: '#a5b4fc',
                      fontSize: 11,
                      padding: '2px 8px',
                      borderRadius: 12,
                    }}
                  >
                    #{t}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(t)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#cbd5e1',
                        cursor: 'pointer',
                        padding: 0,
                        display: 'flex',
                        alignItems: 'center',
                      }}
                      title="删除此标签"
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              className="form-input"
              style={{ flex: 1, fontSize: 12, padding: '6px 10px' }}
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

        <div style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
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
