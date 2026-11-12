import { CommandItem } from '../types';
import { CommandDeps } from './deps';

/** 工具与诊断类命令 */
export function toolCommands(deps: CommandDeps): CommandItem[] {
  return [
    {
      id: 'tools.health',
      group: 'tools',
      title: '全站封面 404 死链存活性扫描',
      keywords: ['health', 'silian', 'tijian', 'sl', '404'],
      run: () => deps.onOpenHealth(),
    },
    {
      id: 'tools.update',
      group: 'tools',
      title: '检查软件版本更新',
      keywords: ['update', 'gengxin', 'upgrade', 'gx', 'version'],
      run: () => deps.onOpenUpdate(),
    },
    {
      id: 'tools.globalHistory',
      group: 'tools',
      title: '全部文章操作历史（按批次撤销）',
      keywords: ['history', 'lishi', 'undo', 'cx', 'batch', 'pilci', 'global'],
      run: () => deps.onOpenGlobalHistory(),
    },
  ];
}
