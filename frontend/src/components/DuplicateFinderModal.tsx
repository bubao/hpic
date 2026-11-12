import React, { useCallback, useEffect, useState } from 'react';
import { FavoriteDuplicateGroup } from '../types';
import { api } from '../api';
import { Modal } from './Modal';
import { Icon } from './common/Icon';
import { useToast } from '../context/ToastContext';
import { isSvgUrl } from '../utils/imageMeta';
import { SvgSafeImage } from './common/SvgSafeImage';
import { AlertCircle, Check, Layers, RefreshCw, Trash2 } from 'lucide-react';

/** 汉明距离阈值预设：数值越小判定越严格。 */
const THRESHOLD_PRESETS = [
  { value: 3, label: '严格' },
  { value: 6, label: '标准' },
  { value: 10, label: '宽松' },
] as const;

interface DuplicateFinderModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 移除收藏后回调（用于刷新收藏列表）。 */
  onChanged?: () => void | Promise<void>;
}

/**
 * 重复图片检测面板。
 * 服务端对收藏夹全量图片计算 pHash 并按汉明距离聚类，
 * 这里只负责展示分组与执行「保留第一张，移除其余」的清理动作。
 */
export const DuplicateFinderModal: React.FC<DuplicateFinderModalProps> = ({ isOpen, onClose, onChanged }) => {
  const toast = useToast();
  const [threshold, setThreshold] = useState<number>(6);
  const [groups, setGroups] = useState<FavoriteDuplicateGroup[]>([]);
  const [scanned, setScanned] = useState(0);
  const [failed, setFailed] = useState(0);
  const [hasScanned, setHasScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removingKey, setRemovingKey] = useState<string | null>(null);
  const [confirmGroupHash, setConfirmGroupHash] = useState<string | null>(null);

  const runScan = useCallback(async (thr: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getFavoriteDuplicates(thr);
      if (res.success) {
        setGroups(res.groups || []);
        setScanned(res.scanned || 0);
        setFailed(res.failed || 0);
        setHasScanned(true);
      } else {
        setError('检测失败，请稍后重试');
      }
    } catch (e: any) {
      setError(e?.message || '检测重复图片失败，请检查网络或本地服务');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setHasScanned(false);
      setGroups([]);
      setError(null);
      setConfirmGroupHash(null);
      void runScan(threshold);
    }
  }, [isOpen, threshold, runScan]);

  const handleRemoveOne = async (url: string) => {
    setRemovingKey(url);
    try {
      const res = await api.removeFavorite(url);
      if (res?.success) {
        toast.success('已移除 1 张重复图片');
        await onChanged?.();
        await runScan(threshold);
      } else {
        toast.error('移除失败，请重试');
      }
    } catch (e: any) {
      toast.error('移除失败: ' + (e?.message || '网络连接异常'));
    } finally {
      setRemovingKey(null);
    }
  };

  const handleKeepFirst = async (group: FavoriteDuplicateGroup) => {
    const targets = group.items.slice(1);
    setRemovingKey(`group:${group.hash}`);
    let removed = 0;
    for (const item of targets) {
      try {
        const res = await api.removeFavorite(item.url);
        if (res?.success) removed++;
      } catch {
        // 单张失败不中断整批，最后统一提示
      }
    }
    if (removed > 0) {
      toast.success(`已保留第一张，移除 ${removed} 张重复图片`);
      setConfirmGroupHash(null);
      await onChanged?.();
      await runScan(threshold);
    } else {
      toast.error('批量移除失败，请重试');
    }
    setRemovingKey(null);
  };

  if (!isOpen) return null;

  const removableTotal = groups.reduce((sum, g) => sum + g.items.length - 1, 0);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="重复图片检测"
      icon={<Icon name="layers" size="lg" variant="primary" />}
      size="lg"
    >
      <div className="dup-modal-body">
        <div className="dup-toolbar">
          <span className="ctrl-label">
            <span>相似阈值</span>
          </span>
          <div className="dup-threshold-group">
            {THRESHOLD_PRESETS.map(preset => (
              <button
                key={preset.value}
                type="button"
                className={`filter-pill dup-threshold-pill ${threshold === preset.value ? 'active' : ''}`}
                onClick={() => setThreshold(preset.value)}
                title={`汉明距离 ≤ ${preset.value} 判定为重复`}
              >
                {preset.label} ({preset.value})
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => void runScan(threshold)}
            disabled={loading}
            title="重新计算指纹并聚类"
          >
            <RefreshCw size={13} className={loading ? 'spin' : undefined} />
            <span>重新检测</span>
          </button>
        </div>

        {hasScanned && !loading && !error && (
          <div className="dup-summary">
            已扫描 <strong>{scanned}</strong> 张
            {failed > 0 && <span className="dup-summary-warn"> · {failed} 张下载/解码失败</span>}
            {' · '}发现 <strong>{groups.length}</strong> 组重复（可清理 {removableTotal} 张）
          </div>
        )}

        {loading ? (
          <div className="history-empty-state">
            <Icon name="loading" size="xl" animation="spin" variant="primary" className="history-empty-icon" />
            <div className="history-loading-text">正在下载图片并计算感知指纹...</div>
          </div>
        ) : error ? (
          <div className="history-empty-state">
            <AlertCircle size={32} color="var(--danger-color, #ef4444)" />
            <div className="history-empty-title" style={{ color: 'var(--danger-color, #ef4444)' }}>
              {error}
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => void runScan(threshold)}
              style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <RefreshCw size={13} />
              <span>重试检测</span>
            </button>
          </div>
        ) : !hasScanned ? (
          <div className="history-empty-state">
            <Layers size={32} color="var(--text-muted)" />
            <div className="history-empty-title">准备检测</div>
            <div className="history-empty-desc">打开面板后会自动对收藏夹全量图片做相似度比对。</div>
          </div>
        ) : groups.length === 0 ? (
          <div className="history-empty-state">
            <Icon name="checkCircle" size="xl" variant="success" className="history-empty-icon" />
            <div className="history-empty-title">未发现重复图片</div>
            <div className="history-empty-desc">
              当前阈值（{threshold}）下收藏夹没有视觉重复的图片。调大阈值可检测更宽松的相似图。
            </div>
          </div>
        ) : (
          <div className="dup-group-list">
            {groups.map((group, index) => {
              const isConfirming = confirmGroupHash === group.hash;
              const isRemoving = removingKey === `group:${group.hash}`;
              return (
                <div key={group.hash} className="dup-group-card">
                  <div className="dup-group-header">
                    <span className="dup-group-pill">重复组 {index + 1}</span>
                    <span className="dup-group-meta">
                      {group.items.length} 张相似 · 指纹 {group.hash.slice(0, 8)}
                    </span>
                    <div className="dup-group-actions">
                      {isConfirming ? (
                        <>
                          <span style={{ fontSize: 11, color: 'var(--danger-color, #ef4444)' }}>
                            确定移除 {group.items.length - 1} 张？
                          </span>
                          <button
                            type="button"
                            className="btn btn-sm btn-danger"
                            onClick={() => void handleKeepFirst(group)}
                            disabled={isRemoving}
                            style={{ padding: '2px 8px', fontSize: 11 }}
                          >
                            {isRemoving ? '移除中...' : '确定'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            onClick={() => setConfirmGroupHash(null)}
                            disabled={isRemoving}
                            style={{ padding: '2px 8px', fontSize: 11 }}
                          >
                            取消
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost highlight-rollback-btn"
                          onClick={() => setConfirmGroupHash(group.hash)}
                          disabled={removingKey !== null}
                          title="保留该组第一张，移除其余重复图片"
                        >
                          <Check size={13} />
                          <span>保留第一张，移除其余 ({group.items.length - 1})</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="dup-thumb-grid">
                    {group.items.map((item, itemIndex) => {
                      const isKeeping = itemIndex === 0;
                      const isRemovingItem = removingKey === item.url;
                      const thumb = item.thumb_url || item.url;
                      return (
                        <div key={item.url} className="dup-thumb-cell" title={item.url}>
                          {isSvgUrl(thumb) ? (
                            <SvgSafeImage
                              src={thumb}
                              alt={item.title || '收藏图片'}
                              fitMode="cover"
                              style={{ width: '100%', height: '100%' }}
                            />
                          ) : (
                            <img src={thumb} alt={item.title || '收藏图片'} referrerPolicy="no-referrer" loading="lazy" />
                          )}
                          {isKeeping && <span className="dup-thumb-keep-badge">保留</span>}
                          {!isKeeping && (
                            <button
                              type="button"
                              className="dup-thumb-remove"
                              onClick={() => void handleRemoveOne(item.url)}
                              disabled={isRemovingItem}
                              title="从收藏夹移除这张图片"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
};
