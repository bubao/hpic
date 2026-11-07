/**
 * API 传输层：统一 apiFetch（默认 10s 超时 + AbortController 链式合并 +
 * X-Hpic-Version 版本头解包与裂隙监听）。
 */
import { DEFAULT_APP_VERSION } from '../types';

export type VersionMismatchCallback = (newVersion: string, currentVersion: string) => void;

const versionMismatchCallbacks = new Set<VersionMismatchCallback>();
let lastNotifiedVersion: string | null = null;

/** apiFetch 默认请求超时（毫秒）：服务未启动时 UI 最长 10s 进入错误态 */
export const DEFAULT_REQUEST_TIMEOUT = 10_000;

/** 标准 RequestInit 扩展 timeout 字段（毫秒；0 或负数表示不限制） */
export type HpicFetchOptions = RequestInit & { timeout?: number };

export function normalizeVersion(v?: string | null): string {
  if (!v) return '';
  return v.trim().replace(/^v/i, '');
}

export function isVersionMismatch(backendVersion: string, frontendVersion: string = DEFAULT_APP_VERSION): boolean {
  const cleanBackend = normalizeVersion(backendVersion);
  const cleanFrontend = normalizeVersion(frontendVersion);
  if (!cleanBackend || !cleanFrontend) return false;
  return cleanBackend !== cleanFrontend;
}

export function notifyVersionMismatch(newVersion: string, currentVersion: string = DEFAULT_APP_VERSION): void {
  const cleanNew = normalizeVersion(newVersion);
  if (lastNotifiedVersion === cleanNew) {
    return;
  }
  lastNotifiedVersion = cleanNew;

  for (const cb of versionMismatchCallbacks) {
    try {
      cb(newVersion, currentVersion);
    } catch (e) {
      console.error('Error in version mismatch callback:', e);
    }
  }

  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(
      new CustomEvent('hpic:version-mismatch', {
        detail: { newVersion, currentVersion },
      })
    );
  }
}

export function onVersionMismatch(callback: VersionMismatchCallback): () => void {
  versionMismatchCallbacks.add(callback);
  return () => {
    versionMismatchCallbacks.delete(callback);
  };
}

export function resetVersionMismatchState(): void {
  lastNotifiedVersion = null;
  versionMismatchCallbacks.clear();
}

export function checkResponseVersion(response: Response): void {
  try {
    const versionHeader = response.headers?.get('X-Hpic-Version') || response.headers?.get('x-hpic-version');
    if (versionHeader && isVersionMismatch(versionHeader, DEFAULT_APP_VERSION)) {
      notifyVersionMismatch(versionHeader, DEFAULT_APP_VERSION);
    }
  } catch {
    // 忽略异常
  }
}

/**
 * 统一请求出口：
 * 1. 默认 10s 超时（可通过 `timeout` 调整或置 0 关闭）；
 * 2. 外部 AbortSignal 与内部超时控制器链式合并；
 * 3. 解包 X-Hpic-Version 并在版本裂隙时广播通知。
 */
export async function apiFetch(input: RequestInfo | URL, init?: HpicFetchOptions): Promise<Response> {
  const { timeout = DEFAULT_REQUEST_TIMEOUT, signal: externalSignal, ...rest } = init ?? {};

  const controller = new AbortController();
  const abortByExternal = () => controller.abort();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', abortByExternal, { once: true });
    }
  }

  if (timeout > 0) {
    timeoutId = setTimeout(() => controller.abort(new Error('请求超时')), timeout);
  }

  try {
    const res = await fetch(input, { ...rest, signal: controller.signal });
    checkResponseVersion(res);
    return res;
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    externalSignal?.removeEventListener('abort', abortByExternal);
  }
}
