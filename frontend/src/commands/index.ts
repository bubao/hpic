import { CommandItem } from '../types';
import { CommandDeps } from './deps';
import { postCommands } from './posts';
import { hexoCommands } from './hexo';
import { themeCommands } from './theme';
import { settingsCommands } from './settings';
import { toolCommands } from './tools';
import { navigationCommands } from './navigation';

/**
 * ⌘K 命令面板条目注册表（App.tsx A7 提取）。
 * 新增命令：实现对应域模块后在此聚合一行，无需改动 App。
 */
export function buildCommandItems(deps: CommandDeps): CommandItem[] {
  return [
    ...postCommands(deps),
    ...hexoCommands(deps),
    ...themeCommands(deps),
    ...settingsCommands(deps),
    ...toolCommands(deps),
    ...navigationCommands(deps),
  ];
}

export type { CommandDeps } from './deps';
