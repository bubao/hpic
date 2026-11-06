import React, { useState, useEffect } from 'react';
import { Link2, AlertCircle, Star, Image as ImageIcon, Clipboard, Sparkles } from 'lucide-react';
import { useFavorites } from '../context/FavoritesContext';
import { useToast } from '../context/ToastContext';
import { Modal } from './Modal';
import { ApplyCoverButtons } from './ApplyCoverButtons';
import { isSvgUrl } from '../utils/imageMeta';
import { SvgSafeImage } from './common/SvgSafeImage';

interface ManualUrlModalProps {
  isOpen: boolean;
  onClose: () => void;
  coverFields: string[];
  postTitle?: string;
  onApplyImage: (url: string, fields: string[]) => void;
}

export const ManualUrlModal: React.FC<ManualUrlModalProps> = ({
  isOpen,
  onClose,
  coverFields,
  postTitle = '',
  onApplyImage,
}) => {
  const toast = useToast();
  const { toggleFavorite, isFavorited } = useFavorites();
  const [url, setUrl] = useState('');
  const [imgStatus, setImgStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [autoFav, setAutoFav] = useState(true);

  useEffect(() => {
    if (isOpen) {
      setUrl('');
      setImgStatus('idle');
    }
  }, [isOpen]);

  useEffect(() => {
    const trimmed = url.trim();
    if (!trimmed) {
      setImgStatus('idle');
      return;
    }

    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://') && !trimmed.startsWith('data:image/')) {
      setImgStatus('error');
      return;
    }

    setImgStatus('loading');
    const img = new Image();
    img.onload = () => setImgStatus('success');
    img.onerror = () => setImgStatus('error');
    img.src = trimmed;
  }, [url]);

  if (!isOpen) return null;

  const trimmedUrl = url.trim();

  const handleApply = (_appliedUrl: string, fields: string[]) => {
    if (!trimmedUrl) {
      toast.error('请先输入有效的图片链接');
      return;
    }

    if (autoFav && !isFavorited(trimmedUrl)) {
      toggleFavorite({
        url: trimmedUrl,
        title: postTitle ? `《${postTitle}》外链配图` : '手动外链配图',
        source: 'manual',
      });
    }

    onApplyImage(trimmedUrl, fields);
    onClose();
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && (text.startsWith('http') || text.startsWith('data:image/'))) {
        setUrl(text.trim());
        toast.success('已从剪贴板粘贴图片链接');
      } else {
        toast.info('剪贴板中未发现以 http/https 开头的图片链接');
      }
    } catch {
      toast.error('无法访问剪贴板，请手动粘贴');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="手动配置外部图片外链"
      icon={<Link2 size={18} />}
      width={540}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="form-item">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label className="form-label" style={{ marginBottom: 0 }}>图片网络链接 (URL):</label>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={handlePasteClipboard}
                style={{ padding: '2px 8px', fontSize: 11 }}
              >
                <Clipboard size={12} style={{ marginRight: 3 }} />
                粘贴剪贴板
              </button>
            </div>
            <input
              type="text"
              className="form-control"
              placeholder="https://images.unsplash.com/... 或任意图床图片直链"
              value={url}
              onChange={e => setUrl(e.target.value)}
              autoFocus
            />
          </div>

          {/* 实时图像预检窗口 */}
          <div
            style={{
              width: '100%',
              height: 180,
              borderRadius: 8,
              border: '1px solid var(--border-color)',
              background: 'var(--bg-tertiary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            {imgStatus === 'idle' && (
              <div style={{ textAlign: 'center', opacity: 0.5, fontSize: 13 }}>
                <ImageIcon size={32} style={{ margin: '0 auto 6px', display: 'block' }} />
                <span>输入链接后在此处实时验证大图</span>
              </div>
            )}
            {imgStatus === 'loading' && (
              <div style={{ textAlign: 'center', color: 'var(--accent-color)', fontSize: 13 }}>
                <Sparkles size={24} className="animate-spin" style={{ margin: '0 auto 6px', display: 'block' }} />
                <span>正在校验图片连通性...</span>
              </div>
            )}
            {imgStatus === 'error' && (
              <div style={{ textAlign: 'center', color: '#ef4444', fontSize: 13, padding: 12 }}>
                <AlertCircle size={24} style={{ margin: '0 auto 6px', display: 'block' }} />
                <span>无法加载该图片，请检查链接是否为直接图片直链或存在防盗链限制</span>
              </div>
            )}
            {imgStatus === 'success' && (
              isSvgUrl(trimmedUrl) ? (
                <SvgSafeImage
                  src={trimmedUrl}
                  alt="Preview"
                  fitMode="contain"
                  style={{ width: '100%', height: '100%' }}
                />
              ) : (
                <img
                  src={trimmedUrl}
                  alt="Preview"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              )
            )}
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={autoFav}
              onChange={e => setAutoFav(e.target.checked)}
              style={{ accentColor: 'var(--accent-color)' }}
            />
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Star size={13} fill={autoFav ? '#f59e0b' : 'none'} color={autoFav ? '#f59e0b' : 'currentColor'} />
              同时将该图片加入灵感收藏夹
            </span>
          </label>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border-color)' }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            取消
          </button>

          <ApplyCoverButtons
            url={trimmedUrl}
            coverFields={coverFields}
            onApplyImage={handleApply}
            fullLabel={true}
            size="sm"
          />
        </div>
      </div>
    </Modal>
  );
};
