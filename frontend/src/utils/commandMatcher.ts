import { CommandItem, CommandUsageEntry, UsageStats } from '../types';

/** 使用频次持久化键（localStorage） */
export const USAGE_STORAGE_KEY = 'hpic.command-palette.usage.v1';

/** 使用频次的半衰期（14 天）：越久未使用衰减越多 */
const USAGE_HALF_LIFE_MS = 14 * 24 * 60 * 60 * 1000;
/** 本地最多保留的命令条数（按累计次数裁剪） */
const MAX_USAGE_ENTRIES = 240;
/** 超过 90 天未使用的记录直接清理 */
const MAX_USAGE_AGE_MS = 90 * 24 * 60 * 60 * 1000;

const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const TOKEN_SEGMENT_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+|[a-z0-9]+/g;

/**
 * 常用汉字的拼音首字母映射表。
 * 命令标题中出现的中文均在此表内，用于「拼音首字母」检索（如 qhzt → 切换主题）；
 * 完整的全拼别名可直接写在 CommandItem.keywords 中。
 */
const PINYIN_INITIALS: Record<string, string> = {
  切: 'q', 换: 'h', 主: 'z', 题: 't',
  暗: 'a', 色: 's', 黑: 'h', 夜: 'y',
  亮: 'l', 清: 'q', 爽: 's',
  跟: 'g', 随: 's', 系: 'x', 统: 't',
  回: 'h', 到: 'd', 内: 'n', 容: 'r', 区: 'q', 顶: 'd', 部: 'b',
  启: 'q', 动: 'd', 停: 't', 止: 'z', 服: 'f', 务: 'w', 器: 'q',
  预: 'y', 览: 'l', 博: 'b', 客: 'k',
  生: 's', 成: 'c', 静: 'j', 态: 't', 页: 'y', 面: 'm',
  理: 'l', 缓: 'h', 存: 'c',
  署: 's', 发: 'f', 布: 'b',
  打: 'd', 开: 'k', 终: 'z', 端: 'd', 日: 'r', 志: 'z',
  更: 'g', 新: 'x', 与: 'y', 升: 's', 级: 'j',
  封: 'f', 健: 'j', 康: 'k', 体: 't', 检: 'j',
  建: 'j', 文: 'w', 章: 'z',
  刷: 's', 列: 'l', 表: 'b',
  撤: 'c', 销: 'x', 上: 's', 一: 'y', 步: 'b', 操: 'c', 作: 'z',
  历: 'l', 史: 's',
  选: 'x', 择: 'z', 草: 'c', 稿: 'g', 正: 'z', 式: 's',
  设: 's', 置: 'z', 偏: 'p', 好: 'h',
  图: 't', 库: 'k', 尺: 'c', 寸: 'c',
  外: 'w', 观: 'g', 样: 'y',
  源: 'y', 网: 'w', 络: 'l',
  诊: 'z', 断: 'd', 自: 'z',
  关: 'g', 于: 'y', 命: 'm', 令: 'l', 板: 'b',
  收: 's', 藏: 'c', 夹: 'j',
  搜: 's', 索: 's', 扫: 's', 描: 'm',
  标: 'b', 签: 'q', 分: 'f', 类: 'l',
  手: 's', 填: 't', 链: 'l', 接: 'j',
  跳: 't', 转: 'z', 幕: 'm', 查: 'c', 版: 'b', 本: 'b',
  帮: 'b', 助: 'z', 说: 's', 明: 'm',
  快: 'k', 捷: 'j', 键: 'j', 用: 'y',
  按: 'a', 写: 'x', 入: 'r', 口: 'k',
  最: 'z', 近: 'j', 常: 'c', 见: 'j',
  频: 'p', 次: 'c', 排: 'p', 序: 'x',
  词: 'c', 别: 'b', 名: 'm',
};

/* ------------------------------------------------------------------ */
/* 基础文本工具                                                         */
/* ------------------------------------------------------------------ */

