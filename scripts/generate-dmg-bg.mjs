import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const outSvg = path.join(rootDir, 'assets', 'dmg-background.svg');
const outPng = path.join(rootDir, 'assets', 'dmg-background.png');
// dmgbuild (lookForHiDPI) 会自动寻找同目录下的 name@2x.png，
// 再用 tiffutil -cathidpicheck 合成多分辨率 TIFF 作为 Retina 背景
const outPng2x = path.join(rootDir, 'assets', 'dmg-background@2x.png');

const WIDTH = 600;
const HEIGHT = 420;
const SCALE_2X = 2;

export function generateDmgBackgroundSvg() {
  const width = WIDTH;
  const height = HEIGHT;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <!-- 背景平滑微渐变 -->
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#f8fafc" />
      <stop offset="100%" stop-color="#edf2f7" />
    </linearGradient>

    <!-- 箭头微光渐变 -->
    <linearGradient id="arrowGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#94a3b8" stop-opacity="0.5" />
      <stop offset="50%" stop-color="#3b82f6" stop-opacity="0.8" />
      <stop offset="100%" stop-color="#60a5fa" stop-opacity="1" />
    </linearGradient>

    <!-- 图标底座柔和光环渐变 -->
    <radialGradient id="ringGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#e2e8f0" stop-opacity="0.6" />
      <stop offset="100%" stop-color="#e2e8f0" stop-opacity="0" />
    </radialGradient>
  </defs>

  <!-- 1. 窗口背景与内边框 -->
  <rect x="0" y="0" width="${width}" height="${height}" fill="url(#bgGrad)" />
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" fill="none" stroke="#e2e8f0" stroke-width="1" />

  <!-- 2. 顶部主标题与副标题 -->
  <text x="300" y="70" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif" font-size="22" font-weight="700" fill="#0f172a" text-anchor="middle" letter-spacing="-0.3">
    hpic
  </text>
  <text x="300" y="96" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="500" fill="#64748b" text-anchor="middle">
    Hexo 博客封面与文章配图管理工具 (hexo picture)
  </text>

  <!-- 3. 左侧与右侧图标底座光环 (左: 160, 240 / 右: 440, 240) -->
  <ellipse cx="160" cy="245" rx="72" ry="72" fill="url(#ringGlow)" />
  <circle cx="160" cy="245" r="62" fill="none" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="4 4" />

  <ellipse cx="440" cy="245" rx="72" ry="72" fill="url(#ringGlow)" />
  <circle cx="440" cy="245" r="62" fill="none" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="4 4" />

  <!-- 4. 中间指示拖拽箭头 (高饱和纯色 #3b82f6，圆角加粗线条与尖端) -->
  <g transform="translate(0, 0)">
    <line x1="240" y1="245" x2="358" y2="245" stroke="#3b82f6" stroke-width="3.5" stroke-linecap="round" />
    <path d="M 344,235 L 358,245 L 344,255" fill="none" stroke="#3b82f6" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
  </g>

  <!-- 5. 底部操作提示 -->
  <g transform="translate(300, 360)">
    <rect x="-140" y="-18" width="280" height="34" rx="17" fill="#ffffff" stroke="#e2e8f0" stroke-width="1" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.04))" />
    <text x="0" y="4" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="500" fill="#334155" text-anchor="middle">
      拖拽左侧图标至 Applications 文件夹即可安装
    </text>
  </g>
</svg>
`;
}

/**
 * 将 SVG 母版光栅化为指定物理尺寸的 PNG。
 * 同一矢量源分别按 1x / @2x 渲染，Retina 屏下背景才足够清晰。
 */
function renderPng(width, height, outFilePath) {
  const renderers = [
    // 1. 优先尝试 rsvg-convert (Linux/macOS 常见，完全支持 Alpha 透明背景)
    (w, h, out) => execSync(`rsvg-convert -w ${w} -h ${h} "${outSvg}" -o "${out}"`, { stdio: 'ignore' }),
    // 2. 尝试 inkscape (跨平台通用矢量工具)
    (w, h, out) => execSync(`inkscape -w ${w} -h ${h} "${outSvg}" -o "${out}"`, { stdio: 'ignore' }),
  ];

  // 3. macOS AppKit 原生渲染 (零依赖、高保真)
  if (process.platform === 'darwin') {
    renderers.push((w, h, out) => {
      const code = `import AppKit;let u=URL(fileURLWithPath:"${outSvg}");guard let i=NSImage(contentsOf:u) else{exit(1)};let r=NSBitmapImageRep(bitmapDataPlanes:nil,pixelsWide:${w},pixelsHigh:${h},bitsPerSample:8,samplesPerPixel:4,hasAlpha:true,isPlanar:false,colorSpaceName:.calibratedRGB,bytesPerRow:0,bitsPerPixel:0)!;NSGraphicsContext.saveGraphicsState();NSGraphicsContext.current=NSGraphicsContext(bitmapImageRep:r);i.draw(in:NSRect(x:0,y:0,width:${w},height:${h}));NSGraphicsContext.restoreGraphicsState();if let d=r.representation(using:.png,properties:[:]){try? d.write(to:URL(fileURLWithPath:"${out}"))}`;
      execSync(`swift -e '${code}'`, { stdio: 'ignore' });
    });
  }

  for (const render of renderers) {
    try {
      render(width, height, outFilePath);
      if (fs.existsSync(outFilePath) && fs.statSync(outFilePath).size > 0) return true;
    } catch (_) {}
  }
  return false;
}

export function buildDmgBackground() {
  const svg = generateDmgBackgroundSvg();
  fs.writeFileSync(outSvg, svg, 'utf8');

  // 1x (600x420) 与 @2x (1200x840) 双分辨率输出
  const ok1x = renderPng(WIDTH, HEIGHT, outPng);
  const ok2x = renderPng(WIDTH * SCALE_2X, HEIGHT * SCALE_2X, outPng2x);

  // @2x 未生成成功时清除残留文件：避免与新生成的 1x 背景尺寸不匹配，
  // 被 dmgbuild 的 tiffutil -cathidpicheck 判定为非法而对账失败
  if (!ok2x && fs.existsSync(outPng2x)) {
    fs.unlinkSync(outPng2x);
  }
  return ok1x;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const ok = buildDmgBackground();
  if (ok) {
    console.log(`[OK] 成功生成 assets/dmg-background.png (${WIDTH}x${HEIGHT}) 与 assets/dmg-background@2x.png (${WIDTH * SCALE_2X}x${HEIGHT * SCALE_2X})`);
  } else {
    console.warn('[WARN] 未能生成 assets/dmg-background.png');
  }
}
