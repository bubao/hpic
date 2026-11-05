import { describe, it, expect, beforeEach } from 'vitest';
import { applyTheme, applyCustomCSS } from './useTheme';

describe('useTheme utility tests', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
    const existing = document.getElementById('hpic-custom-theme-css');
    if (existing) {
      existing.remove();
    }
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