export function normalizeText(input: string): string {
  return (input || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function isChineseChar(ch: string): boolean {
  return CJK_RE.test(ch);
}

/**
 * 切分查询为「分词」列表（所有分词必须命中，AND 语义）：
 * - 按空格拆分得到的片段若为「中文+英文/数字」混合，则继续拆成最小片段，
 *   避免完整混合串导致无法匹配（如 "切换theme" → ["切换", "theme"]）；
 * - 纯中文 / 纯英文片段整体参与匹配（保证 "切换主题" 这类完整短语权重最高）。
 */
export function splitQuerySegments(query: string): string[] {
  const normalized = normalizeText(query);
  if (!normalized) return [];
  const segments: string[] = [];
  const seen = new Set<string>();
  const push = (...values: string[]) => {
    for (const value of values) {
      if (value && !seen.has(value)) {
        seen.add(value);
        segments.push(value);
      }
    }
  };

  for (const part of normalized.split(' ').filter(Boolean)) {
    const matched = part.match(TOKEN_SEGMENT_RE);
    if (matched && matched.length > 1) {
      push(...matched);
    } else {
      push(part);
    }
  }
  return segments;
}

/** 生成命令标题/别名的拼音首字母索引（中文取首字母，英文数字原样保留） */
export function getCommandInitials(command: CommandItem): string {
  const haystack = [command.title, ...(command.keywords || [])].join(' ');
  let result = '';
  for (const ch of haystack) {
    const initial = PINYIN_INITIALS[ch];
    if (initial) {
      result += initial;
    } else if (/[a-z0-9]/i.test(ch)) {
      result += ch.toLowerCase();
    }
    // 标点、空格等非字母字符不参与「首字母串」索引
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* 模糊匹配                                                             */
/* ------------------------------------------------------------------ */

export interface FuzzyMatchResult {
  score: number;
  positions: number[];
}

/** 子序列模糊匹配：query 的每个字符按顺序出现在 target 中；返回分数与命中位置 */
export function fuzzyMatch(query: string, target: string): FuzzyMatchResult | null {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (!q) return { score: 0, positions: [] };

  let qi = 0;
  let lastIndex = -2;
  let score = 0;
  const positions: number[] = [];

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] !== q[qi]) continue;
    const consecutive = ti === lastIndex + 1;
    let charScore = 12 + (consecutive ? 6 : 0);
    if (ti === 0 || t[ti - 1] === ' ' || t[ti - 1] === '·' || t[ti - 1] === '-') {
      charScore += 8;
    }
    score += charScore;
    positions.push(ti);
    lastIndex = ti;
    qi++;
  }

  if (qi < q.length) return null;
  if (t.startsWith(q)) score += 30;
  score += Math.min(10, (q.length / Math.max(1, t.length)) * 10);

  return { score, positions };
}

/** 单个分词对单个候选文本的得分（0 = 不匹配） */
function scoreToken(token: string, haystack: string): number {
  const normalized = haystack.toLowerCase();
  const index = normalized.indexOf(token);
  if (index >= 0) {
    let score = 100;
    if (index === 0) score += 25;
    score += Math.min(10, (token.length / Math.max(1, normalized.length)) * 10);
    return score;
  }
  const fuzzy = fuzzyMatch(token, haystack);
  return fuzzy ? Math.max(10, fuzzy.score) : 0;
}

/** 对命令打分；任意分词不匹配则返回 null */
export function scoreCommand(query: string, command: CommandItem): number | null {
  const tokens = splitQuerySegments(query);
  if (tokens.length === 0) return 0;

  const haystacks = [
    command.title,
    ...(command.keywords || []),
    getCommandInitials(command),
  ].filter((value): value is string => Boolean(value));

  let total = 0;
  for (const token of tokens) {
    let best = 0;
    for (const haystack of haystacks) {
      const score = scoreToken(token, haystack);
      if (score > best) best = score;
    }
    if (best <= 0) return null;
    total += best;
  }

  // 标题整串命中额外加权，保证精确搜索置顶
  const normalizedQuery = normalizeText(query);
  if (normalizedQuery && command.title.toLowerCase().includes(normalizedQuery)) {
    total += 20;
  }
  return total;
}

/* ------------------------------------------------------------------ */
/* 使用频次                                                             */
/* ------------------------------------------------------------------ */

/** 频次衰减分：count * 0.5^(距上次使用的天数 / 半衰期) */
export function getUsageScore(stats: UsageStats, id: string, now = Date.now()): number {
  const entry = stats[id];
  if (!entry || !entry.count) return 0;
  const age = Math.max(0, now - (entry.last_used || now));
  return entry.count * Math.pow(0.5, age / USAGE_HALF_LIFE_MS);
}

export function recordCommandUsage(stats: UsageStats, id: string, now = Date.now()): UsageStats {
  const prev = stats[id];
  const nextEntry: CommandUsageEntry = {
    count: Math.min(999, (prev?.count || 0) + 1),
    last_used: now,
  };
  return pruneUsageStats({ ...stats, [id]: nextEntry }, now);
}

function pruneUsageStats(stats: UsageStats, now = Date.now()): UsageStats {
  const entries = Object.entries(stats).filter(
    ([, entry]) =>
      entry &&
      typeof entry.count === 'number' &&
      typeof entry.last_used === 'number' &&
      entry.count > 0 &&
      now - entry.last_used <= MAX_USAGE_AGE_MS
  );
  entries.sort((a, b) => (b[1].count || 0) - (a[1].count || 0));
  return Object.fromEntries(entries.slice(0, MAX_USAGE_ENTRIES));
}

function defaultStorage(): Storage | null {
  try {
    if (typeof localStorage !== 'undefined' && localStorage) return localStorage;
  } catch {
    // 隐私模式等场景下访问 localStorage 可能抛错
  }
  return null;
}

export function loadUsageStats(
  storage: Storage | null = defaultStorage(),
  now = Date.now()
): UsageStats {
  if (!storage) return {};
  try {
    const raw = storage.getItem(USAGE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const entries = parsed?.entries;
    if (!entries || typeof entries !== 'object') return {};
    const result: UsageStats = {};
    for (const [id, value] of Object.entries(entries as Record<string, unknown>)) {
      const entry = value as Partial<CommandUsageEntry>;
      if (
        entry &&
        typeof entry.count === 'number' &&
        typeof entry.last_used === 'number' &&
        entry.count > 0
      ) {
        result[id] = {
          count: Math.min(999, Math.max(1, Math.floor(entry.count))),
          last_used: entry.last_used,
        };
      }
    }
    return pruneUsageStats(result, now);
  } catch {
    return {};
  }
}

export function saveUsageStats(
  stats: UsageStats,
  storage: Storage | null = defaultStorage()
): void {
  if (!storage) return;
  try {
    storage.setItem(USAGE_STORAGE_KEY, JSON.stringify({ version: 1, entries: stats }));
  } catch {
    // 存储空间不足或序列化失败时静默忽略（不影响命令执行）
  }
}

/* ------------------------------------------------------------------ */
/* 排序                                                                 */
/* ------------------------------------------------------------------ */

/**
 * 过滤 + 排序：
 * - 有查询词时，匹配分主导，使用频次作为小幅加权；
 * - 无查询词时，按「衰减后的使用频次」排序，其次按命令 order / 标题。
 */
export function rankCommands(
  commands: CommandItem[],
  query = '',
  usage: UsageStats = {},
  now = Date.now()
): CommandItem[] {
  const normalizedQuery = normalizeText(query);
  const ranked: Array<{ command: CommandItem; score: number }> = [];

  for (const command of commands) {
    if (command.enabled === false) continue;
    const matchScore = scoreCommand(normalizedQuery, command);
    if (matchScore === null) continue;

    const usageScore = getUsageScore(usage, command.id, now);
    const composite = normalizedQuery
      ? matchScore * 10 + Math.min(30, usageScore * 2)
      : usageScore * 10;

    ranked.push({ command, score: composite });
  }

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const orderDiff = (a.command.order ?? 0) - (b.command.order ?? 0);
    if (orderDiff !== 0) return orderDiff;
    return a.command.title.localeCompare(b.command.title, 'zh-Hans-CN');
  });

  return ranked.map(item => item.command);
}

