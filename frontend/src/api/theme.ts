/** 外观预设域 API：内置 + 用户自定义预设目录的列举与目录打开。 */
import { ThemePresetsResponse } from '../types';
import { apiFetch } from './http';

export async function getThemePresets(): Promise<ThemePresetsResponse> {
  const res = await apiFetch('/api/theme/presets');
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

export async function openThemeFolder(): Promise<{ success: boolean }> {
  const res = await apiFetch('/api/theme/open-folder', {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}
