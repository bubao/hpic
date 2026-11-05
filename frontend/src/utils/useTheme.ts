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
