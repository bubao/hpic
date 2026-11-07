/** 语言与国际化域 API：语言包列表 / 读取 / 自定义覆盖与目录打开。 */
import { LocalesListResponse } from '../types';
import { apiFetch } from './http';

export async function getI18nLocales(): Promise<LocalesListResponse> {
  const res = await apiFetch('/api/i18n/locales');
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

export async function getI18nBundle(lang: string): Promise<Record<string, any>> {
  const res = await apiFetch(`/api/i18n/bundle?lang=${encodeURIComponent(lang)}`);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

export async function saveI18nCustom(lang: string, content: any): Promise<{ success: boolean }> {
  const res = await apiFetch('/api/i18n/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lang, content }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function resetI18nCustom(lang: string): Promise<{ success: boolean }> {
  const res = await apiFetch('/api/i18n/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lang }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function openI18nFolder(): Promise<{ success: boolean }> {
  const res = await apiFetch('/api/i18n/open-folder', {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}
