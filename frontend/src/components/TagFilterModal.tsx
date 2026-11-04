import React, { useState } from 'react';
import { TagStat } from '../types';
import { Tag, Search, Check } from 'lucide-react';
import { Modal } from './Modal';

interface TagFilterModalProps {
  isOpen: boolean;
  tags: TagStat[];
  selectedTag: string;
  onSelectTag: (tag: string) => void;
  onClose: () => void;
}

export const TagFilterModal: React.FC<TagFilterModalProps> = ({
  isOpen,
  tags,
  selectedTag,
  onSelectTag,
  onClose,
}) => {
  const [search, setSearch] = useState('');

  if (!isOpen) return null;

  const filtered = tags.filter(t => t.name.toLowerCase().includes(search.toLowerCase().trim()));

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`所有收藏标签筛选 (共 ${tags.length} 个)`}
      icon={<Tag size={16} color="var(--primary-color)" />}
      width={480}
      zIndex={110}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            className="form-input"
            style={{ width: '100%', paddingLeft: 30, fontSize: 12, height: 32 }}
            placeholder="搜索标签名称过滤..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        <div style={{ maxHeight: '50vh', overflowY: 'auto' }}>
          <div style={{ marginBottom: 12 }}>
            <button
              type="button"
              className={`filter-pill ${selectedTag === '' ? 'active' : ''}`}
              style={{ padding: '4px 12px', fontSize: 12 }}
              onClick={() => { onSelectTag(''); onClose(); }}
            >
              全部标签 (查看全部图片)
            </button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center', width: '100%', color: 'var(--text-muted)', fontSize: 12 }}>
                未找到匹配的标签
              </div>
            ) : (
              filtered.map(t => {
                const isSelected = selectedTag === t.name;
                return (
                  <button
                    key={t.name}
                    type="button"
                    className={`filter-pill ${isSelected ? 'active' : ''}`}
                    style={{
                      padding: '5px 12px',
                      fontSize: 12,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      borderRadius: 14,
                    }}
                    onClick={() => {
                      onSelectTag(t.name);
                      onClose();
                    }}
                  >
                    {isSelected && <Check size={11} />}
                    <span>#{t.name}</span>
                    <span style={{ fontSize: 11, opacity: 0.65, marginLeft: 2 }}>({t.count})</span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            当前选中: {selectedTag ? `#${selectedTag}` : '全部标签'}
          </span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </Modal>
  );
};
