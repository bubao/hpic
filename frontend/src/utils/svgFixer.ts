import { useState, useEffect } from 'react';
import { api } from '../api';
import { isSvgUrl } from './imageMeta';

export type SvgFitMode = 'contain' | 'cover';

const CONTAIN_RATIO = 'xMidYMid meet';
const COVER_RATIO = 'xMidYMid slice';

export interface SvgDimensions {
  width: number;
  height: number;
}

export interface FixedSvg {
  text: string;
  width?: number;
  height?: number;
  changed: boolean;
}

/**
 * 修复 SVG 文本：
 * 1. 确保根 `<svg>` 标签包含 viewBox，若无则根据根标签的 width/height（或已有 viewBox）注入；
 * 2. 把根标签的绝对宽高统一改写为 100%，解除绝对像素对内嵌文档缩放的限制；
 * 3. 注入或更新 preserveAspectRatio，支持 'contain' (meet) 与 'cover' (slice) 模式；
 * 4. 校准 foreignObject 内层的 2x「Retina 导出」缩放（carbon.now.sh / socialify 代码海报）：
 *    这类文件的 export-container 形如 `width/height = 画布尺寸` + `transform: scale(2)`，
 *    其内部**内容载体**（子元素，如 carbon 的 `.container`）按**半幅**绘制。
 *    判定必须以内容载体为基准：
 *    - 内容载体 尺寸 × N ≈ 根尺寸 → 正确的 2x 密度缩放，**保留 scale**（中和反而会让
 *      半幅内容缩在角落，实测只剩 1/4 视口）；
 *    - export-container 自身尺寸 ≈ 根尺寸且 scale(N>1)（内容就是自身、缩放后溢出）
 *      → 中和为 none，完整呈现；
 *    - 其余尺寸关系不明时**保守不动**。
 *
 * 说明：`<object>`/`img` 的 CSS `object-fit` 对内嵌 SVG 文档无效，
 * 内嵌文档只会按自身的 width/height 渲染，因此必须让根标签自适应容器，
 * 由 viewBox + preserveAspectRatio 完成真正的矢量等比缩放。
 */
