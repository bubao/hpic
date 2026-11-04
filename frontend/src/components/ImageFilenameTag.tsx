import React from 'react';
import { FileText } from 'lucide-react';
import { extractImageFilename } from '../utils/imageMeta';

export interface ImageFilenameTagProps {
  url: string;
  fallbackTitle?: string;
  maxWidth?: string | number;
  className?: string;
  showIcon?: boolean;
}

/**
 * 统一的文件名展示组件
 * 保证所有卡片、封面区、灯箱与生成器中，文件名与图标、等宽排版、悬浮提示 100% 规范一致
 */
export const ImageFilenameTag: React.FC<ImageFilenameTagProps> = ({
  url,
  fallbackTitle = '',
  maxWidth,
  className = '',
  showIcon = true,
}) => {
  if (!url) {
    return <span className={`image-filename-tag empty ${className}`}>（未配置）</span>;
  }

  const filename = extractImageFilename(url, fallbackTitle);

  return (
    <span
      className={`image-filename-tag ${className}`}
      title={url}
      style={maxWidth ? { maxWidth } : undefined}
    >
      {showIcon && <FileText size={11} className="filename-icon" />}
      <span className="filename-text">{filename}</span>
    </span>
  );
};
