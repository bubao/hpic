import { Config, DEFAULT_CONFIG } from '../../types';

/**
 * 配置差分（C1 维护点收敛）：
 * 由「字段规则表 + entries 遍历」自动生成保存 patch，替代逐字段手写的差异比对。
 *
 * - 新字段只要在 {@link DEFAULT_CONFIG} 登记默认值，即自动进入 diff（走类型默认归一化）；
 * - 需要特殊比较 / 写入 / 派生语义的字段，在 {@link CONFIG_FIELD_RULES} 注册规则即可。
 * - 归一化规则与保存行为保持一致（默认值回退 / 裁剪 / 去空格 / 派生目录），
 *   未变化的字段不会进入 patch，天然支持后端局部保存语义。
 */

/** 数值归一化：非法输入（0 / NaN / 非数字）回退默认值后按 [min, max] 裁剪 */
function clampNumber(val: unknown, fallback: number, min: number, max?: number): number {
  const n = Number(val) || fallback;
  return typeof max === 'number' ? Math.min(max, Math.max(min, n)) : Math.max(min, n);
}

const trimString = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const asBool = (v: unknown): boolean => Boolean(v);

/** 空串 / 非串 → 回退默认值（用于枚举类字段） */
const orFallback = (fallback: string) => (v: unknown): string =>
  typeof v === 'string' && v !== '' ? v : fallback;

/** (v || fallback).trim() ——与原保存逻辑逐字对齐（空白串会被 trim 成空串写入） */
const withFallbackTrim = (fallback: string) => (v: unknown): string => {
  const raw = typeof v === 'string' ? v : '';
  return (raw || fallback).trim();
};

const asCoverFields = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(f => (typeof f === 'string' ? f.trim() : '')).filter(Boolean) : [];

const asClamped = (fallback: number, min: number, max?: number) => (v: unknown): number =>
  clampNumber(v, fallback, min, max);

/** 字段级差分规则 */
interface FieldRule {
  /** 比较前归一化（草稿与基准共用同一函数） */
  normalize?: (value: unknown) => unknown;
  /** 差异时写入 patch 的值（缺省写归一化后的草稿值） */
  toPatch?: (draftRaw: unknown, normalized: unknown) => unknown;
  /** 差异时额外派生的 patch 片段（如 hexo_dir → posts_dir / drafts_dir） */
  derive?: (draftRaw: unknown, normalized: unknown) => Record<string, unknown>;
}

/** 特殊字段规则表；未登记字段走「按 DEFAULT_CONFIG 类型的默认归一化」 */
const CONFIG_FIELD_RULES: Partial<Record<keyof Config, FieldRule>> = {
  // Hexo 目录：去空格比较，变更时同步派生 posts / drafts 目录（与后端推导一致）
  hexo_dir: {
    normalize: trimString,
    derive: (_raw, normalized) => {
      const dir = normalized as string;
      return dir
        ? { posts_dir: `${dir}/source/_posts`, drafts_dir: `${dir}/source/_drafts` }
        : { posts_dir: '', drafts_dir: '' };
    },
  },
  // 封面字段：有序比较；清空时回退默认字段列表
  cover_fields: {
    normalize: asCoverFields,
    toPatch: (_raw, normalized) => {
      const list = normalized as string[];
      return list.length > 0 ? list : [...DEFAULT_CONFIG.cover_fields];
    },
  },
  date_field: { normalize: withFallbackTrim('date') },
  updated_field: { normalize: withFallbackTrim('updated') },
  orientation: { normalize: orFallback('landscape') },
  image_size: { normalize: orFallback('large') },
  min_width: { normalize: asClamped(1200, 100) },
  min_height: { normalize: asClamped(600, 100) },
  image_width: { normalize: asClamped(1200, 100) },
  image_quality: { normalize: asClamped(80, 1, 100) },
  github_owner: { normalize: trimString },
  socialify_pattern: { normalize: orFallback('Signal') },
  // 大小写不敏感比较，但 patch 保留原始大小写语义
  socialify_theme: {
    normalize: (v: unknown) => (typeof v === 'string' && v !== '' ? v.toLowerCase() : 'auto'),
    toPatch: (raw) => raw,
  },
  proxy: { normalize: trimString },
  deploy_mode: { normalize: orFallback('git') },
  git_commit_template: { normalize: withFallbackTrim('chore(cover): update cover for {title}') },
  auto_search: { normalize: asBool },
  infinite_scroll: { normalize: asBool },
  theme: { normalize: orFallback('dark') },
  // CSS 内容只按去空格后比较，但保留原始文本写入（含缩进 / 注释）
  custom_css: {
    normalize: trimString,
    toPatch: raw => (typeof raw === 'string' ? raw : ''),
  },
};

/** 未登记字段按 DEFAULT_CONFIG 中默认值的类型自动归一化 */
function defaultNormalize(key: keyof Config): (value: unknown) => unknown {
  const fallback = DEFAULT_CONFIG[key];
  if (typeof fallback === 'number') {
    return (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  }
  if (typeof fallback === 'boolean') {
    return (v: unknown) => Boolean(v);
  }
  if (Array.isArray(fallback)) {
    return (v: unknown) => (Array.isArray(v) ? v : []);
  }
  return (v: unknown) => (typeof v === 'string' ? v : '');
}

/** 数组按有序元素比较，其余按严格相等比较 */
function isEqualValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.join('\u0001') === b.join('\u0001');
  }
  return false;
}

/**
 * 由「草稿 vs 基准」的 entries 差异自动生成增量保存 patch。
 * 新增配置字段只需在 types.ts 的 DEFAULT_CONFIG 登记，无需改动本函数。
 */
export function buildConfigUpdate(draft: Config, base: Config): Partial<Config> {
  const patch: Partial<Config> = {};
  const derived: Partial<Config> = {};
  for (const key of Object.keys(DEFAULT_CONFIG) as (keyof Config)[]) {
    const rule = CONFIG_FIELD_RULES[key] ?? {};
    const normalize = rule.normalize ?? defaultNormalize(key);
    const normalizedDraft = normalize(draft[key]);
    const normalizedBase = normalize(base[key]);
    if (isEqualValue(normalizedDraft, normalizedBase)) continue;

    const nextValue = (rule.toPatch ? rule.toPatch(draft[key], normalizedDraft) : normalizedDraft) as
      | string
      | number
      | boolean
      | string[]
      | undefined;
    (patch as unknown as Record<string, unknown>)[key as string] = nextValue;
    if (rule.derive) {
      Object.assign(derived, rule.derive(draft[key], normalizedDraft));
    }
  }
  // 派生字段最后合并，确保不被后续同名键的普通归一化覆盖
  return { ...patch, ...derived };
}

/**
 * 归一化后的完整配置（供预览 / 展示「实际会保存的值」）。
 * 对每个字段套用与差分相同的归一化，不做差异比较。
 */
export function normalizeConfigForSave(draft: Config): Config {
  const result: Config = { ...draft };
  const derived: Partial<Config> = {};
  for (const key of Object.keys(DEFAULT_CONFIG) as (keyof Config)[]) {
    const rule = CONFIG_FIELD_RULES[key] ?? {};
    const normalize = rule.normalize ?? defaultNormalize(key);
    const normalized = normalize(draft[key]);
    const nextValue = (rule.toPatch ? rule.toPatch(draft[key], normalized) : normalized) as
      | string
      | number
      | boolean
      | string[]
      | undefined;
    (result as unknown as Record<string, unknown>)[key as string] = nextValue;
    if (rule.derive) {
      Object.assign(derived, rule.derive(draft[key], normalized));
    }
  }
  return { ...result, ...derived };
}
