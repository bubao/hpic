import React, { useMemo, useState } from 'react';
import { PostInfo } from '../../types';
import { Star, Copy, Link2, Code } from 'lucide-react';
import { useFavorites } from '../../context/FavoritesContext';
import { useToast } from '../../context/ToastContext';
import { buildMarkdownImage } from '../../utils/imageMeta';
import { SmoothImage } from '../SmoothImage';
import { ImageFilenameTag } from '../ImageFilenameTag';
import { ApplyCoverButtons } from '../ApplyCoverButtons';

/** 单个生成器字段的描述（供通用 URL 构建器渲染表单）。 */
export interface UrlBuilderField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'select';
  placeholder?: string;
  options?: { value: string; label: string }[];
  defaultValue?: string;
  required?: boolean;
}

/** 通用 URL 构建器配置：字段 + URL 构造函数。 */
export interface UrlBuilderConfig {
  fields: UrlBuilderField[];
  buildUrl: (values: Record<string, string>) => string;
  fallbackTitle: string;
  sourceLabel: string;
  hint?: string;
  /** 依据文章 / 默认 Owner 预填字段（如 GitHub 用户名）。 */
  initialValues?: (ctx: { defaultOwner: string; post: PostInfo }) => Record<string, string>;
}

interface UrlBuilderGeneratorProps {
  post: PostInfo;
  coverFields: string[];
  defaultOwner: string;
  onApplyImage: (url: string, fields: string[]) => void;
  onOpenLightbox: (url: string, title: string) => void;
}

/**
 * 通用「URL 构建」生成器：按配置渲染表单，实时拼出图片外链并预览。
 * 大多数免 Key 图源（Shields / QuickChart / Pollinations 等）都只是 URL 拼装，
 * 用这一个组件即可覆盖，避免每个来源各写一份近乎重复的组件。
 */
const UrlBuilderGenerator: React.FC<UrlBuilderGeneratorProps & { config: UrlBuilderConfig }> = ({
  config,
  post,
  coverFields,
  defaultOwner,
  onApplyImage,
  onOpenLightbox,
}) => {
  const { isFavorited, toggleFavorite } = useFavorites();
  const toast = useToast();

  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of config.fields) {
      init[f.key] = f.defaultValue ?? '';
    }
    const extra = config.initialValues?.({ defaultOwner, post });
    return { ...init, ...(extra || {}) };
  });

  const url = useMemo(() => {
    try {
      return config.buildUrl(values).trim();
    } catch {
      return '';
    }
  }, [config, values]);

  const requiredMissing = config.fields.some(f => f.required && !values[f.key]?.trim());
  const showPreview = !!url && !requiredMissing;

  const setValue = (key: string, v: string) => setValues(prev => ({ ...prev, [key]: v }));

  return (
    <div className="gen-tab-pane">
      <div className="gen-config-form">
        {config.hint && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{config.hint}</div>
        )}
        <div className="form-row-2">
          {config.fields.map(f => (
            <div className="form-group" key={f.key}>
              <label className="form-label">
                {f.label}
                {f.required && <span style={{ color: 'var(--accent, #6366f1)', marginLeft: 2 }}>*</span>}
              </label>
              {f.type === 'select' ? (
                <select
                  className="form-input"
                  value={values[f.key]}
                  onChange={e => setValue(f.key, e.target.value)}
                >
                  {f.options?.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              ) : f.type === 'textarea' ? (
                <textarea
                  className="form-input"
                  style={{ resize: 'vertical', minHeight: 60 }}
                  placeholder={f.placeholder}
                  value={values[f.key]}
                  onChange={e => setValue(f.key, e.target.value)}
                />
              ) : (
                <input
                  className="form-input"
                  type={f.type === 'number' ? 'number' : 'text'}
                  placeholder={f.placeholder}
                  value={values[f.key]}
                  onChange={e => setValue(f.key, e.target.value)}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="poster-preview-box">
        {!showPreview ? (
          <div className="socialify-placeholder">
            <Link2 size={32} style={{ opacity: 0.35, marginBottom: 8 }} />
            <div>{requiredMissing ? '请填写带 * 的必填项后自动生成' : '填写参数后自动生成封面'}</div>
          </div>
        ) : (
          <>
            <SmoothImage
              src={url}
              alt={config.fallbackTitle}
              className="socialify-preview-img"
              showMetaBadge={true}
              onClick={() => onOpenLightbox(url, config.fallbackTitle)}
            />
            <div className="poster-action-bar">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, overflow: 'hidden' }}>
                <ImageFilenameTag url={url} fallbackTitle={config.fallbackTitle} maxWidth={180} />
                <span className="source-pill-badge">{config.sourceLabel}</span>
              </div>
              <div className="apply-btn-group">
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => {
                    navigator.clipboard.writeText(buildMarkdownImage(url, config.fallbackTitle));
                    toast.success('Markdown 图片语法已复制到剪贴板');
                  }}
                  title="复制 Markdown 图片语法: ![标题](URL)"
                >
                  <Code size={12} />
                  <span>Markdown</span>
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => {
                    navigator.clipboard.writeText(url);
                    toast.success('图片外链已复制到剪贴板');
                  }}
                  title="复制该图片外链"
                >
                  <Copy size={12} />
                  <span>复制外链</span>
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${isFavorited(url) ? 'btn-warning-ghost' : 'btn-ghost'}`}
                  onClick={() => toggleFavorite({
                    url,
                    title: config.fallbackTitle,
                    source: config.sourceLabel,
                    thumbUrl: url,
                  })}
                >
                  <Star size={12} fill={isFavorited(url) ? '#f59e0b' : 'none'} color={isFavorited(url) ? '#f59e0b' : 'currentColor'} />
                  <span>{isFavorited(url) ? '已收藏' : '收藏'}</span>
                </button>
                <ApplyCoverButtons url={url} coverFields={coverFields} onApplyImage={onApplyImage} size="sm" />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

/**
 * 工厂：把一份 UrlBuilderConfig 绑定为一个稳定的生成器组件。
 * 在注册表模块加载时调用一次，避免每次渲染产生新组件类型。
 */
export function createUrlBuilderGenerator(config: UrlBuilderConfig) {
  return function BoundUrlBuilderGenerator(props: UrlBuilderGeneratorProps) {
    return <UrlBuilderGenerator config={config} {...props} />;
  };
}
