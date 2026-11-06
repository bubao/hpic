import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * 全局默认拦截 fetch：测试中一律不得发起真实网络请求。
 *
 * happy-dom 的 fetch 实现会真实尝试连接目标地址（例如组件测试渲染
 * FavoritesProvider / SettingsModal 时会打向 localhost:3000），
 * 在 CI 或本机产生 ECONNREFUSED、连接中断等连篇 stderr 噪音（测试仍会通过）。
 * 统一在此快速失败：未显式 mock api 模块的用例立即得到 rejection，
 * 需要自定义请求行为的用例仍可在自身用例内用
 * `vi.spyOn(globalThis, 'fetch')` / `vi.mock('../api')` 覆盖。
 */
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() =>
    Promise.reject(new TypeError('fetch is disabled in tests; mock the api module or spyOn(globalThis, "fetch") instead'))
  ));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
