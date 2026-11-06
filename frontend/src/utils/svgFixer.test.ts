import { describe, it, expect } from 'vitest';
import { fixSvgViewBox } from './svgFixer';

describe('svgFixer utility tests', () => {
  it('should inject viewBox when root svg has width and height but no viewBox', () => {
    const rawSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="1502" height="948"><foreignObject width="100%" height="100%"><div>Content</div></foreignObject></svg>';
    const result = fixSvgViewBox(rawSvg, 'contain');
    expect(result.changed).toBe(true);
    expect(result.width).toBe(1502);
    expect(result.height).toBe(948);
    expect(result.text).toContain('viewBox="0 0 1502 948"');
    expect(result.text).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(result.text).toContain('width="100%"');
    expect(result.text).toContain('height="100%"');
  });

  it('should set preserveAspectRatio to slice in cover mode', () => {
    const rawSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect /></svg>';
    const result = fixSvgViewBox(rawSvg, 'cover');
    expect(result.changed).toBe(true);
    expect(result.text).toContain('preserveAspectRatio="xMidYMid slice"');
    expect(result.text).toContain('viewBox="0 0 800 600"');
  });

  it('should preserve existing viewBox if root already has one', () => {
    const rawSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle /></svg>';
    const result = fixSvgViewBox(rawSvg, 'contain');
    expect(result.text).toContain('viewBox="0 0 100 100"');
    expect(result.text).toContain('preserveAspectRatio="xMidYMid meet"');
  });

  it('should derive dimensions from viewBox when root has no absolute width/height', () => {
    const rawSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle /></svg>';
    const result = fixSvgViewBox(rawSvg, 'contain');
    expect(result.width).toBe(24);
    expect(result.height).toBe(24);
    expect(result.text).toContain('width="100%"');
    expect(result.text).toContain('height="100%"');
  });

  it('should override preserveAspectRatio="none" according to fitMode', () => {
    const rawSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="20" preserveAspectRatio="none"><rect /></svg>';
    const contain = fixSvgViewBox(rawSvg, 'contain');
    expect(contain.text).toContain('preserveAspectRatio="xMidYMid meet"');
    const cover = fixSvgViewBox(rawSvg, 'cover');
    expect(cover.text).toContain('preserveAspectRatio="xMidYMid slice"');
  });

  it('should keep xml prolog and trailing markup intact', () => {
    const rawSvg =
      '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50"><rect /></svg>\n<!-- footer -->';
    const result = fixSvgViewBox(rawSvg, 'contain');
    expect(result.text.startsWith('<?xml version="1.0"')).toBe(true);
    expect(result.text.endsWith('\n<!-- footer -->')).toBe(true);
    expect(result.text).toContain('viewBox="0 0 50 50"');
  });

  it('should return original text when no svg root exists', () => {
    const raw = '<div>not svg</div>';
    const result = fixSvgViewBox(raw, 'contain');
    expect(result.changed).toBe(false);
    expect(result.text).toBe(raw);
  });

  it('should neutralize inner 2x scale when carbon export div matches root size', () => {
    // 根为 1x 画布 990x1020，内层 export-container 与画布同尺寸 + scale(2)（缩放后会溢出）
    const rawSvg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="990" height="1020">' +
      '<foreignObject x="0" y="0" width="100%" height="100%">' +
      '<div xmlns="http://www.w3.org/1999/xhtml" style="width: 990px; height: 1020px; transform: scale(2); transform-origin: center center;">card</div>' +
      '</foreignObject></svg>';
    const result = fixSvgViewBox(rawSvg, 'contain');
    expect(result.changed).toBe(true);
    expect(result.text).toContain('viewBox="0 0 990 1020"');
    expect(result.text).toContain('transform: none');
    expect(result.text).not.toContain('scale(2)');
    // 尺寸与 transform-origin 保留，避免破坏原有布局语义
    expect(result.text).toContain('width: 990px');
    expect(result.text).toContain('height: 1020px');
  });

  it('should neutralize full-canvas 2x overflow: export div is the content itself', () => {
    // 内容即 export-container 自身（无半幅内容载体）：990x1020 + scale(2) 会溢出视口，
    // 中和后内容按原始尺寸完整呈现。
    const rawSvg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="990" height="1020">' +
      '<foreignObject x="0" y="0" width="100%" height="100%">' +
      '<div xmlns="http://www.w3.org/1999/xhtml" style="place-content: normal; inline-size: 494.094px; block-size: 510px; width: 990px; height: 1020px; transform: scale(2); transform-origin: center center;">card</div>' +
      '</foreignObject></svg>';
    const result = fixSvgViewBox(rawSvg, 'contain');
    expect(result.changed).toBe(true);
    expect(result.text).toContain('transform: none');
    expect(result.text).not.toContain('scale(2)');
    // 冲突的逻辑声明被移除，物理尺寸保留
    expect(result.text).not.toContain('inline-size');
    expect(result.text).not.toContain('block-size');
    expect(result.text).toContain('width: 990px');
    expect(result.text).toContain('height: 1020px');
    // 相邻声明之间保留合法分隔（不出现属性粘连）
    expect(result.text).toContain('place-content: normal; width: 990px');
  });

  it('should keep scale(2) for real carbon export structure (half-size content carrier)', () => {
    // 真实 carbon 导出（jsdelivr 资产 + Chromium/WebKit 双引擎截图像素实测）：
    // export-container 自身 = 画布 990x1020 + scale(2)，其内容载体（.container）
    // 按半幅 494.094x510 绘制，放大 2 倍后恰好铺满视口。
    // 此时**必须保留 scale**：中和会让半幅内容缩到视口左上角，实测只剩 1/4 大小。
    const rawSvg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="990" height="1020">' +
      '<foreignObject x="0" y="0" width="100%" height="100%">' +
      '<div xmlns="http://www.w3.org/1999/xhtml" id="export-container" style="place-content: normal; inline-size: 494.094px; block-size: 510px; width: 990px; height: 1020px; transform: scale(2); transform-origin: center center;">' +
      '<div class="container" style="width: 494.094px; height: 510px; transform: none;">card</div>' +
      '</div>' +
      '</foreignObject></svg>';
    const result = fixSvgViewBox(rawSvg, 'contain');
    expect(result.changed).toBe(true);
    // 正确的 2x 密度缩放：保留 scale(2) 与 transform-origin
    expect(result.text).toContain('transform: scale(2); transform-origin: center center');
    // export-container 上冲突的逻辑声明被归一化移除，物理尺寸保留
    expect(result.text).not.toContain('inline-size');
    expect(result.text).not.toContain('block-size');
    expect(result.text).toContain('width: 990px');
    expect(result.text).toContain('height: 1020px');
    // 内容载体为半幅，存在即说明结构被完整识别（未被篡改）
    expect(result.text).toContain('width: 494.094px');
  });

  it('should keep scale(2) when content carrier uses logical sizes only', () => {
    // 内容载体只声明逻辑尺寸（inline-size/block-size）时同样按半幅识别，保留 scale
    const rawSvg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="990" height="1020">' +
      '<foreignObject x="0" y="0" width="100%" height="100%">' +
      '<div xmlns="http://www.w3.org/1999/xhtml" style="width: 990px; height: 1020px; transform: scale(2); transform-origin: center center;">' +
      '<div class="container" style="inline-size: 494.094px; block-size: 510px;">card</div>' +
      '</div>' +
      '</foreignObject></svg>';
    const result = fixSvgViewBox(rawSvg, 'contain');
    expect(result.text).toContain('scale(2)');
    expect(result.text).not.toContain('transform: none');
  });

  it('should not neutralize inner scale when root is a proper 2x canvas', () => {
    // 正确的 carbon 导出：根 1980x2040，viewBox 990x1020，内层内容按逻辑尺寸绘制 + scale(2) 才完整
    const rawSvg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="1980" height="2040" viewBox="0 0 990 1020">' +
      '<foreignObject x="0" y="0" width="100%" height="100%">' +
      '<div xmlns="http://www.w3.org/1999/xhtml" style="width: 990px; height: 1020px; transform: scale(2); transform-origin: center center;">card</div>' +
      '</foreignObject></svg>';
    const result = fixSvgViewBox(rawSvg, 'contain');
    expect(result.changed).toBe(true);
    expect(result.text).toContain('scale(2)');
    expect(result.text).not.toContain('transform: none');
  });

  it('should keep inner scale untouched when div size differs from root', () => {
    const rawSvg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="990" height="1020">' +
      '<foreignObject x="0" y="0" width="100%" height="100%">' +
      '<div style="width: 495px; height: 510px; transform: scale(2);">card</div>' +
      '</foreignObject></svg>';
    const result = fixSvgViewBox(rawSvg, 'contain');
    expect(result.text).toContain('scale(2)');
    expect(result.text).not.toContain('transform: none');
  });

  it('should convert logical inline-size/block-size to physical when no width/height exists', () => {
    // 只有逻辑尺寸时（无物理宽度），归一化为 width/height 后按内容尺寸判定
    const rawSvg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="990" height="1020">' +
      '<foreignObject x="0" y="0" width="100%" height="100%">' +
      '<div style="inline-size: 495px; block-size: 510px; transform: scale(2);">card</div>' +
      '</foreignObject></svg>';
    const result = fixSvgViewBox(rawSvg, 'contain');
    // 495x510 x scale(2) 恰好铺满 990x1020：正确的密度缩放，保留 scale
    expect(result.text).toContain('scale(2)');
    expect(result.text).not.toContain('transform: none');
    // 逻辑属性被改写为物理属性
    expect(result.text).toContain('width: 495px');
    expect(result.text).toContain('height: 510px');
    expect(result.text).not.toContain('inline-size');
    expect(result.text).not.toContain('block-size');
  });
});
