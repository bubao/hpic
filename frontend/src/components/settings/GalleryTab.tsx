import React from 'react';
import { Image, Sliders } from 'lucide-react';
import { Config } from '../../types';
import { useConfigField } from './useConfigField';

interface GalleryTabProps {
  config: Config;
  onConfigChange: (patch: Partial<Config>) => void;
}

/**
 * 图库与尺寸设置（A9 状态下沉）：
 * 表单草稿保存在 Tab 内部，编辑时通过 onConfigChange 增量上抛。
 */
export const GalleryTab: React.FC<GalleryTabProps> = ({ config, onConfigChange }) => {
  const [orientation, setOrientation] = useConfigField('orientation', config, onConfigChange);
  const [imageSize, setImageSize] = useConfigField('image_size', config, onConfigChange);
  const [minWidth, setMinWidth] = useConfigField('min_width', config, onConfigChange);
  const [minHeight, setMinHeight] = useConfigField('min_height', config, onConfigChange);
  const [imageWidth, setImageWidth] = useConfigField('image_width', config, onConfigChange);
  const [imageQuality, setImageQuality] = useConfigField('image_quality', config, onConfigChange);
  const [infiniteScroll, setInfiniteScroll] = useConfigField('infinite_scroll', config, onConfigChange);

  return (
    <>
      <div className="settings-card">
        <div className="settings-card-title">
          <Image size={16} style={{ color: '#38bdf8' }} />
          <span>图库搜索构图与分辨率约束</span>
        </div>

        <div className="form-row-2">
          <div className="form-group">
            <label className="form-label">默认构图比例 (orientation):</label>
            <select
              className="form-input"
              value={orientation}
              onChange={e => setOrientation(e.target.value)}
            >
              <option value="landscape">宽屏横图 (Landscape - 推荐博客封面)</option>
              <option value="portrait">竖屏人像 (Portrait)</option>
              <option value="squarish">方形画幅 (Squarish)</option>
              <option value="all">不限构图倾向</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">默认尺寸范围 (image_size):</label>
            <select
              className="form-input"
              value={imageSize}
              onChange={e => setImageSize(e.target.value)}
            >
              <option value="large">高清大图 (≥1200px)</option>
              <option value="wallpaper">2K/4K 超清壁纸 (≥1920px)</option>
              <option value="all">不限尺寸</option>
            </select>
          </div>
        </div>

        <div className="form-row-2">
          <div className="form-group">
            <label className="form-label">最小宽度阈值 (min_width):</label>
            <input
              type="number"
              className="form-input"
              value={minWidth}
              onChange={e => setMinWidth(Number(e.target.value))}
              min="100"
              step="100"
            />
          </div>

          <div className="form-group">
            <label className="form-label">最小高度阈值 (min_height):</label>
            <input
              type="number"
              className="form-input"
              value={minHeight}
              onChange={e => setMinHeight(Number(e.target.value))}
              min="100"
              step="100"
            />
          </div>
        </div>
      </div>

      <div className="settings-card">
        <div className="settings-card-title">
          <Sliders size={16} style={{ color: '#10b981' }} />
          <span>外部图片压缩与交互偏好</span>
        </div>

        <div className="form-row-2">
          <div className="form-group">
            <label className="form-label">外部图片压缩宽度 (image_width):</label>
            <input
              type="number"
              className="form-input"
              value={imageWidth}
              onChange={e => setImageWidth(Number(e.target.value))}
              min="300"
              step="100"
            />
          </div>

          <div className="form-group">
            <label className="form-label">图片压缩质量 (image_quality 1-100):</label>
            <input
              type="number"
              className="form-input"
              value={imageQuality}
              onChange={e => setImageQuality(Number(e.target.value))}
              min="10"
              max="100"
              step="5"
            />
          </div>
        </div>

        <div className="form-group" style={{ marginTop: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={infiniteScroll}
              onChange={e => setInfiniteScroll(e.target.checked)}
              style={{ accentColor: 'var(--accent-color)', width: 16, height: 16 }}
            />
            <span style={{ fontSize: 13, fontWeight: 500 }}>
              滚动至瀑布流底部时自动加载下一页图片 (infinite_scroll)
            </span>
          </label>
        </div>
      </div>
    </>
  );
};
