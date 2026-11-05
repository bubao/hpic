import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api, normalizeVersion, isVersionMismatch, onVersionMismatch, resetVersionMismatchState, checkResponseVersion } from './api';

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
    // Default version in package.json / types.ts is '0.0.2'
    mockHeaders.set('X-Hpic-Version', 'v0.0.2');
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
});
