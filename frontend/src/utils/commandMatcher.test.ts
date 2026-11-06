import { describe, it, expect } from 'vitest';
import {
  fuzzyMatch,
  splitQuerySegments,
  normalizeText,
  getCommandInitials,
  scoreCommand,
  rankCommands,
  getUsageScore,
  recordCommandUsage,
  loadUsageStats,
  saveUsageStats,
  highlightCommandTitle,
} from './commandMatcher';
import { CommandItem, UsageStats } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-11-06T12:00:00.000Z');

function makeCommand(overrides: Partial<CommandItem> = {}): CommandItem {
  return {
    id: 'cmd.test',
    group: 'general',
    title: '切换主题',
    run: () => {},
    ...overrides,
  };
}

function createMemoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    get length() {
      return map.size;
    },
  } as unknown as Storage;
}

describe('基础文本工具', () => {
  it('normalizeText 归一化空白并转小写', () => {
    expect(normalizeText('  切换   主题 ')).toBe('切换 主题');
    expect(normalizeText('Open Settings')).toBe('open settings');
  });

  it('splitQuerySegments 处理空查询', () => {
    expect(splitQuerySegments('')).toEqual([]);
    expect(splitQuerySegments('   ')).toEqual([]);
  });

  it('纯中文/纯英文片段整体保留', () => {
    expect(splitQuerySegments('qhzt')).toEqual(['qhzt']);
    expect(splitQuerySegments('切换主题')).toEqual(['切换主题']);
  });

  it('多词按空格拆分（AND 语义）', () => {
    expect(splitQuerySegments('切换 主题')).toEqual(['切换', '主题']);
    expect(splitQuerySegments('theme 切换主题')).toEqual(['theme', '切换主题']);
    expect(splitQuerySegments('切换   主题')).toEqual(['切换', '主题']);
  });

  it('中文+英文混合片段拆成最小片段', () => {
    expect(splitQuerySegments('abc主题')).toEqual(['abc', '主题']);
    expect(splitQuerySegments('切换theme')).toEqual(['切换', 'theme']);
    expect(splitQuerySegments('open-2024')).toEqual(['open', '2024']);
  });

  it('重复分词去重', () => {
    expect(splitQuerySegments('切换 切换')).toEqual(['切换']);
  });
});

describe('拼音首字母索引', () => {
  it('中文取首字母、英文数字原样保留', () => {
    expect(getCommandInitials(makeCommand({ title: '切换主题' }))).toBe('qhzt');
    expect(getCommandInitials(makeCommand({ title: 'Open 设置' }))).toBe('opensz');
  });

  it('把关键词纳入首字母索引', () => {
    // 英文关键词原样并入索引，便于直接用英文片段命中
    expect(getCommandInitials(makeCommand({ title: '切换主题', keywords: ['theme'] }))).toBe('qhzttheme');
  });

  it('预置汉字不参与索引时跳过（标点/空格）', () => {
    expect(getCommandInitials(makeCommand({ title: '刷新 · 列表' }))).toBe('sxlb');
  });
});

describe('fuzzyMatch 子序列匹配', () => {
  it('空查询返回 0 分且无命中位置', () => {
    expect(fuzzyMatch('', 'abc')).toEqual({ score: 0, positions: [] });
  });

  it('字符顺序不满足时返回 null', () => {
    expect(fuzzyMatch('ca', 'abc')).toBeNull();
    expect(fuzzyMatch('abcde', 'abc')).toBeNull();
  });

  it('返回按顺序的命中位置与正分数', () => {
    const result = fuzzyMatch('hw', 'hello world');
    expect(result).not.toBeNull();
    expect(result!.positions).toEqual([0, 6]);
    expect(result!.score).toBeGreaterThan(0);
  });

  it('大小写不敏感', () => {
    const lower = fuzzyMatch('hw', 'hello world');
    const upper = fuzzyMatch('HW', 'HELLO WORLD');
    expect(upper!.positions).toEqual(lower!.positions);
    expect(upper!.score).toBeCloseTo(lower!.score, 6);
  });

  it('连续与前缀命中得分更高', () => {
    const prefix = fuzzyMatch('hel', 'hello')!;
    const scattered = fuzzyMatch('hlo', 'hello')!;
    expect(prefix.score).toBeGreaterThan(scattered.score);
  });
});

