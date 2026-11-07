import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import type { ErrorBoundaryFallbackProps } from '../ErrorBoundary';

interface SectionErrorFallbackProps extends ErrorBoundaryFallbackProps {
  /** 区块名称，用于提示文案（如「侧边栏」「封面区」） */
  title?: string;
  /** 是否填满所在区域（大区块居中展示，避免视觉塌陷） */
  fill?: boolean;
}

/**
 * 局部 ErrorBoundary 兜底（C3）：
 * 区块级占位 + 「重试」按钮，渲染异常时仅替换该区域，应用其余部分保持可用。
 */
export const SectionErrorFallback: React.FC<SectionErrorFallbackProps> = ({
  title = '该区域',
  fill = false,
  error,
  resetErrorBoundary,
}) => (
  <div
    className={`section-error-fallback${fill ? ' is-fill' : ''}`}
    role="alert"
    data-testid="section-error-fallback"
  >
    <div className="section-error-icon" aria-hidden="true">
      <AlertTriangle size={18} />
    </div>
    <div className="section-error-body">
      <div className="section-error-title">{title}渲染失败</div>
      <div className="section-error-desc">
        {error?.message || '未知错误'}；其余功能不受影响，可点击重试恢复该区域。
      </div>
    </div>
    <button
      type="button"
      className="btn btn-sm btn-ghost section-error-retry"
      onClick={resetErrorBoundary}
      title="重新渲染该区域"
    >
      <RotateCcw size={13} />
      <span>重试</span>
    </button>
  </div>
);
