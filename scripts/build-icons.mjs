import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const svgPath = path.join(rootDir, 'assets', 'icon.svg');
const outDir = path.join(rootDir, 'assets', 'dist');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// ==========================================
// 1. 声明式 SVG 图形构造器 (Declarative SVG Builder)
// ==========================================

/** 声明式节点构造函数 */
const h = (tag, attrs = {}, ...children) => {
  const props = Object.entries(attrs)
    .filter(([_, v]) => v !== undefined && v !== null && v !== false)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ');
  const inner = children.flat().filter(Boolean).join('\n  ');
  const openTag = props ? `<${tag} ${props}>` : `<${tag}>`;
  return inner ? `${openTag}\n  ${inner}\n</${tag}>` : props ? `<${tag} ${props}/>` : `<${tag}/>`;
};

/** 图标几何与视觉系统配置 */
const ICON_THEME = {
  canvas: { size: 1024, center: { x: 512, y: 512 } },
  shutter: {
    // 1. 被盖的主体部分 (Base: 严格 60° 扇区，6 块刚好拼满 360° 无缝大圆环)
    basePath: 'M -63.5,-110 L -63.5,-425.3 A 430 430 0 0 1 336.6,-267.6 L 63.5,-110 Z',
    // 2. 盖别人的搭接部分 (Flap: 向内延伸融合同色基底消除发丝缝，向外压在下一瓣主体上，形成完美莫比乌斯环形互锁)
    flapPath: 'M 20,-110 L 290,-315 A 430 430 0 0 1 355,-243 L 150,-110 Z',
    shadowRect: { x: -63.5, y: -425.3, width: 24, height: 315.3 },
    // 6 瓣顺时针高饱和纯色调色板
    colors: [
      '#ef4444', // 0°:   Red
      '#f97316', // 60°:  Orange
      '#eab308', // 120°: Yellow
      '#10b981', // 180°: Green
      '#3b82f6', // 240°: Blue
      '#8b5cf6', // 300°: Purple
    ],
  },
};

/** 代码生成 1024x1024 矢量母版 SVG (透明背景、高对比度六色莫比乌斯快门光圈) */
export function generateIconSvg() {
  const { canvas, shutter } = ICON_THEME;

  // 1. Defs: 接触阴影渐变、Base (被盖底片)、Flap (盖人搭接片) 与阴影 Rect
  const defs = h('defs', {},
    h('linearGradient', { id: 'stepShadow', x1: '0%', y1: '0%', x2: '100%', y2: '0%' },
      h('stop', { offset: '0%', 'stop-color': '#000000', 'stop-opacity': '0.22' }),
      h('stop', { offset: '60%', 'stop-color': '#000000', 'stop-opacity': '0.06' }),
      h('stop', { offset: '100%', 'stop-color': '#000000', 'stop-opacity': '0' })
    ),
    h('path', { id: 'bladeBase', d: shutter.basePath }),
    h('path', { id: 'bladeFlap', d: shutter.flapPath }),
    h('rect', {
      id: 'bladeShadow',
      x: shutter.shadowRect.x,
      y: shutter.shadowRect.y,
      width: shutter.shadowRect.width,
      height: shutter.shadowRect.height,
      fill: 'url(#stepShadow)',
    })
  );

  // 2. 6 叶快门光圈旋转图层装配 (Base + Shadow + Flap 三层架构，C6 纯数学统一旋转)
  // 层 1: 6 个 Base 底板 (各以 60° 步长旋转，刚好平铺拼接成 360° 大圆环)
  const baseNodes = shutter.colors.map((c, i) =>
    h('use', { href: '#bladeBase', fill: c, transform: `rotate(${i * 60})` })
  );

  // 层 2: 6 道统一环形接触阴影 (各以 60° 步长旋转，紧贴切线落在被覆盖的下层叶片表面)
  const shadowNodes = shutter.colors.map((_, i) =>
    h('use', { href: '#bladeShadow', transform: `rotate(${i * 60 + 60})` })
  );

  // 层 3: 6 个 Flap 搭接顶片 (各以 60° 步长旋转，盖在下一瓣的主体上，实现 100% 完美的莫比乌斯环形互锁)
  const flapNodes = shutter.colors.map((c, i) =>
    h('use', { href: '#bladeFlap', fill: c, transform: `rotate(${i * 60})` })
  );

  const apertureGroup = h('g', { transform: `translate(${canvas.center.x}, ${canvas.center.y})` },
    ...baseNodes,
    ...shadowNodes,
    ...flapNodes
  );

  return h(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: `0 0 ${canvas.size} ${canvas.size}`,
      width: canvas.size,
      height: canvas.size,
    },
    defs,
    apertureGroup
  );
}

