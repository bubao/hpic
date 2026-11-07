/** 系统域 API：原生目录选择器与 Doctor 只读自检诊断。 */
import { DoctorReport, SelectDirectoryResult } from '../types';
import { apiFetch } from './http';

export async function selectDirectory(
  prompt = '选择 Hexo 博客根目录',
  initialDir = ''
): Promise<SelectDirectoryResult> {
  const res = await apiFetch('/api/system/select-directory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, initial_dir: initialDir }),
  });
  return res.json();
}

export async function getDoctorReport(includeNetwork = true): Promise<DoctorReport> {
  // 网络探针可能耗时较久，关闭默认超时
  const res = await apiFetch(`/api/doctor?include_network=${includeNetwork ? 'true' : 'false'}`, {
    timeout: 0,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `诊断失败 (HTTP ${res.status})`);
  }
  return res.json();
}

export async function exportDoctorReport(includeNetwork = true): Promise<Blob> {
  const res = await apiFetch(`/api/doctor/export?include_network=${includeNetwork ? 'true' : 'false'}`, {
    timeout: 0,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `导出诊断包失败 (HTTP ${res.status})`);
  }
  return res.blob();
}
