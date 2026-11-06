import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api, normalizeVersion, isVersionMismatch, onVersionMismatch, resetVersionMismatchState, checkResponseVersion } from './api';
import { DEFAULT_APP_VERSION } from './types';

describe('Version Contract and Guard (api.ts)', () => {
  beforeEach(() => {
    resetVersionMismatchState();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    resetVersionMismatchState();
  });

  it('normalizes version strings properly', () => {
    expect(normalizeVersion('v0.0.2')).toBe('0.0.2');
    expect(normalizeVersion('V0.0.2')).toBe('0.0.2');
    expect(normalizeVersion('0.0.2')).toBe('0.0.2');
    expect(normalizeVersion('  v1.2.3  ')).toBe('1.2.3');
    expect(normalizeVersion('')).toBe('');
    expect(normalizeVersion(null)).toBe('');
    expect(normalizeVersion(undefined)).toBe('');
  });

  it('identifies version mismatch accurately', () => {
    // Matching versions
    expect(isVersionMismatch('v0.0.2', '0.0.2')).toBe(false);
    expect(isVersionMismatch('0.0.2', '0.0.2')).toBe(false);
    expect(isVersionMismatch('v0.0.2', 'v0.0.2')).toBe(false);

    // Mismatched versions
    expect(isVersionMismatch('v0.0.3', '0.0.2')).toBe(true);
    expect(isVersionMismatch('0.1.0', '0.0.2')).toBe(true);
    expect(isVersionMismatch('v1.0.0', '0.0.2')).toBe(true);

    // Missing version strings
    expect(isVersionMismatch('', '0.0.2')).toBe(false);
    expect(isVersionMismatch('0.0.2', '')).toBe(false);
  });

  it('triggers registered callback and custom event when X-Hpic-Version header differs', () => {
    const callback = vi.fn();
    const unsubscribe = onVersionMismatch(callback);

    const eventListener = vi.fn();
    window.addEventListener('hpic:version-mismatch', eventListener);

    // Simulated response with differing version header
    const mockHeaders = new Headers();
    mockHeaders.set('X-Hpic-Version', 'v0.0.3');
    const mockResponse = new Response('{}', { headers: mockHeaders });

    checkResponseVersion(mockResponse);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('v0.0.3', expect.any(String));

    expect(eventListener).toHaveBeenCalledTimes(1);
    const eventDetail = (eventListener.mock.calls[0][0] as CustomEvent).detail;
    expect(eventDetail.newVersion).toBe('v0.0.3');

    // Subsequent response with the same new version should not duplicate notifications
    checkResponseVersion(mockResponse);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(eventListener).toHaveBeenCalledTimes(1);

    window.removeEventListener('hpic:version-mismatch', eventListener);
    unsubscribe();
  });

  it('does not trigger mismatch when X-Hpic-Version matches current frontend version', () => {
    const callback = vi.fn();
    const unsubscribe = onVersionMismatch(callback);

    const mockHeaders = new Headers();
    // Use dynamic DEFAULT_APP_VERSION so tests adapt to releases automatically
    mockHeaders.set('X-Hpic-Version', `v${DEFAULT_APP_VERSION}`);
    const mockResponse = new Response('{}', { headers: mockHeaders });

    checkResponseVersion(mockResponse);

    expect(callback).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('intercepts API calls and extracts X-Hpic-Version', async () => {
    const callback = vi.fn();
    const unsubscribe = onVersionMismatch(callback);

    const mockHeaders = new Headers();
    mockHeaders.set('X-Hpic-Version', 'v0.0.9');

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ hexo_dir: '/path', posts: [], total: 0 }), {
        status: 200,
        headers: mockHeaders,
      })
    );

    const res = await api.getPosts();
    expect(res.posts).toEqual([]);
    expect(callback).toHaveBeenCalledWith('v0.0.9', expect.any(String));

    unsubscribe();
  });

  it('provides getPostsStatus API method', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, last_modified: 1730000000000, count: 5 }), {
        status: 200,
        headers: new Headers(),
      })
    );

    const status = await api.getPostsStatus();
    expect(status.last_modified).toBe(1730000000000);
    expect(status.count).toBe(5);
  });

  // --- HTTP 错误处理测试 (res.ok 检查) ---

  it('getConfig throws on HTTP error response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Internal Server Error' }), {
        status: 500,
        headers: new Headers({ 'Content-Type': 'application/json' }),
      })
    );

    await expect(api.getConfig()).rejects.toThrow('获取配置失败 (HTTP 500)');
  });

  it('getPosts throws on HTTP error response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Bad Request' }), {
        status: 400,
        headers: new Headers({ 'Content-Type': 'application/json' }),
      })
    );

    await expect(api.getPosts()).rejects.toThrow('获取文章列表失败 (HTTP 400)');
  });

  it('getPost throws on HTTP 404 when post not found', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Not Found' }), {
        status: 404,
        headers: new Headers({ 'Content-Type': 'application/json' }),
      })
    );

    await expect(api.getPost('/path/to/missing.md')).rejects.toThrow('获取文章详情失败 (HTTP 404)');
  });

  it('getPostsStatus throws on HTTP error response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Service Unavailable', {
        status: 503,
        headers: new Headers(),
      })
    );

    await expect(api.getPostsStatus()).rejects.toThrow('获取文章状态失败 (HTTP 503)');
  });

  it('getPostHistory throws on HTTP error response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: new Headers({ 'Content-Type': 'application/json' }),
      })
    );

    await expect(api.getPostHistory('/path/to/file.md')).rejects.toThrow('获取历史版本失败 (HTTP 403)');
  });

  it('checkHealth throws on HTTP error response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Internal Server Error' }), {
        status: 500,
        headers: new Headers({ 'Content-Type': 'application/json' }),
      })
    );

    await expect(api.checkHealth()).rejects.toThrow('健康检查失败 (HTTP 500)');
  });

  it('getFavorites throws on HTTP error response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: new Headers({ 'Content-Type': 'application/json' }),
      })
    );

    await expect(api.getFavorites()).rejects.toThrow('获取收藏列表失败 (HTTP 401)');
  });

  it('successful 200 response does not throw', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ hexo_dir: '/test', proxy: '' }), {
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
      })
    );

    const config = await api.getConfig();
    expect(config.hexo_dir).toBe('/test');
  });
});