// ==========================================
// 2. 跨平台图标衍生构建 (ICNS / ICO / PNG / Desktop)
// ==========================================

const SIZES = [16, 32, 48, 64, 128, 256, 512, 1024];

function renderPng(size, outFilePath) {
  // 1. 尝试使用 rsvg-convert (Linux/macOS 常见)
  try {
    execSync(`rsvg-convert -w ${size} -h ${size} "${svgPath}" -o "${outFilePath}"`, { stdio: 'ignore' });
    return true;
  } catch (_) {}

  // 2. 尝试使用 inkscape (跨平台通用矢量工具)
  try {
    execSync(`inkscape -w ${size} -h ${size} "${svgPath}" -o "${outFilePath}"`, { stdio: 'ignore' });
    return true;
  } catch (_) {}

  // 3. 在 macOS 上使用 sips / QuickLook / qlmanage 原生转换
  if (process.platform === 'darwin') {
    try {
      execSync(`qlmanage -t -s ${size} -o "${outDir}" "${svgPath}"`, { stdio: 'ignore' });
      const qlOut = path.join(outDir, 'icon.svg.png');
      if (fs.existsSync(qlOut)) {
        fs.copyFileSync(qlOut, outFilePath);
        fs.unlinkSync(qlOut);
        return true;
      }
    } catch (_) {}
  }

  return false;
}

function buildWindowsIco(pngMap, icoFilePath) {
  const icoSizes = [16, 32, 48, 64, 128, 256];
  const images = [];

  for (const s of icoSizes) {
    if (pngMap[s] && fs.existsSync(pngMap[s])) {
      const buf = fs.readFileSync(pngMap[s]);
      images.push({ size: s, buffer: buf });
    }
  }

  if (images.length === 0) return false;

  const count = images.length;
  const headerSize = 6 + count * 16;
  let offset = headerSize;

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // 1 = ICO
  header.writeUInt16LE(count, 4);

  const entryBuffers = [];
  const imageBuffers = [];

  for (const img of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(img.size >= 256 ? 0 : img.size, 0); // Width
    entry.writeUInt8(img.size >= 256 ? 0 : img.size, 1); // Height
    entry.writeUInt8(0, 2); // Colors
    entry.writeUInt8(0, 3); // Reserved
    entry.writeUInt16LE(1, 4); // Planes
    entry.writeUInt16LE(32, 6); // Bits per pixel
    entry.writeUInt32LE(img.buffer.length, 8); // Size
    entry.writeUInt32LE(offset, 12); // Offset

    entryBuffers.push(entry);
    imageBuffers.push(img.buffer);
    offset += img.buffer.length;
  }

  const finalIco = Buffer.concat([header, ...entryBuffers, ...imageBuffers]);
  fs.writeFileSync(icoFilePath, finalIco);
  return true;
}

function buildLinuxDesktop(desktopPath) {
  const content = `[Desktop Entry]
Name=hpic
Comment=Hexo Blog Cover and Drafts Image Manager
Exec=hpic
Icon=hpic
Terminal=false
Type=Application
Categories=Development;Utility;
Keywords=hpic;hexo;blog;cover;banner;picture;
`;
  fs.writeFileSync(desktopPath, content, 'utf8');
}

