import { useEffect } from 'react';

export type AppTheme = 'dark' | 'light' | 'auto';

export function applyTheme(theme: AppTheme = 'dark') {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
}

export function applyCustomCSS(cssContent: string = '') {
  let styleEl = document.getElementById('hpic-custom-theme-css') as HTMLStyleElement | null;
  if (!cssContent || !cssContent.trim()) {
    if (styleEl) {
      styleEl.remove();
    }
    return;
  }

  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'hpic-custom-theme-css';
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = cssContent;
}

/** 读取当前生效的自定义 CSS 文本（用于快照旧外观） */
export function getCurrentCustomCSS(): string {
  const el = document.getElementById('hpic-custom-theme-css') as HTMLStyleElement | null;
  return el?.textContent || '';
}

/* ------------------------------------------------------------------ */
/* 缓动函数                                                             */
/* ------------------------------------------------------------------ */

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** 计算某个阶段内的局部进度（0 ~ 1），阶段外分别为 0 与 1 */
function phaseProgress(progress: number, start: number, end: number): number {
  if (progress <= start) return 0;
  if (progress >= end) return 1;
  return (progress - start) / (end - start);
}

/** 过渡令牌：用于在连续快速切换主题时取消上一段尚未完成的动画 */
let activeTransitionToken = 0;

/* ------------------------------------------------------------------ */
/* 快照外观还原辅助                                                     */
/* ------------------------------------------------------------------ */

/**
 * 还原克隆快照内所有滚动元素的滚动位置。
 *
 * cloneNode(true) 只复制 DOM 结构与节点属性，不会复制 scrollTop / scrollLeft
 * 这类由浏览器布局产生的状态。若不还原，快照中所有内部滚动容器（如设置面板
 * 右侧内容区、左侧文章列表）都会从 0 开始显示——用户点击换肤时会看到视觉瞬间
 * 跳回顶部，待扫屏动画结束真实界面重新露出时又跳回原位。
 *
 * 按相同文档顺序遍历源容器与克隆体（querySelectorAll 对同构子树返回顺序一致），
 * 将滚动偏移逐一写回克隆体对应元素。
 */
function restoreScrollPositions(source: HTMLElement | null, clone: HTMLElement): void {
  if (!source) return;
  const sourceEls: HTMLElement[] = [source, ...Array.from(source.querySelectorAll<HTMLElement>('*'))];
  const cloneEls: HTMLElement[] = [clone, ...Array.from(clone.querySelectorAll<HTMLElement>('*'))];
  const total = Math.min(sourceEls.length, cloneEls.length);
  for (let i = 0; i < total; i++) {
    const origin = sourceEls[i];
    const target = cloneEls[i];
    if (origin.scrollTop > 0) target.scrollTop = origin.scrollTop;
    if (origin.scrollLeft > 0) target.scrollLeft = origin.scrollLeft;
  }
}

/**
 * 按 CSS object-fit 语义把已加载图片的当前帧绘制到画布（cover / contain / fill，默认 fill）。
 * 绘制结果即最终显示内容，画布元素自身统一按 fill 拉伸，避免二次 fit。
 */
