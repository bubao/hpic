import React, { useRef } from 'react';
import { FavoriteItem } from '../types';
import { api } from '../api';
import { useToast } from '../context/ToastContext';
import { Copy, FileJson, FileText, Upload } from 'lucide-react';

interface FavoritesToolbarProps {
  /** 当前收藏夹全量数据（导出源）。 */
  items: FavoriteItem[];
  /** 导入完成后回调（用于刷新收藏列表）。 */
  onImported?: () => void | Promise<void>;
  /** 打开重复图片检测面板。 */
  onFindDuplicates?: () => void;
}

/** 触发浏览器下载，避免依赖 Electron / Tauri 专用通道。 */
function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** 导出为 hpic 可识别的 JSON 备份（含全部元数据，供跨设备导入）。 */
function buildExportJSON(items: FavoriteItem[]): string {
  return JSON.stringify({
    schema_version: 1,
    exported_by: 'hpic',
    exported_at: new Date().toISOString(),
    total: items.length,
    items: items.map(it => ({
      url: it.url,
      thumb_url: it.thumb_url,
      title: it.title,
      source: it.source,
      tags: it.tags || [],
    })),
  }, null, 2);
}

/** 导出为 Markdown 清单：每行都是可直接粘贴进博客正文的图片语法。 */
function buildExportMarkdown(items: FavoriteItem[]): string {
  const lines = items.map(it => {
    const alt = (it.title || '配图').replace(/]/g, ')');
    const meta: string[] = [];
    if (it.source) meta.push(`来源: ${it.source}`);
    if (it.tags && it.tags.length > 0) meta.push(`标签: ${it.tags.map(t => `#${t}`).join(' ')}`);
    return `- ![${alt}](${it.url})${meta.length > 0 ? ' — ' + meta.join(' · ') : ''}`;
  });
  return [
    '# hpic 收藏夹导出',
    '',
    `> 导出时间: ${new Date().toLocaleString('zh-CN')} · 共 ${items.length} 张`,
    '',
    ...lines,
    '',
  ].join('\n');
}

/**
 * 收藏夹导出 / 导入工具条。
 * 导出 JSON 可备份与跨设备同步（导入时按物理图片去重合并），
 * 导出 Markdown 直接服务博客写作。
 */
export const FavoritesToolbar: React.FC<FavoritesToolbarProps> = ({ items, onImported, onFindDuplicates }) => {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportJSON = () => {
    if (items.length === 0) {
      toast.info('收藏夹为空，暂无可导出的内容');
      return;
    }
    const stamp = new Date().toISOString().slice(0, 10);
    downloadFile(`hpic-favorites-${stamp}.json`, buildExportJSON(items), 'application/json');
    toast.success(`已导出 ${items.length} 条收藏为 JSON`);
  };

  const handleExportMarkdown = () => {
    if (items.length === 0) {
      toast.info('收藏夹为空，暂无可导出的内容');
      return;
    }
    const stamp = new Date().toISOString().slice(0, 10);
    downloadFile(`hpic-favorites-${stamp}.md`, buildExportMarkdown(items), 'text/markdown');
    toast.success(`已导出 ${items.length} 条收藏为 Markdown`);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const list: unknown[] = Array.isArray(parsed) ? parsed : parsed?.items;
      if (!Array.isArray(list)) {
        toast.error('导入失败：文件缺少 items 数组');
        return;
      }

      let imported = 0;
      let failed = 0;
      for (const raw of list) {
        const item = raw as Partial<FavoriteItem>;
        if (!item || typeof item.url !== 'string' || !item.url.trim()) {
          failed++;
          continue;
        }
        try {
          const res = await api.addFavorite({
            url: item.url,
            thumb_url: item.thumb_url,
            title: item.title,
            source: item.source,
            tags: item.tags,
          });
          if (res?.success) imported++;
          else failed++;
        } catch {
          failed++;
        }
      }

      if (imported > 0) {
        toast.success(`导入完成：写入 ${imported} 条${failed > 0 ? `，跳过/失败 ${failed} 条` : ''}`);
        await onImported?.();
      } else {
        toast.error(`导入失败：没有可写入的收藏项${failed > 0 ? `（${failed} 条无效）` : ''}`);
      }
    } catch (err: any) {
      toast.error('导入失败：' + (err?.message || '文件解析异常'));
    } finally {
      // 允许重复选择同一文件
      e.target.value = '';
    }
  };

  return (
    <div className="fav-toolbar">
      <button
        type="button"
        className="btn btn-sm btn-ghost"
        onClick={handleExportJSON}
        disabled={items.length === 0}
        title="导出 JSON 备份，可在其他设备导入实现收藏夹同步"
      >
        <FileJson size={13} />
        <span>导出 JSON</span>
      </button>
      <button
        type="button"
        className="btn btn-sm btn-ghost"
        onClick={handleExportMarkdown}
        disabled={items.length === 0}
        title="导出 Markdown 图片清单，可直接粘贴进博客正文"
      >
        <FileText size={13} />
        <span>导出 Markdown</span>
      </button>
      <button
        type="button"
        className="btn btn-sm btn-ghost"
        onClick={() => fileInputRef.current?.click()}
        title="从 JSON 备份导入收藏（按物理图片去重合并）"
      >
        <Upload size={13} />
        <span>导入</span>
      </button>
      {onFindDuplicates && (
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={onFindDuplicates}
          disabled={items.length === 0}
          title="检测收藏夹中视觉重复的图片，支持保留第一张批量清理"
        >
          <Copy size={13} />
          <span>查重</span>
        </button>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        style={{ display: 'none' }}
        onChange={handleImportFile}
      />
    </div>
  );
};
