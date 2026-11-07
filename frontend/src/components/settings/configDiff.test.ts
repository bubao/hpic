import { describe, it, expect } from 'vitest';
import { buildConfigUpdate, normalizeConfigForSave } from './configDiff';
import { Config, createDefaultConfig } from '../../types';

/** 基于默认工厂构造一份固定基准，便于逐字段构造变更 */
const base = (): Config => createDefaultConfig();

describe('buildConfigUpdate（entries diff）', () => {
  it('草稿与基准一致时不产生任何 patch', () => {
    const draft = base();
    const baseline = base();
    expect(buildConfigUpdate(draft, baseline)).toEqual({});
  });

  it('hexo_dir 变更时同步派生 posts_dir / drafts_dir', () => {
    const draft = { ...base(), hexo_dir: '/Users/demo/blog ' };
    const patch = buildConfigUpdate(draft, base());
    expect(patch.hexo_dir).toBe('/Users/demo/blog');
    expect(patch.posts_dir).toBe('/Users/demo/blog/source/_posts');
    expect(patch.drafts_dir).toBe('/Users/demo/blog/source/_drafts');
  });

  it('清空 hexo_dir 时派生目录一并清空', () => {
    const start = { ...base(), hexo_dir: '/x', posts_dir: '/x/source/_posts', drafts_dir: '/x/source/_drafts' };
    const patch = buildConfigUpdate({ ...base(), hexo_dir: '  ' }, start);
    expect(patch.hexo_dir).toBe('');
    expect(patch.posts_dir).toBe('');
    expect(patch.drafts_dir).toBe('');
  });

  it('cover_fields 有序比较，去重空白；清空时回退默认列表', () => {
    const draft = { ...base(), cover_fields: ['banner_img', ' index_img '] };
    const patch = buildConfigUpdate(draft, base());
    expect(patch.cover_fields).toEqual(['banner_img', 'index_img']);

    const emptyPatch = buildConfigUpdate({ ...base(), cover_fields: ['  ', ''] }, base());
    expect(emptyPatch.cover_fields).toEqual(['index_img', 'banner_img']);
  });

  it('数值字段按 fallback + 裁剪归一化', () => {
    const draft = {
      ...base(),
      min_width: 0,       // 非法 → 回退 1200
      min_height: 42,     // 低于下限 → 100
      image_quality: 999, // 高于上限 → 100
      image_width: 1600,  // 合法
    };
    const patch = buildConfigUpdate(draft, base());
    expect(patch.min_width).toBeUndefined();
    expect(patch.min_height).toBe(100);
    expect(patch.image_quality).toBe(100);
    expect(patch.image_width).toBe(1600);
  });

  it('布尔字段按 Boolean 归一化后比较', () => {
    const draft = { ...base(), auto_search: true, infinite_scroll: 1 as unknown as boolean };
    const patch = buildConfigUpdate(draft, base());
    expect(patch.auto_search).toBe(true);
    expect(patch.infinite_scroll).toBe(true);
  });

  it('socialify_theme 大小写不敏感比较，但 patch 保留原始值', () => {
    // 仅大小写不同 → 归一化后相等，不产生 patch
    const patch = buildConfigUpdate({ ...base(), socialify_theme: 'DARK' }, base());
    expect(patch.socialify_theme).toBeUndefined();

    const changed = buildConfigUpdate({ ...base(), socialify_theme: 'Light' }, base());
    expect(changed.socialify_theme).toBe('Light');
  });

  it('文本字段去空格比较与写入', () => {
    const patch = buildConfigUpdate(
      { ...base(), github_owner: '  bubao ', proxy: ' http://127.0.0.1:7890 ' },
      base()
    );
    expect(patch.github_owner).toBe('bubao');
    expect(patch.proxy).toBe('http://127.0.0.1:7890');
  });

  it('custom_css 按去空格比较但写入原始文本', () => {
    const css = ':root {\n  --accent: #fff;\n}\n';
    const draft = { ...base(), custom_css: css };
    expect(buildConfigUpdate(draft, draft)).toEqual({});
    expect(buildConfigUpdate(draft, base()).custom_css).toBe(css);
  });

  it('date_field 等可填空字段回退默认，空白串 trim 后为空', () => {
    expect(buildConfigUpdate({ ...base(), date_field: '' }, base()).date_field).toBeUndefined();
    const ws = buildConfigUpdate({ ...base(), date_field: '   ' }, base());
    expect(ws.date_field).toBe('');
  });

  it('git_commit_template 空白输入会 trim 为空串（与原逻辑一致）', () => {
    expect(buildConfigUpdate({ ...base(), git_commit_template: '   ' }, base()).git_commit_template).toBe('');
    expect(
      buildConfigUpdate({ ...base(), git_commit_template: '   ' }, base()).git_commit_template
    ).toBeDefined();
  });

  it('主题 / 构图等枚举字段空值回退默认', () => {
    expect(
      buildConfigUpdate({ ...base(), theme: '' as unknown as Config['theme'] }, base()).theme
    ).toBeUndefined();
    expect(buildConfigUpdate({ ...base(), orientation: 'portrait' }, base()).orientation).toBe('portrait');
  });

  it('仅包含 Config 扩展字段（version / config_file_path）时不产生 patch', () => {
    const patch = buildConfigUpdate(
      { ...base(), version: '9.9.9', config_file_path: '/tmp/x' },
      base()
    );
    expect(patch.version).toBeUndefined();
    expect(patch.config_file_path).toBeUndefined();
  });
});

describe('normalizeConfigForSave', () => {
  it('对单字段套用与 diff 相同的归一化与派生', () => {
    const out = normalizeConfigForSave({ ...base(), hexo_dir: ' /a/b ' });
    expect(out.hexo_dir).toBe('/a/b');
    expect(out.posts_dir).toBe('/a/b/source/_posts');
    expect(out.drafts_dir).toBe('/a/b/source/_drafts');
  });
});