function drawImageWithObjectFit(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  canvasWidth: number,
  canvasHeight: number,
  fit: string,
): void {
  const iw = img.naturalWidth || 1;
  const ih = img.naturalHeight || 1;

  if (fit !== 'cover' && fit !== 'contain') {
    ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);
    return;
  }

  const scale = fit === 'cover'
    ? Math.max(canvasWidth / iw, canvasHeight / ih)
    : Math.min(canvasWidth / iw, canvasHeight / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  // cover：dw/dh 超出画布，居中溢出由画布边界裁切；contain：居中留边
  const dx = (canvasWidth - dw) / 2;
  const dy = (canvasHeight - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
}

/**
 * 把快照中所有已加载完成的 <img> 就地位图化为 <canvas>。
 *
 * 克隆出的 <img> 需要重新加载与解码，WebKit / WKWebView 在图片就绪前会先
 * 渲染白底色块（“图片白一下”）。把图片当前帧直接画进 canvas，快照挂载后
 * 立即呈现像素，无需再走网络/解码流程，从根本上消除白闪。
 * 未加载完成的图片保持原样（其本身处于骨架/占位状态，不会出现白块）。
 *
 * 调用方需保证：快照已挂载到文档且已完成首次布局（元素有可测量的布局尺寸）。
 */
function freezeImagesInSnapshot(source: HTMLElement | null, clone: HTMLElement): void {
  if (!source) return;
  const originImgs = Array.from(source.querySelectorAll<HTMLImageElement>('img'));
  const cloneImgs = Array.from(clone.querySelectorAll<HTMLImageElement>('img'));
  const dpr = Math.max(1, window.devicePixelRatio || 1);

  for (let i = 0; i < cloneImgs.length; i++) {
    const originImg = originImgs[i];
    const cloneImg = cloneImgs[i];
    if (!originImg || !cloneImg) continue;

    // 只冻结已完成加载的位图
    if (!originImg.complete || originImg.naturalWidth === 0) continue;

    // 以真实图片的布局尺寸为准（与快照内布局一致）
    const rect = originImg.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    canvas.className = cloneImg.className;
    canvas.style.cssText = cloneImg.style.cssText;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    canvas.style.objectFit = 'fill';

    const ctx = canvas.getContext('2d');
    if (!ctx) continue; // 无 canvas 能力时保留原 img，降级为原有行为

    drawImageWithObjectFit(ctx, originImg, canvas.width, canvas.height, getComputedStyle(originImg).objectFit);
    cloneImg.replaceWith(canvas);
  }
}

let cssScopeSupported: boolean | null = null;

/** 检测当前浏览器是否支持 CSS @scope（用于把旧 CSS 隔离在快照子树内） */
function supportsCssScope(): boolean {
  if (cssScopeSupported !== null) return cssScopeSupported;
  try {
    const probe = document.createElement('style');
    probe.textContent = '@scope (.x) { .x { color: red } }';
    document.head.appendChild(probe);
    const rules = probe.sheet?.cssRules;
    cssScopeSupported = !!rules && rules.length > 0;
    probe.remove();
  } catch {
    cssScopeSupported = false;
  }
  return cssScopeSupported;
}

/** 收集一段 CSS 中声明的全部自定义属性名（含 @media / @supports 等嵌套规则） */
function collectCustomPropertyNames(css: string): string[] {
  const names = new Set<string>();
  if (!css.trim()) return [];

  const probe = document.createElement('style');
  probe.textContent = css;
  document.head.appendChild(probe);
  const sheet = probe.sheet ?? null;

  const walk = (rules: CSSRuleList): void => {
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      const styleRule = rule as CSSStyleRule;
      if (styleRule.style) {
        const style = styleRule.style;
        for (let j = 0; j < style.length; j++) {
          const prop = style[j];
          if (prop.startsWith('--')) names.add(prop);
        }
      }
      const groupRule = rule as CSSGroupingRule;
      if (groupRule.cssRules) {
        walk(groupRule.cssRules);
      }
    }
  };

  if (sheet) walk(sheet.cssRules);
  probe.remove();
  return Array.from(names);
}

/* ------------------------------------------------------------------ */
/* 主题切换过渡动画                                                     */
/* ------------------------------------------------------------------ */

const TRANSITION_DURATION = 980;
const TAIL_ANGLE = 80;        // 彗尾半宽（度）
const LINE_GROW_END = 0.26;   // 水平线从中心向两边延伸的阶段结束点
const SWEEP_END = 0.84;       // 旋转扫屏阶段结束点

export interface ThemeTransitionOptions {
  /** 过渡前的自定义 CSS（缺省取当前全局样式） */
  fromCSS?: string;
  /** 过渡后的自定义 CSS（缺省与 fromCSS 相同，即只切主题） */
  toCSS?: string;
}

/** 生成锥形渐变遮罩字符串，0° 起点为水平线起始朝向（正右方 90°） */
function buildSweepMask(angleDeg: number): string {
  const a = angleDeg.toFixed(2);
  const b = (180 + angleDeg).toFixed(2);
  return [
    'conic-gradient(',
    'from 90deg at center,',
    'transparent 0deg,',
    `transparent ${a}deg,`,
    `black ${a}deg,`,
    'black 180deg,',
    'transparent 180deg,',
    `transparent ${b}deg,`,
    `black ${b}deg,`,
    'black 360deg',
    ')',
  ].join(' ');
}

const CORE_THEME_VARIABLES = [
  '--bg-primary',
  '--bg-secondary',
  '--bg-tertiary',
  '--bg-hover',
  '--bg-card',
  '--text-primary',
  '--text-secondary',
  '--text-muted',
  '--border-color',
  '--border-hover',
  '--accent-color',
  '--accent-hover',
  '--accent-bg',
  '--success-color',
  '--danger-color',
  '--warning-color',
  '--scrollbar-thumb',
  '--modal-backdrop',
];