describe('scoreCommand 命令打分', () => {
  const command = makeCommand();

  it('空查询返回 0（用于「最近使用」默认列表）', () => {
    expect(scoreCommand('', command)).toBe(0);
  });

  it('拼音首字母命中（qhzt → 切换主题）', () => {
    expect(scoreCommand('qhzt', command)).toBeGreaterThan(0);
    expect(scoreCommand('qhz', command)).toBeGreaterThan(0);
    expect(scoreCommand('theme', makeCommand({ title: '切换主题', keywords: ['theme'] }))).toBeGreaterThan(0);
  });

  it('中文片段直接命中', () => {
    expect(scoreCommand('主题', command)).toBeGreaterThan(0);
    expect(scoreCommand('切换 主题', command)).toBeGreaterThan(0);
  });

  it('标题整串精确命中优先于拼音首字母', () => {
    const exact = scoreCommand('切换主题', command)!;
    const pinyin = scoreCommand('qhzt', command)!;
    expect(exact).toBeGreaterThan(pinyin);
  });

  it('关键词命中', () => {
    const cmd = makeCommand({ id: 'cmd.reload', title: '刷新列表', keywords: ['reload posts'] });
    expect(scoreCommand('reload', cmd)).toBeGreaterThan(0);
    expect(scoreCommand('posts', cmd)).toBeGreaterThan(0);
  });

  it('无法匹配返回 null', () => {
    expect(scoreCommand('xyz', command)).toBeNull();
    expect(scoreCommand('切换 xyz', command)).toBeNull();
  });
});

describe('getUsageScore 频次衰减', () => {
  it('缺失记录或 0 次返回 0', () => {
    expect(getUsageScore({}, 'cmd.a', NOW)).toBe(0);
    expect(getUsageScore({ 'cmd.a': { count: 0, last_used: NOW } }, 'cmd.a', NOW)).toBe(0);
  });

  it('刚使用的记录不衰减', () => {
    const stats: UsageStats = { 'cmd.a': { count: 8, last_used: NOW } };
    expect(getUsageScore(stats, 'cmd.a', NOW)).toBeCloseTo(8, 6);
  });

  it('半衰期 14 天：14 天前的记录衰减一半', () => {
    const stats: UsageStats = { 'cmd.a': { count: 8, last_used: NOW - 14 * DAY_MS } };
    expect(getUsageScore(stats, 'cmd.a', NOW)).toBeCloseTo(4, 6);
  });

  it('未来时间戳按未衰减处理', () => {
    const stats: UsageStats = { 'cmd.a': { count: 5, last_used: NOW + DAY_MS } };
    expect(getUsageScore(stats, 'cmd.a', NOW)).toBeCloseTo(5, 6);
  });
});

describe('recordCommandUsage 频次记录', () => {
  it('累计次数并刷新 last_used', () => {
    const next = recordCommandUsage({}, 'cmd.a', NOW);
    expect(next['cmd.a']).toEqual({ count: 1, last_used: NOW });

    const again = recordCommandUsage(next, 'cmd.a', NOW + DAY_MS);
    expect(again['cmd.a']).toEqual({ count: 2, last_used: NOW + DAY_MS });
  });

  it('次数上限 999', () => {
    const stats: UsageStats = { 'cmd.a': { count: 999, last_used: NOW } };
    expect(recordCommandUsage(stats, 'cmd.a', NOW)['cmd.a'].count).toBe(999);
  });

  it('清理超过 90 天未使用的记录', () => {
    const stale: UsageStats = { 'cmd.old': { count: 30, last_used: NOW - 91 * DAY_MS } };
    const next = recordCommandUsage(stale, 'cmd.new', NOW);
    expect(next['cmd.old']).toBeUndefined();
    expect(next['cmd.new']).toBeDefined();
  });

  it('最多保留 240 条（按累计次数裁剪）', () => {
    const stats: UsageStats = {};
    for (let i = 0; i < 250; i++) {
      stats[`cmd.${i}`] = { count: i + 1, last_used: NOW };
    }
    const next = recordCommandUsage(stats, 'cmd.new', NOW);
    expect(Object.keys(next).length).toBeLessThanOrEqual(240);
  });
});

describe('loadUsageStats / saveUsageStats 持久化', () => {
  it('save → load 往返一致', () => {
    const storage = createMemoryStorage();
    const stats: UsageStats = {
      'cmd.a': { count: 3, last_used: NOW },
      'cmd.b': { count: 12, last_used: NOW - DAY_MS },
    };
    saveUsageStats(stats, storage);
    expect(loadUsageStats(storage, NOW)).toEqual(stats);
  });

  it('无存储时返回空', () => {
    expect(loadUsageStats(null, NOW)).toEqual({});
  });

  it('损坏的 JSON 返回空对象', () => {
    const storage = createMemoryStorage({ 'hpic.command-palette.usage.v1': '{bad json' });
    expect(loadUsageStats(storage, NOW)).toEqual({});
  });

  it('结构不符（缺少 entries）返回空对象', () => {
    const storage = createMemoryStorage({
      'hpic.command-palette.usage.v1': JSON.stringify({ version: 1 }),
    });
    expect(loadUsageStats(storage, NOW)).toEqual({});
  });

  it('清洗非法条目并裁剪次数与过期记录', () => {
    const storage = createMemoryStorage({
      'hpic.command-palette.usage.v1': JSON.stringify({
        version: 1,
        entries: {
          good: { count: 2, last_used: NOW },
          'count-as-string': { count: '3', last_used: NOW },
          stale: { count: 10, last_used: NOW - 100 * DAY_MS },
        },
      }),
    });
    expect(loadUsageStats(storage, NOW)).toEqual({
      good: { count: 2, last_used: NOW },
    });
  });
});

