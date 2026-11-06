import React from 'react';
import { isSvgUrl } from '../../utils/imageMeta';
import { SvgFitMode, useSafeSvgUrl } from '../../utils/svgFixer';

export interface SvgSafeImageProps {
  src: string;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
  /** contain 完整呈现 / cover 铺满裁切，由修复后的 SVG 内部 preserveAspectRatio 生效 */
  fitMode?: SvgFitMode;
  onClick?: (e: React.MouseEvent) => void;
  title?: string;
  loading?: 'lazy' | 'eager';
  onError?: (e: any) => void;
  onLoad?: (e: any) => void;
  /**
   * 点击是否穿透到下层/父元素（默认 true）。
   * `<object>` 内嵌文档会吞掉点击事件，导致父级 onClick（选中文章等）失效，
   * 因此纯展示场景默认关闭其指针事件，让点击落到下层元素。
   */
  clickThrough?: boolean;
}

/**
 * 安全矢量/位图展示组件，统一全站 SVG 渲染路径，可直接替换 `<img>` / `<object>`。
 *
 * 修复 WebKit / Safari 下：
 * 1. `<img>` 无法渲染含 foreignObject 的 SVG；
 * 2. 根标签缺少 viewBox 或锁定绝对宽高时，SVG 在小容器（缩略图、浮层、预览）内被裁切；
 * 3. `<object>` 内嵌文档吞掉点击事件导致交互失效；
 * 4. `<object>` 是替换元素，若调用方未给尺寸会回落到 300x150 默认尺寸、显示不完整——
 *    本组件为 `<object>` 强制兜底 `width/height: 100%`，由调用方容器决定最终尺寸。
 *
 * 缩放语义：SVG 根标签被改写为 `width/height = 100%`，并注入
 * `viewBox + preserveAspectRatio`，因此真正决定完整/裁切的是 SVG 内部，
 * 而不是 CSS `object-fit`（后者对内嵌文档无效）。
 */
export const SvgSafeImage: React.FC<SvgSafeImageProps> = ({
  src,
  alt = '',
  className = '',
  style,
  fitMode = 'contain',
  onClick,
  title,
  loading,
  onError,
  onLoad,
  clickThrough = true,
}) => {
  const isSvg = isSvgUrl(src);
  const { safeUrl } = useSafeSvgUrl(isSvg ? src : null, fitMode);

  if (!isSvg) {
    return (
      <img
        src={src}
        alt={alt}
        className={className}
        style={style}
        onClick={onClick}
        title={title}
        loading={loading}
        onError={onError}
        onLoad={onLoad}
      />
    );
  }

  // object 替换元素的尺寸兜底：调用方给了宽高就尊重，没给则填满父容器。
  // 缺少这一层时，父容器高度为 auto 的场景（灯箱、flex 自适应区）会渲染不全。
  const objectStyle: React.CSSProperties = {
    ...style,
    width: style?.width ?? '100%',
    height: style?.height ?? '100%',
    objectFit: fitMode,
    display: style?.display ?? 'block',
    border: 'none',
    background: 'transparent',
    pointerEvents: 'none',
  };

  // 纯展示：object 关闭指针事件，点击穿透到下层/父元素
  if (clickThrough || !onClick) {
    return (
      <object
        key={safeUrl || src}
        data={safeUrl || src}
        type="image/svg+xml"
        aria-label={alt || undefined}
        title={title}
        className={className}
        style={objectStyle}
        onError={onError}
        onLoad={onLoad}
      />
    );
  }

  // 需要响应点击：object 内嵌文档会拦截事件，
  // 由透明遮罩层承接点击，事件直接绑定在父级包装元素上。
  return (
    <div
      className={className}
      style={{
        ...style,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
      }}
      onClick={onClick}
      title={title}
    >
      <object
        key={safeUrl || src}
        data={safeUrl || src}
        type="image/svg+xml"
        aria-label={alt || undefined}
        style={{ ...objectStyle, position: 'absolute', inset: 0 }}
        onError={onError}
        onLoad={onLoad}
      />
      <div
        style={{ position: 'absolute', inset: 0, zIndex: 1, cursor: 'pointer' }}
        aria-hidden="true"
      />
    </div>
  );
};
