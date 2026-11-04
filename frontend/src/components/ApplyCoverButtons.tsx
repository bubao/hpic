import React from 'react';
import { Check } from 'lucide-react';

export interface ApplyCoverButtonsProps {
  url: string;
  coverFields: string[];
  onApplyImage?: (url: string, fields: string[]) => void;
  fullLabel?: boolean;
  className?: string;
  size?: 'sm' | 'xs';
}

/**
 * 统一的封面字段应用按钮组
 * 消除多处手写 map(coverFields) 和文案风格不一致
 */
export const ApplyCoverButtons: React.FC<ApplyCoverButtonsProps> = ({
  url,
  coverFields = [],
  onApplyImage,
  fullLabel = false,
  className = '',
  size = 'sm',
}) => {
  if (!onApplyImage || !url) return null;

  const btnClass = `btn btn-${size}`;

  return (
    <div className={`apply-buttons-group ${className}`}>
      <button
        type="button"
        className={`${btnClass} btn-primary`}
        onClick={() => onApplyImage(url, coverFields)}
        title="将此图片一键应用到当前文章的所有封面字段"
      >
        <Check size={size === 'xs' ? 11 : 12} style={{ marginRight: 2 }} />
        <span>{fullLabel ? '设为全部封面' : '设为全部'}</span>
      </button>

      {coverFields.map(field => (
        <button
          key={field}
          type="button"
          className={`${btnClass} btn-ghost`}
          onClick={() => onApplyImage(url, [field])}
          title={`将此图片仅应用到 ${field} 字段`}
        >
          {field}
        </button>
      ))}
    </div>
  );
};
