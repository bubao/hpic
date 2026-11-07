import { CommandItem } from '../types';
import { CommandDeps } from './deps';

/** Hexo 服务与构建类命令 */
export function hexoCommands(deps: CommandDeps): CommandItem[] {
  return [
    {
      id: 'hexo.toggle_server',
      group: 'hexo',
      title: deps.hexoStatus?.server_running || deps.hexoStatus?.running ? '停止 Hexo 本地服务' : '启动 Hexo 本地服务',
      keywords: ['server', 'fuwu', 'qidong', 'tingzhi', 'start', 'stop'],
      run: () => deps.onToggleServer(),
    },
    {
      id: 'hexo.preview',
      group: 'hexo',
      title: '在浏览器中预览 Hexo 博客',
      keywords: ['preview', 'yulan', 'yl', 'browser', 'liulanqi'],
      run: () => deps.onPreview(),
    },
    {
      id: 'hexo.generate',
      group: 'hexo',
      title: '重新打包生成静态页面',
      keywords: ['generate', 'shengcheng', 'sc', 'build', 'jingtai'],
      run: () => deps.onGenerate(),
    },
    {
      id: 'hexo.clean',
      group: 'hexo',
      title: '清理 Hexo 缓存与静态构建物',
      keywords: ['clean', 'qingli', 'ql', 'huancun'],
      run: () => deps.onClean(),
    },
    {
      id: 'hexo.deploy',
      group: 'hexo',
      title: '一键部署发布到远端',
      keywords: ['deploy', 'bushu', 'fabu', 'bs', 'git'],
      run: () => deps.onOpenDeploy(),
    },
    {
      id: 'hexo.logs',
      group: 'hexo',
      title: '查看 Hexo 终端实时运行日志',
      keywords: ['logs', 'rizhi', 'terminal', 'zhongduan', 'rz'],
      run: () => deps.onOpenLogs(),
    },
  ];
}
