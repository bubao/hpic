/** 版本域 API：在线检测、下载升级包、安装与重启。 */
import { VersionInfo } from '../types';
import { apiFetch } from './http';

export async function checkVersion(): Promise<VersionInfo> {
  const res = await apiFetch('/api/version/check');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function upgradeVersion(): Promise<{ success: boolean; download_url?: string; message?: string }> {
  const res = await apiFetch('/api/version/upgrade', { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function installVersion(): Promise<{
  success: boolean;
  message: string;
  new_version?: string;
  already_latest?: boolean;
  need_restart?: boolean;
}> {
  // 升级包可能体积较大，关闭默认超时避免误中断
  const res = await apiFetch('/api/version/install', { method: 'POST', timeout: 0 });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

export async function restartVersion(): Promise<{ success: boolean; message: string }> {
  const res = await apiFetch('/api/version/restart', { method: 'POST' });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

export async function getChangelog(): Promise<{ success: boolean; changelog: string; version: string }> {
  const res = await apiFetch('/api/version/changelog');
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}