describe('rankCommands 过滤与排序', () => {
  it('过滤 disabled 命令', () => {
    const commands = [
      makeCommand({ id: 'cmd.a', title: '切换主题' }),
      makeCommand({ id: 'cmd.b', title: '刷新列表', enabled: false }),
    ];
    expect(rankCommands(commands, '', {}, NOW).map(c => c.id)).toEqual(['cmd.a']);
  });

  it('无查询词时按衰减后的使用频次排序', () => {
    const commands = [
      makeCommand({ id: 'cmd.old', title: '旧命令' }),
      makeCommand({ id: 'cmd.hot', title: '常用命令' }),
    ];
    const usage: UsageStats = {
      'cmd.hot': { count: 10, last_used: NOW },
      'cmd.old': { count: 10, last_used: NOW - 30 * DAY_MS },
    };
    expect(rankCommands(commands, '', usage, NOW).map(c => c.id)).toEqual(['cmd.hot', 'cmd.old']);
  });

  it('相同匹配分时高频命令靠前', () => {
    const commands = [
      makeCommand({ id: 'cmd.plain', title: '切换主题' }),
      makeCommand({ id: 'cmd.frequent', title: '切换语言' }),
    ];
    const usage: UsageStats = {
      'cmd.frequent': { count: 10, last_used: NOW },
    };
    expect(rankCommands(commands, '切换', usage, NOW).map(c => c.id)).toEqual([
      'cmd.frequent',
      'cmd.plain',
    ]);
  });

  it('分数相同按 order 升序、再按标题排序', () => {
    const commands = [
      makeCommand({ id: 'cmd.late', title: '切换主题', order: 5 }),
      makeCommand({ id: 'cmd.early', title: '刷新列表', order: 1 }),
    ];
    expect(rankCommands(commands, '', {}, NOW).map(c => c.id)).toEqual(['cmd.early', 'cmd.late']);

    const tie = [
      makeCommand({ id: 'cmd.a', title: '刷新列表', order: 2 }),
      makeCommand({ id: 'cmd.b', title: '切换主题', order: 2 }),
    ];
    const ids = rankCommands(tie, '', {}, NOW).map(c => c.id);
    expect(ids[0]).toBe('cmd.b');
    expect(ids[1]).toBe('cmd.a');
  });

  it('查询词过滤掉不匹配的命令', () => {
    const commands = [
      makeCommand({ id: 'cmd.theme', title: '切换主题' }),
      makeCommand({ id: 'cmd.refresh', title: '刷新列表' }),
    ];
    expect(rankCommands(commands, 'qhzt', {}, NOW).map(c => c.id)).toEqual(['cmd.theme']);
  });
});

describe('highlightCommandTitle 高亮切割', () => {
  it('空标题返回空数组', () => {
    expect(highlightCommandTitle('', '切换')).toEqual([]);
  });

  it('无命中时整段不高亮', () => {
    expect(highlightCommandTitle('切换主题', '')).toEqual([{ text: '切换主题', match: false }]);
    expect(highlightCommandTitle('切换主题', 'xyz')).toEqual([{ text: '切换主题', match: false }]);
  });

  it('子串命中切出高亮片段', () => {
    expect(highlightCommandTitle('切换主题', '主题')).toEqual([
      { text: '切换', match: false },
      { text: '主题', match: true },
    ]);
  });

  it('拼音首字母查询无对应字符可高亮（由匹配引擎负责命中）', () => {
    expect(highlightCommandTitle('切换主题', 'qhzt')).toEqual([
      { text: '切换主题', match: false },
    ]);
  });

  it('命中片段不重叠且顺序正确', () => {
    const chunks = highlightCommandTitle('Open ABC', 'abc');
    expect(chunks).toEqual([
      { text: 'Open ', match: false },
      { text: 'ABC', match: true },
    ]);
    expect(chunks.map(c => c.text).join('')).toBe('Open ABC');
  });
});