async function main() {
  console.log('--- hpic 图标构建工具 ---');

  // 1. 纯代码生成矢量母版 SVG
  console.log('[1/5] 执行矢量算法，纯代码生成 SVG 母版...');
  const svgContent = generateIconSvg();
  fs.writeFileSync(svgPath, svgContent, 'utf8');
  console.log('   [OK] 写入 assets/icon.svg');

  // 2. 同步 Web 前端 Favicon
  console.log('[2/5] 同步前端矢量 favicon.svg...');
  const faviconPath = path.join(rootDir, 'frontend', 'public', 'favicon.svg');
  const webFaviconPath = path.join(rootDir, 'web', 'favicon.svg');
  if (!fs.existsSync(path.dirname(faviconPath))) {
    fs.mkdirSync(path.dirname(faviconPath), { recursive: true });
  }
  fs.writeFileSync(faviconPath, svgContent, 'utf8');
  if (fs.existsSync(path.dirname(webFaviconPath))) {
    fs.writeFileSync(webFaviconPath, svgContent, 'utf8');
  }
  console.log('   [OK] 前端 favicon.svg 同步完成');

  // 3. 渲染多分辨率 PNG 集合
  console.log('[3/5] 渲染多平台各尺寸 PNG 集合...');
  const pngMap = {};
  for (const s of SIZES) {
    const p = path.join(outDir, `icon_${s}x${s}.png`);
    const ok = renderPng(s, p);
    if (ok) pngMap[s] = p;
  }

  const generatedCount = Object.keys(pngMap).length;
  if (generatedCount === 0) {
    console.warn('\n[WARN] 未找到可用的 SVG 转 PNG 工具，PNG 渲染跳过。');
    if (process.platform === 'win32') {
      console.warn('   Windows 系统请安装 Inkscape 或 rsvg-convert 并加入 PATH');
    } else {
      console.warn('   macOS: brew install librsvg | Linux: sudo apt install librsvg2-bin');
    }
  } else {
    console.log(`   [OK] 成功渲染 ${generatedCount}/${SIZES.length} 种规格 PNG`);
  }

  // 4. 针对 macOS 生成 AppIcon.icns
  if (process.platform === 'darwin') {
    console.log('[4/5] 构建 macOS AppIcon.icns...');
    const iconsetDir = path.join(rootDir, 'native_macos', 'AppIcon.iconset');
    if (!fs.existsSync(iconsetDir)) fs.mkdirSync(iconsetDir, { recursive: true });

    const mappings = [
      { name: 'icon_16x16.png', size: 16 },
      { name: 'icon_16x16@2x.png', size: 32 },
      { name: 'icon_32x32.png', size: 32 },
      { name: 'icon_32x32@2x.png', size: 64 },
      { name: 'icon_128x128.png', size: 128 },
      { name: 'icon_128x128@2x.png', size: 256 },
      { name: 'icon_256x256.png', size: 256 },
      { name: 'icon_256x256@2x.png', size: 512 },
      { name: 'icon_512x512.png', size: 512 },
      { name: 'icon_512x512@2x.png', size: 1024 },
    ];

    for (const m of mappings) {
      if (pngMap[m.size]) {
        fs.copyFileSync(pngMap[m.size], path.join(iconsetDir, m.name));
      }
    }

    try {
      execSync(`iconutil -c icns "${iconsetDir}" -o "${path.join(rootDir, 'native_macos', 'AppIcon.icns')}"`);
      console.log('   [OK] 生成 native_macos/AppIcon.icns');
    } catch (_) {}
  }

  // 5. 针对 Windows 与 Linux 构建对应包资产
  console.log('[5/5] 构建 Windows ICO 与 Linux Desktop 桌面配置...');
  const icoPath = path.join(outDir, 'app.ico');
  const winIcoRoot = path.join(rootDir, 'assets', 'app.ico');
  if (buildWindowsIco(pngMap, icoPath)) {
    fs.copyFileSync(icoPath, winIcoRoot);
    console.log('   [OK] 生成 assets/app.ico (内嵌 16/32/48/64/128/256px)');
  } else {
    console.warn('   [WARN] 未能生成 assets/app.ico: 缺少 PNG 源图');
  }

  const desktopPath = path.join(outDir, 'hpic.desktop');
  buildLinuxDesktop(desktopPath);
  fs.copyFileSync(desktopPath, path.join(rootDir, 'assets', 'hpic.desktop'));

  const linuxPng = pngMap[256] || pngMap[512] || pngMap[1024];
  if (linuxPng && fs.existsSync(linuxPng)) {
    fs.copyFileSync(linuxPng, path.join(rootDir, 'assets', 'icon.png'));
  }
  console.log('   [OK] 生成 assets/hpic.desktop 与 Linux 图标');

  console.log('全套跨平台图标自动化构建完成。');
}

main().catch(err => {
  console.error('构建出错:', err);
  process.exit(1);
});
