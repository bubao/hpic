import { useState, useCallback } from 'react';
import { Config, DEFAULT_CONFIG } from '../../types';

/**
 * 字段级表单状态（C1 维护点收敛）：
 * 收敛设置面板中「useState(config.x || fallback) + 手动 onConfigChange({ ... })」的重复样板。
 *
 * - 内部持有草稿值，初始值从 config 派生，缺省回退 {@link DEFAULT_CONFIG}；
 * - 变更时同步本地状态并通过 onConfigChange 上抛 patch；
 * - 通过 toUI / toConfig 支持「UI 态与配置态不同构」的字段（如字符串 ↔ 数组）。
 *
 * 用法：
 *   const [orientation, setOrientation] = useConfigField('orientation', config, onConfigChange);
 *   onChange={e => setOrientation(e.target.value)}
 *
 *   const [coverFields, setCoverFields] = useConfigField('cover_fields', config, onConfigChange, {
 *     toUI: list => (list || []).join(', '),
 *     toConfig: raw => ({ cover_fields: raw.split(',').map(s => s.trim()).filter(Boolean) }),
 *   });
 */
export function useConfigField<K extends keyof Config>(
  key: K,
  config: Config,
  onConfigChange: (patch: Partial<Config>) => void,
): readonly [NonNullable<Config[K]>, (next: NonNullable<Config[K]>) => void];
export function useConfigField<K extends keyof Config, UI>(
  key: K,
  config: Config,
  onConfigChange: (patch: Partial<Config>) => void,
  transform: {
    toUI: (value: Config[K]) => UI;
    toConfig: (ui: UI) => Partial<Config>;
  },
): readonly [UI, (next: UI) => void];
export function useConfigField<K extends keyof Config, UI = NonNullable<Config[K]>>(
  key: K,
  config: Config,
  onConfigChange: (patch: Partial<Config>) => void,
  transform?: {
    toUI?: (value: Config[K]) => UI;
    toConfig: (ui: UI) => Partial<Config>;
  },
): readonly [UI, (next: UI) => void] {
  const toUI = transform?.toUI ?? ((value: Config[K]) => value as unknown as UI);
  const toConfig =
    transform?.toConfig ?? ((ui: UI) => ({ [key]: ui }) as unknown as Partial<Config>);
  const [value, setValue] = useState<UI>(
    toUI((config[key] ?? DEFAULT_CONFIG[key]) as Config[K])
  );
  const update = useCallback(
    (next: UI) => {
      setValue(next);
      onConfigChange(toConfig(next));
    },
    [onConfigChange, toConfig]
  );
  return [value, update] as const;
}
