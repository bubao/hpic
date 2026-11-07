import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useConfigField } from './useConfigField';
import { Config, createDefaultConfig } from '../../types';

describe('useConfigField', () => {
  const makeConfig = (patch: Partial<Config> = {}): Config => ({
    ...createDefaultConfig(),
    ...patch,
  });

  it('从 config 初始化草稿值', () => {
    const { result } = renderHook(() =>
      useConfigField('orientation', makeConfig({ orientation: 'portrait' }), vi.fn())
    );
    expect(result.current[0]).toBe('portrait');
  });

  it('配置缺省时回退 DEFAULT_CONFIG', () => {
    const config = makeConfig();
    delete config.theme;
    const { result } = renderHook(() => useConfigField('theme', config, vi.fn()));
    expect(result.current[0]).toBe('dark');
  });

  it('变更时同步本地状态并上抛同名字段 patch', () => {
    const onConfigChange = vi.fn();
    const { result } = renderHook(() =>
      useConfigField('github_owner', makeConfig({ github_owner: 'old' }), onConfigChange)
    );

    act(() => result.current[1]('new'));

    expect(result.current[0]).toBe('new');
    expect(onConfigChange).toHaveBeenCalledWith({ github_owner: 'new' });
  });

  it('支持 UI 态与配置态不同构的字段（字符串 ↔ 数组）', () => {
    const onConfigChange = vi.fn();
    const { result } = renderHook(() =>
      useConfigField('cover_fields', makeConfig({ cover_fields: ['index_img', 'banner_img'] }), onConfigChange, {
        toUI: list => (list || []).join(', '),
        toConfig: raw => ({
          cover_fields: raw.split(',').map(s => s.trim()).filter(Boolean),
        }),
      })
    );

    expect(result.current[0]).toBe('index_img, banner_img');

    act(() => result.current[1]('cover, banner'));

    expect(result.current[0]).toBe('cover, banner');
    expect(onConfigChange).toHaveBeenCalledWith({ cover_fields: ['cover', 'banner'] });
  });

  it('数值字段由调用方解析后写入', () => {
    const onConfigChange = vi.fn();
    const { result } = renderHook(() =>
      useConfigField('min_width', makeConfig({ min_width: 1200 }), onConfigChange)
    );

    act(() => result.current[1](1600));

    expect(onConfigChange).toHaveBeenCalledWith({ min_width: 1600 });
  });

  it('布尔字段缺省回退默认 false', () => {
    const config = makeConfig();
    delete (config as Partial<Config>).infinite_scroll;
    const { result } = renderHook(() => useConfigField('infinite_scroll', config, vi.fn()));
    expect(result.current[0]).toBe(false);
  });
});
