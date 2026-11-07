import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { api } from '../api';
import { Config } from '../types';
import { useToast } from '../context/ToastContext';
import { AppTheme, applyTheme, applyCustomCSS, getCurrentCustomCSS, triggerThemeTransition } from '../utils/useTheme';

interface UseAppearanceControllerOptions {
  config: Config | null;
  setConfig: Dispatch<SetStateAction<Config | null>>;
}

/**
 * 外观控制（App.tsx A2 提取）：主题切换、扫屏过渡动画、自定义 CSS 防抖持久化。
 */
export function useAppearanceController({ config, setConfig }: UseAppearanceControllerOptions) {
  const toast = useToast();
  const currentTheme: AppTheme = config?.theme || 'dark';

  const handleSelectTheme = useCallback(async (nextTheme: AppTheme) => {
    if (nextTheme === currentTheme) return;
    const nextLabel = nextTheme === 'light' ? '亮色清爽模式' : nextTheme === 'auto' ? '跟随系统' : '暗色黑夜模式';
    toast.info(`已切换至: ${nextLabel}`);
    if (config) {
      const updatedConfig = { ...config, theme: nextTheme };
      // 先播放扫屏动画，动画内部会立即应用新主题
      triggerThemeTransition(nextTheme);
      setConfig(updatedConfig);
      await api.saveConfig({ theme: nextTheme });
    }
  }, [currentTheme, config, toast, setConfig]);

  const handleToggleTheme = useCallback(() => {
    const nextTheme: AppTheme = currentTheme === 'dark' ? 'light' : currentTheme === 'light' ? 'auto' : 'dark';
    handleSelectTheme(nextTheme);
  }, [currentTheme, handleSelectTheme]);

  /**
   * 外观持久化定时器：连续切换预设或微调 CSS 时合并请求
   */
  const saveAppearanceTimer = useRef<number | null>(null);

  // 组件卸载时清理未触发的防抖定时器，避免卸载后残留
  useEffect(() => {
    return () => {
      if (saveAppearanceTimer.current !== null) {
        window.clearTimeout(saveAppearanceTimer.current);
      }
    };
  }, []);

  /**
   * 外观（主题 / 自定义 CSS）变更：立即应用并持久化。
   * 由设置面板内的外观预设调用，面板保持展开不影响操作。
   */
  const handleAppearanceChange = useCallback(
    async (nextTheme: AppTheme, nextCss: string) => {
      const prevTheme = (document.documentElement.getAttribute('data-theme') as AppTheme) || 'dark';
      // 以当前 DOM 生效的自定义 CSS 为准，保证快照旧外观
      const prevCss = getCurrentCustomCSS();

      setConfig(prev => (prev ? { ...prev, theme: nextTheme, custom_css: nextCss } : prev));

      // 主题或自定义 CSS 任一变化都播放扫屏过渡（如 暗色 ↔ 赛博霓虹）
      if (nextTheme !== prevTheme || nextCss !== prevCss) {
        triggerThemeTransition(nextTheme, { toCSS: nextCss });
      } else {
        applyTheme(nextTheme);
        applyCustomCSS(nextCss);
      }

      // 外观变更防抖持久化，关闭或取消面板后仍然生效
      if (saveAppearanceTimer.current !== null) {
        window.clearTimeout(saveAppearanceTimer.current);
      }
      saveAppearanceTimer.current = window.setTimeout(() => {
        saveAppearanceTimer.current = null;
        api.saveConfig({ theme: nextTheme, custom_css: nextCss }).catch(() => {
          // 静默失败：下次整体保存时会再次同步
        });
      }, 600);
    },
    [setConfig]
  );

  return { currentTheme, handleSelectTheme, handleToggleTheme, handleAppearanceChange };
}
