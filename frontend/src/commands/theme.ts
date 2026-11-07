import { CommandItem } from '../types';
import { CommandDeps } from './deps';

/** 外观与主题类命令 */
export function themeCommands(deps: CommandDeps): CommandItem[] {
  const { onSelectTheme, onToggleTheme, onOpenSettings } = deps;
  return [
    {
      id: 'theme.dark',
      group: 'theme',
      title: '切换为暗色夜间主题',
      keywords: ['dark', 'anhei', 'ah', 'heiye'],
      run: () => onSelectTheme('dark'),
    },
    {
      id: 'theme.light',
      group: 'theme',
      title: '切换为亮色清爽主题',
      keywords: ['light', 'liangse', 'ls', 'qingshuang'],
      run: () => onSelectTheme('light'),
    },
    {
      id: 'theme.auto',
      group: 'theme',
      title: '切换为跟随系统外观',
      keywords: ['auto', 'system', 'gensui', 'xitong'],
      run: () => onSelectTheme('auto'),
    },
    {
      id: 'theme.toggle',
      group: 'theme',
      title: '轮换切换明暗主题',
      keywords: ['toggle', 'qiehuan', 'qh'],
      run: () => onToggleTheme(),
    },
    {
      id: 'theme.settings',
      group: 'theme',
      title: '外观与自定义 CSS 偏好设置',
      keywords: ['css', 'style', 'waiguan', 'wg', 'pifu', 'yangshi'],
      run: () => onOpenSettings('appearance'),
    },
  ];
}
