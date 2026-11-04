import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { SmoothImage } from './SmoothImage';

describe('SmoothImage component tests', () => {
  let originalImage: typeof Image;

  beforeEach(() => {
    originalImage = globalThis.Image;
  });

  afterEach(() => {
    globalThis.Image = originalImage;
    vi.restoreAllMocks();
  });

  it('should render loading skeleton initially when src is provided', () => {
    // 阻止立即加载以检查 loading 骨架屏
    globalThis.Image = class {
      onload = null;
      onerror = null;
      src = '';
      referrerPolicy = '';
    } as unknown as typeof Image;

    const { container } = render(
      <SmoothImage src="https://example.com/test.jpg" alt="Loading image" showSpinner={true} />
    );

    const wrapper = container.querySelector('.smooth-image-wrapper');
    expect(wrapper?.classList.contains('loading')).toBe(true);
    expect(container.querySelector('.smooth-image-skeleton')).toBeDefined();
    expect(container.querySelector('.smooth-image-spinner')).toBeDefined();
  });

  it('should render image and trigger onDimensionsLoaded upon successful load', async () => {
    const handleDimensions = vi.fn();

    globalThis.Image = class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      _src = '';
      naturalWidth = 3840;
      naturalHeight = 2160;

      set src(val: string) {
        this._src = val;
        setTimeout(() => this.onload && this.onload(), 0);
      }
      get src() {
        return this._src;
      }
    } as unknown as typeof Image;

    render(
      <SmoothImage
        src="https://example.com/pic-4k.jpg"
        alt="Mountain 4K"
        onDimensionsLoaded={handleDimensions}
      />
    );

    // 等待模拟的微任务 onload 执行
    await act(async () => {
      await new Promise(r => setTimeout(r, 10));
    });

    const img = screen.getByRole('img');
    expect(img).toBeDefined();
    expect(img.getAttribute('src')).toBe('https://example.com/pic-4k.jpg');
    expect(img.getAttribute('alt')).toBe('Mountain 4K');
    expect(handleDimensions).toHaveBeenCalledWith(3840, 2160);
  });

  it('should display 4K and 16:9 dimension badges when showMetaBadge is true', async () => {
    globalThis.Image = class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      _src = '';
      naturalWidth = 3840;
      naturalHeight = 2160;

      set src(val: string) {
        this._src = val;
        setTimeout(() => this.onload && this.onload(), 0);
      }
      get src() {
        return this._src;
      }
    } as unknown as typeof Image;

    const { container } = render(
      <SmoothImage
        src="https://example.com/pic-4k.jpg"
        alt="Mountain 4K"
        showMetaBadge={true}
      />
    );

    await act(async () => {
      await new Promise(r => setTimeout(r, 10));
    });

    const badge = container.querySelector('.image-dimension-badge');
    expect(badge).toBeDefined();
    expect(badge?.textContent).toContain('4K');
    expect(badge?.textContent).toContain('3840×2160');
    expect(badge?.textContent).toContain('16:9');
  });

  it('should prefer badgeDimensions when provided', async () => {
    globalThis.Image = class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      _src = '';
      naturalWidth = 400; // 模拟缩略图尺寸
      naturalHeight = 225;

      set src(val: string) {
        this._src = val;
        setTimeout(() => this.onload && this.onload(), 0);
      }
      get src() {
        return this._src;
      }
    } as unknown as typeof Image;

    const { container } = render(
      <SmoothImage
        src="https://example.com/thumb.jpg"
        alt="Thumbnail"
        showMetaBadge={true}
        badgeDimensions={{ width: 2560, height: 1440, quality: '2K' }}
      />
    );

    await act(async () => {
      await new Promise(r => setTimeout(r, 10));
    });

    const badge = container.querySelector('.image-dimension-badge');
    expect(badge?.textContent).toContain('2K');
    expect(badge?.textContent).toContain('2560×1440');
  });

  it('should render error state when image fails to load', async () => {
    globalThis.Image = class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      _src = '';

      set src(val: string) {
        this._src = val;
        setTimeout(() => this.onerror && this.onerror(), 0);
      }
      get src() {
        return this._src;
      }
    } as unknown as typeof Image;

    const { container } = render(
      <SmoothImage src="https://example.com/broken.jpg" alt="Broken image" />
    );

    await act(async () => {
      await new Promise(r => setTimeout(r, 10));
    });

    expect(container.querySelector('.smooth-image-error')).toBeDefined();
  });

  it('should trigger onClick when rendered image is clicked', async () => {
    const handleClick = vi.fn();

    globalThis.Image = class {
      onload: (() => void) | null = null;
      _src = '';
      naturalWidth = 800;
      naturalHeight = 600;

      set src(val: string) {
        this._src = val;
        setTimeout(() => this.onload && this.onload(), 0);
      }
      get src() {
        return this._src;
      }
    } as unknown as typeof Image;

    render(
      <SmoothImage src="https://example.com/pic.jpg" alt="Clickable" onClick={handleClick} />
    );

    await act(async () => {
      await new Promise(r => setTimeout(r, 10));
    });

    const img = screen.getByRole('img');
    fireEvent.click(img);

    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
