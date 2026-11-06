import { describe, it, expect, beforeEach } from 'vitest';
import {
  applyTheme,
  applyCustomCSS,
  getCurrentCustomCSS,
  triggerThemeTransition,
} from './useTheme';

const TRANSITION_SELECTOR =
  '.theme-transition-overlay, .theme-transition-line, .theme-transition-tail, .theme-transition-clone';

function cleanupTransitions() {
  document.querySelectorAll(TRANSITION_SELECTOR).forEach(el => el.remove());
}

function rect(width: number, height: number): DOMRect {
  return {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect;
}

/** 最近一次 canvas 2d drawImage 调用参数 */
let lastDrawImageCall: unknown[] | null = null;

/**
 * happy-dom 不提供 canvas 2d 实现，注入最小 mock（仅记录 drawImage 参数）
 */
function mockCanvasContext() {
  const fakeCtx = {
    drawImage: (...args: unknown[]) => {
      lastDrawImageCall = args;
    },
  } as unknown as CanvasRenderingContext2D;
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    writable: true,
    value: () => fakeCtx,
  });
}

/**
 * happy-dom 对 scrollTop / scrollLeft 的赋值与真实浏览器存在行为差异，
 * 这里注入"直存值"实现，让「源元素滚动偏移 → 克隆快照还原」的断言稳定可复现。
 */
function mockScrollOffsets() {
  const store = Symbol('scrollOffsets');
  Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
    configurable: true,
    get(this: HTMLElement) {
      return ((this as unknown as Record<symbol, Record<string, number>>)[store] ?? {}).top ?? 0;
    },
    set(this: HTMLElement, value: number) {
      const holder = ((this as unknown as Record<symbol, Record<string, number>>)[store] ??= {});
      holder.top = value;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollLeft', {
    configurable: true,
    get(this: HTMLElement) {
      return ((this as unknown as Record<symbol, Record<string, number>>)[store] ?? {}).left ?? 0;
    },
    set(this: HTMLElement, value: number) {
      const holder = ((this as unknown as Record<symbol, Record<string, number>>)[store] ??= {});
      holder.left = value;
    },
  });
}

describe('useTheme utility tests', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
    const existing = document.getElementById('hpic-custom-theme-css');
    if (existing) {
      existing.remove();
    }
    cleanupTransitions();
  });

  it('should set data-theme attribute on documentElement', () => {
    applyTheme('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    applyTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    applyTheme('auto');
    expect(document.documentElement.getAttribute('data-theme')).toBe('auto');
  });

  it('should inject custom css style element and remove when empty', () => {
    applyCustomCSS(':root { --accent-color: #ff00ff; }');
    const styleEl = document.getElementById('hpic-custom-theme-css');
    expect(styleEl).toBeDefined();
    expect(styleEl?.textContent).toContain('#ff00ff');

    // 清空时自动移除
    applyCustomCSS('');
    expect(document.getElementById('hpic-custom-theme-css')).toBeNull();
  });
});