/**
 * 外观切换过渡动画（真实界面扫屏）：
 *  1. 克隆当前界面 DOM 作为旧外观快照（连同旧主题与旧自定义 CSS），悬浮于页面最上层；
 *  2. 从屏幕正中心向左右两侧延伸出一条水平线；
 *  3. 水平线以中心为轴顺时针旋转，扫过 180°；
 *     快照被锥形渐变 mask 同步裁掉，露出下方已切换的真实界面；
 *     线尾拖着一条与星光同色的渐变彗尾；
 *  4. 动画收尾阶段淡出。
 *
 * 主题或自定义 CSS 任一发生变化都会播放动画（例如 暗色 ↔ 赛博霓虹 属于仅 CSS 变化）。
 */
export function triggerThemeTransition(toTheme: AppTheme, options: ThemeTransitionOptions = {}): void {
  const root = document.documentElement;
  const currentTheme = (root.getAttribute('data-theme') as AppTheme) || 'dark';
  const fromCSS = options.fromCSS !== undefined ? options.fromCSS : getCurrentCustomCSS();
  const toCSS = options.toCSS !== undefined ? options.toCSS : fromCSS;

  // 主题与自定义 CSS 均未变化时无需动画
  if (currentTheme === toTheme && fromCSS === toCSS) return;

  // 使上一段过渡动画失效（连续快速切换时避免相互干扰）
  activeTransitionToken += 1;
  const transitionToken = activeTransitionToken;

  // 清理可能存在的旧过渡元素
  document
    .querySelectorAll(
      '.theme-transition-overlay, .theme-transition-line, .theme-transition-tail, ' +
      '.theme-transition-star, .theme-transition-clone'
    )
    .forEach(el => el.remove());

  // 读取旧外观的完整计算样式：底色 + 核心主题变量 + 自定义 CSS 变量
  const computed = getComputedStyle(root);
  const oldBgPrimary = computed.getPropertyValue('--bg-primary').trim();
  const oldTextPrimary = computed.getPropertyValue('--text-primary').trim();

  const oldCoreVars = new Map<string, string>();
  for (const name of CORE_THEME_VARIABLES) {
    const value = computed.getPropertyValue(name).trim();
    if (value) oldCoreVars.set(name, value);
  }

  const oldVars = new Map<string, string>();
  for (const name of collectCustomPropertyNames(fromCSS)) {
    const value = computed.getPropertyValue(name).trim();
    if (value) oldVars.set(name, value);
  }

  // ---- 克隆旧外观界面快照 ----
  const appContainer = document.querySelector('.app-container') as HTMLElement | null;
  let snapshot: HTMLElement | null = null;

  if (appContainer) {
    const rect = appContainer.getBoundingClientRect();

    if (rect.width > 0 && rect.height > 0) {
      snapshot = appContainer.cloneNode(true) as HTMLElement;
      snapshot.classList.add('theme-transition-clone');
      // 关键：给快照设置旧主题，让其主题 CSS 变量回落到旧主题
      snapshot.setAttribute('data-theme', currentTheme);

      // 去除 ID，避免与真实 DOM 冲突
      snapshot.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
      snapshot.removeAttribute('id');

      // 关键修复：内联所有核心主题变量到快照根节点，确保快照文字颜色与背景完全锁死在旧外观状态，
      // 绝不随下方根节点的 data-theme 变更而产生提前变色/闪烁！
      oldCoreVars.forEach((value, name) => {
        snapshot!.style.setProperty(name, value);
      });

      // 把旧自定义 CSS 中的自定义属性内联到快照根节点
      oldVars.forEach((value, name) => {
        snapshot!.style.setProperty(name, value);
      });

      // 支持 @scope 的浏览器：把整段旧 CSS 限定在快照子树内，保留非变量规则。
      // 不支持的浏览器会直接丢弃该 @scope 规则，不影响真实界面。
      if (fromCSS.trim() && supportsCssScope()) {
        const scoper = document.createElement('style');
        scoper.textContent = `@scope (.theme-transition-clone) {\n${fromCSS}\n}`;
        snapshot.appendChild(scoper);
      }

      // 固定定位，完全覆盖原界面
      snapshot.style.position = 'fixed';
      snapshot.style.top = `${rect.top}px`;
      snapshot.style.left = `${rect.left}px`;
      snapshot.style.width = `${rect.width}px`;
      snapshot.style.height = `${rect.height}px`;
      snapshot.style.zIndex = '999997';
      snapshot.style.overflow = 'hidden';
      snapshot.style.pointerEvents = 'none';
      snapshot.style.color = oldTextPrimary || '#f8fafc';
      snapshot.style.backgroundColor = oldBgPrimary || '#0a0c10';
    }
  }

  // ---- 彗尾层 ----
  const tail = document.createElement('div');
  tail.className = 'theme-transition-tail';

  // ---- 扫屏线 ----
  const line = document.createElement('div');
  line.className = 'theme-transition-line';

  // ---- 兜底纯色遮罩（克隆失败时使用）----
  const overlay = document.createElement('div');
  overlay.className = 'theme-transition-overlay';
  overlay.style.backgroundColor = oldBgPrimary || '#0a0c10';

  // ---- 遮罩目标：优先使用真实界面快照 ----
  const maskTarget = snapshot ?? overlay;

  document.body.appendChild(tail);
  document.body.appendChild(maskTarget);
  document.body.appendChild(line);

  // 快照冻结处理：挂载到文档 + 强制完成首次布局后执行
  // 1) 注入一次性样式，禁用快照子树内的所有 CSS 动画与过渡，
  //    避免 image-fade-in / 骨架微光 / 设置面板弹入等动画在克隆体中重新播放；
  // 2) 位图化已加载的 <img>（WebKit 重解码会先渲染白底色块）；
  // 3) <object> 内嵌文档（SVG）无法位图化，补一层与旧背景一致的底色，
  //    减轻 WebKit 重载内嵌文档期间的白色空白块；
  // 4) 还原滚动位置。
  const snap = snapshot;
  if (snap) {
    void snap.offsetHeight;

    const freezeStyle = document.createElement('style');
    freezeStyle.className = 'theme-transition-freeze';
    freezeStyle.textContent =
      '.theme-transition-clone, .theme-transition-clone * { animation: none !important; transition: none !important; }';
    snap.appendChild(freezeStyle);

    freezeImagesInSnapshot(appContainer, snap);

    snap.querySelectorAll('object').forEach(obj => {
      (obj as HTMLElement).style.backgroundColor = oldBgPrimary || 'transparent';
    });

    restoreScrollPositions(appContainer, snap);
    requestAnimationFrame(() => {
      if (snap.isConnected) {
        restoreScrollPositions(appContainer, snap);
      }
    });
  }

  // 立即应用新主题与新自定义 CSS（在快照下方），保证动画结束后无闪烁
  root.setAttribute('data-theme', toTheme);
  applyCustomCSS(toCSS);

  const start = performance.now();

  function cleanup() {
    tail.remove();
    maskTarget.remove();
    line.remove();
  }

  function frame(now: number) {
    // 已被更新的过渡取代，停止本段动画（元素已由新过渡清理）
    if (transitionToken !== activeTransitionToken) return;

    const elapsed = now - start;
    const progress = Math.min(elapsed / TRANSITION_DURATION, 1);

    const pGrow = easeInOutCubic(phaseProgress(progress, 0, LINE_GROW_END));         // 水平线延伸
    const pSweep = easeInOutCubic(phaseProgress(progress, LINE_GROW_END, SWEEP_END)); // 旋转扫屏
    const pFade = easeInOutCubic(phaseProgress(progress, SWEEP_END, 1));             // 淡出

    const angle = pSweep * 180;
    const fade = 1 - pFade;

    // ---- 扫屏线：先从中心向两边延伸，再顺时针旋转 ----
    const clipSide = 50 * (1 - pGrow);
    line.style.opacity = fade.toFixed(3);
    line.style.clipPath = `inset(0 ${clipSide.toFixed(2)}% 0 ${clipSide.toFixed(2)}%)`;
    line.style.transform = `translate(-50%, -50%) rotate(${angle.toFixed(2)}deg)`;

    // ---- 彗尾 ----
    const lineAngle = 90 + angle;
    tail.style.opacity = (fade * 0.9).toFixed(3);
    tail.style.setProperty('--tail-start', `${(lineAngle - TAIL_ANGLE).toFixed(2)}deg`);

    // ---- 遮罩：裁掉快照/遮罩层的扫过区域，揭示新外观 ----
    const mask = buildSweepMask(angle);
    maskTarget.style.maskImage = mask;
    maskTarget.style.webkitMaskImage = mask;

    if (progress < 1) {
      requestAnimationFrame(frame);
    } else {
      cleanup();
    }
  }

  requestAnimationFrame(frame);
}

/* ------------------------------------------------------------------ */
/* Hook                                                                */
/* ------------------------------------------------------------------ */

export function useTheme(theme: AppTheme = 'dark', customCSS: string = '') {
  useEffect(() => {
    applyTheme(theme);

    if (theme === 'auto') {
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = () => {
        applyTheme('auto');
      };
      media.addEventListener('change', listener);
      return () => media.removeEventListener('change', listener);
    }
  }, [theme]);

  useEffect(() => {
    applyCustomCSS(customCSS);
  }, [customCSS]);
}