export function fixSvgViewBox(svgText: string, fitMode: SvgFitMode = 'contain'): FixedSvg {
  const rootMatch = /<svg\b([^>]*)>/i.exec(svgText);
  if (!rootMatch || rootMatch.index === undefined) {
    return { text: svgText, changed: false };
  }

  const rootTag = rootMatch[0];
  const rootAttrs = rootMatch[1];
  // 根标签自闭合时需保留 "/>"
  const selfClosing = /\/\s*>$/.test(rootTag);

  const vbMatch =
    /\bviewBox\s*=\s*["']\s*([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)\s*["']/i.exec(
      rootAttrs
    );
  const wMatch = /\bwidth\s*=\s*["']?([-\d.]+)(?:px|pt|em|rem)?["']?/i.exec(rootAttrs);
  const hMatch = /\bheight\s*=\s*["']?([-\d.]+)(?:px|pt|em|rem)?["']?/i.exec(rootAttrs);

  let width = wMatch ? parseFloat(wMatch[1]) : undefined;
  let height = hMatch ? parseFloat(hMatch[1]) : undefined;
  // 根标签没有绝对宽高时，用 viewBox 推导一个等效分辨率（用于宽高比元数据）
  if (!width && vbMatch) width = parseFloat(vbMatch[3]);
  if (!height && vbMatch) height = parseFloat(vbMatch[4]);

  let newAttrs = rootAttrs;
  let changed = false;

  // 1. 缺少 viewBox 时自动补全
  if (!/\bviewBox\b/i.test(rootAttrs)) {
    if (width && height && width > 0 && height > 0) {
      newAttrs += ` viewBox="0 0 ${width} ${height}"`;
      changed = true;
    }
  }

  // 2. 根标签绝对宽高替换为 100%，彻底解除内嵌文档的像素锁定
  const widthAttr = /\bwidth\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i;
  if (widthAttr.test(newAttrs)) {
    newAttrs = newAttrs.replace(widthAttr, 'width="100%"');
    changed = true;
  } else {
    newAttrs += ' width="100%"';
    changed = true;
  }

  const heightAttr = /\bheight\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i;
  if (heightAttr.test(newAttrs)) {
    newAttrs = newAttrs.replace(heightAttr, 'height="100%"');
    changed = true;
  } else {
    newAttrs += ' height="100%"';
    changed = true;
  }

  // 3. 根据 fitMode 设置 preserveAspectRatio（SVG 内部裁剪/留白的唯一依据）
  const ratioAttr = /\bpreserveAspectRatio\s*=\s*("[^"]*"|'[^']*')/i;
  const desiredRatio = fitMode === 'cover' ? COVER_RATIO : CONTAIN_RATIO;
  if (ratioAttr.test(newAttrs)) {
    newAttrs = newAttrs.replace(ratioAttr, `preserveAspectRatio="${desiredRatio}"`);
    changed = true;
  } else {
    newAttrs += ` preserveAspectRatio="${desiredRatio}"`;
    changed = true;
  }

  if (!changed) return { text: svgText, width, height, changed: false };

  const rebuilt = `<svg${newAttrs}${selfClosing ? '/>' : '>'}`;
  let newSvgText =
    svgText.slice(0, rootMatch.index) + rebuilt + svgText.slice(rootMatch.index + rootTag.length);

  // 4. 中和 carbon/socialify 代码海报内层的 2x 缩放（内层有效尺寸 == 根尺寸、缩放会溢出时才处理）
  const neutralized = neutralizeForeignObjectScale(newSvgText, width, height);
  if (neutralized.changed) {
    newSvgText = neutralized.text;
    changed = true;
  }

  return { text: newSvgText, width, height, changed: true };
}

/**
 * 校准 foreignObject 内容层里的 `transform: scale(N)`（N > 1）。
 *
 * 背景（真实 carbon/socialify 导出，经 Chromium 与 WebKit 双引擎 + 截图像素实测）：
 * 这类文件的内层 export-container 写成 `width/height = 画布尺寸` + `transform: scale(2)`，
 * 排版时物理 width/height 生效（`inline-size/block-size` 被覆盖），
 * 且 export-container 内部还有一个**半幅的内容载体**（carbon 的 `.container`，
 * 494x510 ≈ 990x1020 的一半），由 scale(2) 放大后恰好铺满视口。
 *
 * 判定基准是**内容载体**（export-container 的第一个元素子节点），而非 export-container 自身：
 * - 载体 尺寸 × N ≈ 根尺寸 —— 正确的「Retina 2x」密度缩放，**保留 scale**；
 *   （若误把 export-container 自身当作内容层去中和，半幅内容会缩到视口 1/4）
 * - export-container 自身尺寸 ≈ 根尺寸且 scale(N>1) —— 内容即自身、缩放后溢出视口，
 *   **中和为 none**；
 * - 其余无法安全判断的尺寸关系 —— 保守不动。
 *
 * 无论保留还是中和，都会顺手移除与物理属性冲突的 `inline-size/block-size` 声明
 * （若只有逻辑属性则改写为物理属性），消除不同引擎对逻辑属性优先级处理的差异。
 */
function neutralizeForeignObjectScale(
  svgText: string,
  rootWidth?: number,
  rootHeight?: number
): { text: string; changed: boolean } {
  if (!rootWidth || !rootHeight) return { text: svgText, changed: false };

  const foMatch = /<foreignObject\b[^>]*>([\s\S]*?)<\/foreignObject>/i.exec(svgText);
  if (!foMatch) return { text: svgText, changed: false };
  const inner = foMatch[1];

  // foreignObject 内容层的第一个元素（carbon 的 export-container div）
  const elMatch = /<[A-Za-z][\w-]*\b[^>]*>/i.exec(inner);
  if (!elMatch) return { text: svgText, changed: false };
  const elTag = elMatch[0];

  const styleMatch = /\bstyle\s*=\s*("([^"]*)"|'([^']*)')/i.exec(elTag);
  if (!styleMatch) return { text: svgText, changed: false };
  let style = styleMatch[2] ?? styleMatch[3] ?? '';

  const scaleMatch = /((?:^|;)\s*transform\s*:\s*)scale\(\s*(\d+(?:\.\d+)?)\s*\)/i.exec(style);
  if (!scaleMatch) return { text: svgText, changed: false };
  const scale = parseFloat(scaleMatch[2]);
  if (!Number.isFinite(scale) || scale <= 1) return { text: svgText, changed: false };

  // 归一化逻辑尺寸属性（物理属性优先，消除引擎差异）：
  // 有物理属性时删除冲突的逻辑属性；没有则把逻辑属性改写为物理属性。
  const normalizedStyle = style
    .replace(/\s*(inline-size|block-size)\s*:\s*([^;]+);?/gi, (decl, prop: string, value: string) => {
      const physical = prop === 'inline-size' ? 'width' : 'height';
      const hasPhysical = new RegExp(`(?:^|;)\\s*${physical}\\s*:`, 'i').test(style);
      // 声明前的分隔符（分号）保留在原串中，因此删除时直接移除整段声明；
      // 没有物理属性时改写为物理属性（值沿用逻辑尺寸）
      return hasPhysical ? '' : `${physical}: ${value.trim()};`;
    })
    // 删除声明后可能留下 `; ;`，压缩为空声明
    .replace(/;\s*;/g, ';')
    .replace(/^;+/, '');

  // 读取某个尺寸属性的物理像素值（物理 width/height 才是实际生效值）。
  // source 既可以是纯样式串，也可以是标签串（自动提取 style="..." 的内容再匹配）。
  const readPx = (source: string, prop: string): number | undefined => {
    const styleAttr = /\bstyle\s*=\s*("([^"]*)"|'([^']*)')/i.exec(source);
    const body = styleAttr ? styleAttr[2] ?? styleAttr[3] ?? '' : source;
    const match = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*(\\d+(?:\\.\\d+)?)\\s*px`, 'i').exec(body);
    return match ? parseFloat(match[1]) : undefined;
  };

  // 内容载体：export-container 的第一个元素子节点（carbon 的 `.container` 按半幅绘制，
  // 由 scale(2) 放大后恰好铺满视口）。找不到时不臆测，按 export-container 自身判定。
  const afterEl = inner.slice(elTag.length);
  const carrierMatch = /<[A-Za-z][\w-]*\b[^>]*>/i.exec(afterEl);
  const carrierTag = carrierMatch ? carrierMatch[0] : null;
  const carrierW = carrierTag
    ? readPx(carrierTag, 'width') ?? readPx(carrierTag, 'inline-size')
    : undefined;
  const carrierH = carrierTag
    ? readPx(carrierTag, 'height') ?? readPx(carrierTag, 'block-size')
    : undefined;

  // 物理 width/height 才是实际生效的尺寸（inline-size/block-size 会被物理属性覆盖）
  const contentW = readPx(normalizedStyle, 'width');
  const contentH = readPx(normalizedStyle, 'height');

  // 允许亚像素/边框带来的微小误差
  const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(2, b * 0.005);

  // 载体按半幅绘制、放大 N 倍恰好铺满画布：正确的 2x 密度缩放，**保留 scale**
  // （这是真实 carbon 导出的结构；若此时中和，半幅内容会缩到视口左上 1/4）
  const carrierFills =
    carrierW !== undefined &&
    carrierH !== undefined &&
    near(carrierW * scale, rootWidth) &&
    near(carrierH * scale, rootHeight);

  // export-container 自身尺寸就等于根尺寸、scale>1 会溢出视口：内容即自身时才中和
  const selfOverflows =
    contentW !== undefined &&
    contentH !== undefined &&
    near(contentW, rootWidth) &&
    near(contentH, rootHeight);

  // 保留分支：写回归一化后的样式，消除逻辑/物理声明冲突，但不动 scale
  if (carrierFills || !selfOverflows) {
    if (normalizedStyle === style) return { text: svgText, changed: false };
    return writeBack(normalizedStyle);
  }

  // 中和分支：scale 重置为 none，内容按原始尺寸完整呈现
  return writeBack(normalizedStyle.replace(scaleMatch[0], `${scaleMatch[1]}none`));

  function writeBack(finalStyle: string): { text: string; changed: boolean } {
    // 外层已做过非空检查；嵌套函数内重新收窄一次，避免闭包变量的控制流分析失效
    const sm = styleMatch;
    if (!sm) return { text: svgText, changed: false };
    const quote = sm[1][0];
    const newElTag = elTag.replace(sm[0], `style=${quote}${finalStyle}${quote}`);
    const text = svgText.replace(elTag, newElTag);
    return { text, changed: text !== svgText };
  }
}

export interface SvgCacheEntry {
  url: string;
  dimensions?: SvgDimensions;
  /** 直连与代理均失败时为 true，调用方可选择是否放弃升级 */
  failed?: boolean;
}

// 内存中 SVG Blob URL 缓存，避免重复请求和重复解析
const svgCache = new Map<string, SvgCacheEntry>();
// 正在进行的解析任务，避免 StrictMode / 多组件同时挂载时重复请求
const pendingTasks = new Map<string, Promise<SvgCacheEntry>>();

const MAX_CACHE_ENTRIES = 64;

function rememberBlob(key: string, entry: SvgCacheEntry) {
  svgCache.set(key, entry);
  while (svgCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = svgCache.keys().next().value as string | undefined;
    if (!oldestKey || oldestKey === key) break;
    const oldest = svgCache.get(oldestKey);
    svgCache.delete(oldestKey);
    if (oldest && /^blob:/.test(oldest.url)) {
      try {
        URL.revokeObjectURL(oldest.url);
      } catch {
        // 忽略释放失败
      }
    }
  }
}

/** 解码 data:image/svg+xml 的 Data URI（支持 ;utf8、;charset=utf-8 与 ;base64） */
function decodeSvgDataUri(uri: string): string | null {
  if (!uri.startsWith('data:image/svg+xml')) return null;
  const commaIdx = uri.indexOf(',');
  if (commaIdx === -1) return null;

  const header = uri.slice(0, commaIdx);
  const payload = uri.slice(commaIdx + 1);
  if (/;base64/i.test(header)) {
    try {
      return atob(payload);
    } catch {
      return null;
    }
  }
  try {
    return decodeURIComponent(payload);
  } catch {
    return payload;
  }
}

async function resolveFixedSvg(url: string, fitMode: SvgFitMode): Promise<SvgCacheEntry> {
  const cacheKey = `${url}::${fitMode}`;
  const cached = svgCache.get(cacheKey);
  if (cached) return cached;

  let svgText: string | null = decodeSvgDataUri(url);
  if (svgText === null) {
    // 直连失败时由 api 层回退到本地图像代理（绕过 CORS 与防盗链）
    svgText = await api.fetchImageText(url);
  }

  let entry: SvgCacheEntry;
  if (svgText === null) {
    // 全部失败：平滑降级使用原始 URL（保持原有渲染路径，不阻塞 UI）
    entry = { url, failed: true };
  } else {
    const fixed = fixSvgViewBox(svgText, fitMode);
    if (!fixed.changed) {
      entry = { url, dimensions: fixed.width && fixed.height ? { width: fixed.width, height: fixed.height } : undefined };
    } else {
      entry = {
        url: URL.createObjectURL(new Blob([fixed.text], { type: 'image/svg+xml' })),
        dimensions: fixed.width && fixed.height ? { width: fixed.width, height: fixed.height } : undefined,
      };
    }
  }

  rememberBlob(cacheKey, entry);
  return entry;
}

/**
 * 非 React 场景（命令式 DOM 升级，如 Markdown 正文后处理）可用的
 * 安全 SVG 解析入口：走同一份缓存与单飞任务，返回修复后的 Blob URL。
 */
export function resolveSafeSvgUrl(url: string, fitMode: SvgFitMode = 'contain'): Promise<SvgCacheEntry> {
  const key = `${url}::${fitMode}`;
  const task = pendingTasks.get(key) ?? resolveFixedSvg(url, fitMode);
  pendingTasks.set(key, task);
  // 防止派生 Promise 的 rejection 变成未捕获异常
  task.finally(() => {
    if (pendingTasks.get(key) === task) pendingTasks.delete(key);
  }).catch(() => {
    // ignore
  });
  return task;
}

/**
 * 安全 SVG URL 转换 Hook
 * 在 WebKit / Safari 环境下，外链 SVG 若根标签缺少 viewBox 会在小容器
 * （缩略图、悬浮浮层、全屏预览）内被粗暴裁切、无法完整展示。
 * 该 Hook 自动补全 viewBox、把根尺寸改写为 100%，并按 fitMode 调整 preserveAspectRatio。
 */
export function useSafeSvgUrl(
  url?: string | null,
  fitMode: SvgFitMode = 'contain'
): { safeUrl: string; dimensions?: SvgDimensions } {
  const activeKey = url ? `${url}::${fitMode}` : '';
  const cachedEntry = activeKey ? svgCache.get(activeKey) : undefined;
  const [entry, setEntry] = useState<SvgCacheEntry>({ url: cachedEntry?.url || url || '' });

  useEffect(() => {
    if (!url || !isSvgUrl(url)) {
      setEntry({ url: url || '' });
      return;
    }

    const key = `${url}::${fitMode}`;
    const hit = svgCache.get(key);
    if (hit) {
      setEntry(hit);
      return;
    }

    // 立即切回原 URL 占位，避免短暂展示上一个 URL 的 SVG 内容
    setEntry({ url });

    let active = true;
    resolveSafeSvgUrl(url, fitMode)
      .then(result => {
        if (active) setEntry(result);
      })
      .catch(() => {
        if (active) setEntry({ url });
      });

    return () => {
      active = false;
    };
  }, [url, fitMode]);

  return { safeUrl: entry.url, dimensions: entry.dimensions };
}
