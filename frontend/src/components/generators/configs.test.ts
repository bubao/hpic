import { describe, it, expect } from 'vitest';
import type { PostInfo } from '../../types';
import {
  PICSMUM_CONFIG,
  LOREMFLICKR_CONFIG,
  SHIELDS_CONFIG,
  GITHUB_STATS_CONFIG,
  QUICKCHART_CONFIG,
  PLACEHOLDER_CONFIG,
  QR_CONFIG,
  DICEBEAR_CONFIG,
  POLLINATIONS_CONFIG,
} from './configs';

const ALL_CONFIGS = {
  picsum: PICSMUM_CONFIG,
  loremflickr: LOREMFLICKR_CONFIG,
  shields: SHIELDS_CONFIG,
  githubStats: GITHUB_STATS_CONFIG,
  quickchart: QUICKCHART_CONFIG,
  placeholder: PLACEHOLDER_CONFIG,
  qr: QR_CONFIG,
  dicebear: DICEBEAR_CONFIG,
  pollinations: POLLINATIONS_CONFIG,
};

describe('generator url builder configs', () => {
  it('每个配置都具备字段、来源标识与兜底标题', () => {
    for (const [name, cfg] of Object.entries(ALL_CONFIGS)) {
      expect(cfg.fields.length, `${name} 缺少字段`).toBeGreaterThan(0);
      expect(cfg.sourceLabel, `${name} 缺少来源标识`).toBeTruthy();
      expect(cfg.fallbackTitle, `${name} 缺少兜底标题`).toBeTruthy();
      expect(typeof cfg.buildUrl, `${name} buildUrl 类型异常`).toBe('function');
    }
  });

  it('缺少必填参数时不生成 URL', () => {
    expect(PICSMUM_CONFIG.buildUrl({ seed: '  ', width: '1920', height: '1080', effect: 'none' })).toBe('');
    expect(SHIELDS_CONFIG.buildUrl({ label: '', message: 'passing', color: 'green' })).toBe('');
    expect(GITHUB_STATS_CONFIG.buildUrl({ username: '', theme: '', show_icons: 'true' })).toBe('');
    expect(QR_CONFIG.buildUrl({ data: ' ', size: '400' })).toBe('');
    expect(DICEBEAR_CONFIG.buildUrl({ style: 'adventurer', seed: '' })).toBe('');
    expect(POLLINATIONS_CONFIG.buildUrl({ prompt: '', width: '1920', height: '1080', model: 'flux', seed: '' })).toBe('');
  });

  it('Picsum 按种子与尺寸拼接，并支持灰度 / 模糊效果', () => {
    expect(
      PICSMUM_CONFIG.buildUrl({ seed: 'mountain', width: '1920', height: '1080', effect: 'none' }),
    ).toBe('https://picsum.photos/seed/mountain/1920/1080');
    expect(
      PICSMUM_CONFIG.buildUrl({ seed: 'mountain', width: '1920', height: '1080', effect: 'grayscale' }),
    ).toBe('https://picsum.photos/seed/mountain/1920/1080?grayscale');
    expect(
      PICSMUM_CONFIG.buildUrl({ seed: 'my photo', width: '800', height: '600', effect: 'blur' }),
    ).toBe('https://picsum.photos/seed/my%20photo/800/600?blur=2');
  });

  it('LoremFlickr 拼接关键词 / 尺寸 / 黑白模式 / 图序', () => {
    expect(
      LOREMFLICKR_CONFIG.buildUrl({ keywords: 'mountain', width: '1920', height: '1080', mode: 'color', index: '' }),
    ).toBe('https://loremflickr.com/1920/1080/mountain');
    expect(
      LOREMFLICKR_CONFIG.buildUrl({ keywords: 'dog, cat', width: '800', height: '600', mode: 'color', index: '' }),
    ).toBe('https://loremflickr.com/800/600/dog,cat');
    expect(
      LOREMFLICKR_CONFIG.buildUrl({ keywords: 'mountain', width: '1920', height: '1080', mode: 'gray', index: '3' }),
    ).toBe('https://loremflickr.com/g/1920/1080/mountain/3');
    expect(
      LOREMFLICKR_CONFIG.buildUrl({ keywords: ' , ', width: '1920', height: '1080', mode: 'color', index: 'abc' }),
    ).toBe('https://loremflickr.com/1920/1080/all');
  });

  it('Shields 对空格做下划线转义并保留颜色段', () => {
    expect(
      SHIELDS_CONFIG.buildUrl({ label: 'build', message: 'passing', color: 'brightgreen' }),
    ).toBe('https://img.shields.io/badge/build-passing-brightgreen');
    expect(
      SHIELDS_CONFIG.buildUrl({ label: 'hello world', message: 'tests passing', color: 'blue' }),
    ).toBe('https://img.shields.io/badge/hello_world-tests_passing-blue');
  });

  it('GitHub Readme Stats 拼接用户名 / 主题 / 图标开关', () => {
    expect(
      GITHUB_STATS_CONFIG.buildUrl({ username: 'bubao', theme: 'dark', show_icons: 'true' }),
    ).toBe('https://github-readme-stats.vercel.app/api?username=bubao&theme=dark&show_icons=true');
    expect(
      GITHUB_STATS_CONFIG.buildUrl({ username: 'bubao', theme: '', show_icons: 'false' }),
    ).toBe('https://github-readme-stats.vercel.app/api?username=bubao&show_icons=false');
  });

  it('GitHub Readme Stats 依据默认 Owner 预填用户名', () => {
    const values = GITHUB_STATS_CONFIG.initialValues?.({
      defaultOwner: 'bubao',
      post: {} as PostInfo,
    });
    expect(values).toEqual({ username: 'bubao' });
    expect(GITHUB_STATS_CONFIG.initialValues?.({ defaultOwner: '', post: {} as PostInfo })).toEqual({ username: '' });
  });

  it('QuickChart 仅在 JSON 合法时生成图表链接', () => {
    const valid = QUICKCHART_CONFIG.buildUrl({
      config: '{"type":"bar","data":{"labels":["A"]}}',
      width: '800',
      height: '500',
    });
    expect(valid.startsWith('https://quickchart.io/chart?')).toBe(true);
    expect(valid).toContain('w=800');
    expect(valid).toContain('h=500');
    expect(QUICKCHART_CONFIG.buildUrl({ config: '{ not json', width: '800', height: '500' })).toBe('');
  });

  it('Placeholder 按尺寸 / 颜色 / 文字生成占位图', () => {
    expect(
      PLACEHOLDER_CONFIG.buildUrl({ width: '1920', height: '1080', text: 'hpic', bg: 'EEEEEE', color: '31343C' }),
    ).toBe('https://placehold.co/1920x1080/EEEEEE/31343C?text=hpic');
  });

  it('QR Code 对内容做 URL 编码', () => {
    expect(
      QR_CONFIG.buildUrl({ data: 'https://github.com/bubao/hpic', size: '400' }),
    ).toBe('https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=https%3A%2F%2Fgithub.com%2Fbubao%2Fhpic');
  });

  it('DiceBear 按风格与种子生成矢量头像', () => {
    expect(
      DICEBEAR_CONFIG.buildUrl({ style: 'adventurer', seed: 'hpic' }),
    ).toBe('https://api.dicebear.com/9.x/adventurer/svg?seed=hpic');
  });

  it('Pollinations 编码提示词并附加尺寸 / 模型 / 种子', () => {
    expect(
      POLLINATIONS_CONFIG.buildUrl({ prompt: 'a futuristic city', width: '1920', height: '1080', model: 'flux', seed: '' }),
    ).toBe('https://image.pollinations.ai/prompt/a%20futuristic%20city?width=1920&height=1080&model=flux&nologo=true');
    expect(
      POLLINATIONS_CONFIG.buildUrl({ prompt: 'city', width: '800', height: '600', model: 'turbo', seed: '42' }),
    ).toBe('https://image.pollinations.ai/prompt/city?width=800&height=600&model=turbo&nologo=true&seed=42');
  });
});
