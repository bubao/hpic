import { Config } from '../../types';
import { AppTheme } from '../../utils/useTheme';

/**
 * 设置面板 Tab 统一契约（A9 状态下沉）：
 * - config：当前设置草稿（由 SettingsModal 持有并统一下发）；
 * - onConfigChange：表单字段的增量上抛入口（patch 语义，自动合并进草稿）；
 * - onAppearanceChange：仅外观 Tab 使用，用于即时应用视觉变更。
 *
 * 说明：config / onConfigChange 为必填，保证注册表
 * `LazyExoticComponent<ComponentType<SettingsTabProps>>` 对各 Tab 组件
 * （即使其 props 仅为该契约的子集，如 I18nTab / DoctorTab）保持 TypeScript 可赋值。
 */
export interface SettingsTabProps {
  config: Config;
  onConfigChange: (patch: Partial<Config>) => void;
  onAppearanceChange?: (theme: AppTheme, customCSS: string) => void;
}