describe('triggerThemeTransition 外观扫屏过渡', () => {
  beforeEach(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    applyCustomCSS('');
    cleanupTransitions();
    mockScrollOffsets();
    mockCanvasContext();
    lastDrawImageCall = null;
  });

  it('主题与自定义 CSS 均未变化时直接跳过动画', () => {
    triggerThemeTransition('dark', { toCSS: '' });

    expect(document.querySelector(TRANSITION_SELECTOR)).toBeNull();
    expect(document.getElementById('hpic-custom-theme-css')).toBeNull();
  });

  it('主题变化时播放动画', () => {
    triggerThemeTransition('light');

    expect(document.querySelector('.theme-transition-line')).not.toBeNull();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('仅自定义 CSS 变化时同样播放动画（如 暗色 ↔ 赛博霓虹）', () => {
    applyCustomCSS(':root { --accent-color: #ec4899; }');
    expect(getCurrentCustomCSS()).toContain('#ec4899');

    // 主题不变，仅 CSS 变化
    triggerThemeTransition('dark', { toCSS: '' });

    // 过渡元素已挂载
    expect(
      document.querySelector('.theme-transition-line') ||
      document.querySelector('.theme-transition-clone')
    ).not.toBeNull();
    // 真实界面已切换到新外观（自定义 CSS 已清空）
    expect(document.getElementById('hpic-custom-theme-css')).toBeNull();
    expect(getCurrentCustomCSS()).toBe('');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('快照克隆还原源界面中滚动元素的位置，避免换肤时视觉跳回顶部', () => {
    // 构造真实结构的最小组件：app 容器 + 内部可滚动内容区
    const app = document.createElement('div');
    app.className = 'app-container';
    const scroller = document.createElement('div');
    scroller.className = 'settings-content-area';
    const content = document.createElement('div');
    content.style.height = '2000px';
    scroller.appendChild(content);
    app.appendChild(scroller);
    document.body.appendChild(app);

    // 视口尺寸：让快照克隆分支生效
    app.getBoundingClientRect = () =>
      ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 1200,
        bottom: 800,
        width: 1200,
        height: 800,
        toJSON: () => ({}),
      }) as DOMRect;

    // 用户已把右侧内容区滚动到中部
    scroller.scrollTop = 320;
    scroller.scrollLeft = 0;

    triggerThemeTransition('light');

    const clone = document.querySelector('.theme-transition-clone') as HTMLElement | null;
    expect(clone).not.toBeNull();
    const cloneScroller = clone!.querySelector<HTMLElement>('.settings-content-area');
    expect(cloneScroller).not.toBeNull();
    // 快照必须保持与真实界面一致的滚动位置，而不是从 0 开始
    expect(cloneScroller!.scrollTop).toBe(320);

    app.remove();
  });

  it('快照中的 <img> 被位图化为 <canvas>，避免 WebKit 重解码时的白色闪烁', () => {
    const app = document.createElement('div');
    app.className = 'app-container';
    const holder = document.createElement('div');
    holder.className = 'smooth-image-wrapper';
    const thumb = document.createElement('img');
    thumb.className = 'image-fade-in post-thumb-img';
    thumb.style.width = '100%';
    holder.appendChild(thumb);
    app.appendChild(holder);
    document.body.appendChild(app);

    app.getBoundingClientRect = () => rect(1200, 800);
    thumb.getBoundingClientRect = () => rect(300, 200);
    Object.defineProperty(thumb, 'complete', { configurable: true, value: true });
    Object.defineProperty(thumb, 'naturalWidth', { configurable: true, value: 600 });
    Object.defineProperty(thumb, 'naturalHeight', { configurable: true, value: 400 });

    triggerThemeTransition('light');

    const clone = document.querySelector('.theme-transition-clone') as HTMLElement | null;
    expect(clone).not.toBeNull();
    // 原 <img> 已通过 replaceWith 原位替换为 canvas（节点数不变，不影响滚动还原）
    expect(clone!.querySelector('img')).toBeNull();
    const canvas = clone!.querySelector('canvas');
    expect(canvas).not.toBeNull();
    expect(canvas!.className).toContain('post-thumb-img');
    expect(canvas!.style.width).toBe('300px');
    expect(canvas!.style.height).toBe('200px');
    expect(canvas!.width).toBe(300);
    expect(canvas!.height).toBe(200);
    // 原图当前帧已按 fill 语义绘制进 canvas
    expect(lastDrawImageCall).not.toBeNull();
    expect(lastDrawImageCall![0]).toBe(thumb);
    expect(lastDrawImageCall!.slice(1, 5)).toEqual([0, 0, 300, 200]);

    // 快照内注入冻结样式，禁用克隆体的 CSS 动画/过渡重放
    const freezeStyle = clone!.querySelector('style.theme-transition-freeze');
    expect(freezeStyle).not.toBeNull();
    expect(freezeStyle!.textContent).toContain('animation: none');

    app.remove();
  });

  it('未完成加载的 <img> 不被冻结，保持原有占位行为', () => {
    const app = document.createElement('div');
    app.className = 'app-container';
    const thumb = document.createElement('img');
    app.appendChild(thumb);
    document.body.appendChild(app);

    app.getBoundingClientRect = () => rect(1200, 800);
    thumb.getBoundingClientRect = () => rect(300, 200);
    Object.defineProperty(thumb, 'complete', { configurable: true, value: false });
    Object.defineProperty(thumb, 'naturalWidth', { configurable: true, value: 0 });

    triggerThemeTransition('light');

    const clone = document.querySelector('.theme-transition-clone') as HTMLElement | null;
    expect(clone).not.toBeNull();
    expect(clone!.querySelector('canvas')).toBeNull();
    expect(clone!.querySelector('img')).not.toBeNull();
    expect(lastDrawImageCall).toBeNull();

    app.remove();
  });

  it('<object> 元素补与旧背景一致的底色，减轻 SVG 内嵌文档重载白块', () => {
    const app = document.createElement('div');
    app.className = 'app-container';
    const obj = document.createElement('object');
    obj.type = 'image/svg+xml';
    app.appendChild(obj);
    document.body.appendChild(app);

    app.getBoundingClientRect = () => rect(1200, 800);

    triggerThemeTransition('light');

    const clone = document.querySelector('.theme-transition-clone') as HTMLElement | null;
    expect(clone).not.toBeNull();
    const cloneObj = clone!.querySelector('object');
    expect(cloneObj).not.toBeNull();
    // happy-dom 无法解析主题变量，oldBgPrimary 为空 → 回落 transparent
    expect(cloneObj!.style.backgroundColor).toBe('transparent');

    app.remove();
  });
});
