import { CommandItem } from '../types';
import { CommandDeps } from './deps';

/** 导航与页面类命令 */
export function navigationCommands(deps: CommandDeps): CommandItem[] {
  return [
    {
      id: 'nav.scroll_top',
      group: 'navigation',
      title: '回到内容区顶部',
      keywords: ['top', 'dingbu', 'scroll', 'db', 'huidaodingbu'],
      run: () => deps.onScrollToTop(),
    },
  ];
}
