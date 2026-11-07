/** 配置域 API：读写用户偏好、历史配置迁移与代理连通性探测。 */
import { Config, LegacyCheckResult } from '../types';
import { apiFetch } from './http';

export async function getConfig(): Promise<Config> {
  const res = await apiFetch('/api/config');
  if (!res.ok) throw new Error(`获取配置失败 (HTTP ${res.status})`);
  return res.json();
}

export async function saveConfig(
  cfg: Partial<Config>
): Promise<{ success: boolean; config: Config; error?: string }> {
  const res = await apiFetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cfg),
  });
  return res.json();
}

export async function checkLegacyConfig(): Promise<LegacyCheckResult> {
  const res = await apiFetch('/api/config/check-legacy');
  return res.json();
}

export async function migrateLegacyConfig(
  backupOld = true
): Promise<{ success: boolean; migrated_files: string[]; backup_files: string[]; target_dir: string; error?: string }> {
  const res = await apiFetch('/api/config/migrate-legacy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ backup_legacy: backupOld }),
  });
  return res.json();
}

export async function testProxy(
  proxy: string
): Promise<{ success: boolean; message?: string; latency_ms?: number; error?: string }> {
  const res = await apiFetch('/api/config/proxy-test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ proxy }),
  });
  return res.json();
}
