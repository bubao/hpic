import { describe, it, expect } from 'vitest';
import { zhCN } from './locales/zh-CN';
import { enUS } from './locales/en-US';

describe('i18n translation completeness', () => {
  it('should have matching keys between zh-CN and en-US', () => {
    const zhKeys = Object.keys(zhCN);
    const enKeys = Object.keys(enUS);

    expect(zhKeys.sort()).toEqual(enKeys.sort());

    for (const key of zhKeys as Array<keyof typeof zhCN>) {
      const zhSubKeys = Object.keys(zhCN[key]);
      const enSubKeys = Object.keys(enUS[key]);
      expect(zhSubKeys.sort()).toEqual(enSubKeys.sort());
    }
  });

  it('should verify core terms are defined properly', () => {
    expect(zhCN.settings.tabGenerators).toBe('卡片生成器');
    expect(enUS.settings.tabGenerators).toBe('Card Generators');

    expect(zhCN.settings.unsavedTitle).toBe('检测到未保存的设置更改');
    expect(enUS.settings.unsavedTitle).toBe('Unsaved Changes Detected');
  });
});