/* ------------------------------------------------------------------ */
/* 高亮                                                                 */
/* ------------------------------------------------------------------ */

export interface HighlightChunk {
  text: string;
  match: boolean;
}

/** 收集标题中被查询命中的字符下标（直接子串优先，其次子序列模糊命中） */
function collectMatchPositions(query: string, title: string): number[] {
  const tokens = splitQuerySegments(query);
  const normalizedQuery = normalizeText(query);
  if (normalizedQuery && !tokens.includes(normalizedQuery)) {
    tokens.push(normalizedQuery);
  }

  const lowerTitle = title.toLowerCase();
  const positions = new Set<number>();

  for (const token of tokens) {
    if (token.length > title.length) continue;
    const index = lowerTitle.indexOf(token);
    if (index >= 0) {
      for (let i = 0; i < token.length; i++) positions.add(index + i);
      continue;
    }
    let qi = 0;
    for (let ti = 0; ti < lowerTitle.length && qi < token.length; ti++) {
      if (lowerTitle[ti] === token[qi]) {
        positions.add(ti);
        qi++;
      }
    }
  }

  return Array.from(positions).sort((a, b) => a - b);
}

/** 把标题按命中区间切成普通/高亮片段 */
export function highlightCommandTitle(title: string, query: string): HighlightChunk[] {
  if (!title) return [];
  const positions = collectMatchPositions(query, title);
  if (positions.length === 0) return [{ text: title, match: false }];

  const marks = new Array<boolean>(title.length).fill(false);
  for (const pos of positions) {
    if (pos >= 0 && pos < marks.length) marks[pos] = true;
  }

  const chunks: HighlightChunk[] = [];
  let buffer = '';
  let currentMatch = marks[0];

  for (let i = 0; i < title.length; i++) {
    if (marks[i] !== currentMatch) {
      if (buffer) chunks.push({ text: buffer, match: currentMatch });
      buffer = '';
      currentMatch = marks[i];
    }
    buffer += title[i];
  }
  if (buffer) chunks.push({ text: buffer, match: currentMatch });

  // 过滤掉纯空片段
  return chunks.filter(chunk => chunk.text.length > 0);
}
