import { CommandItem } from '../types';
import { CommandDeps } from './deps';

/** 设置与偏好类命令 */
export function settingsCommands(deps: CommandDeps): CommandItem[] {
  const { onOpenSettings } = deps;
  return [
    {
      id: 'settings.open',
      group: 'settings',
      title: '打开偏好设置中心',
      keywords: ['settings', 'config', 'sz', 'shezhi'],
      shortcut: '⌘,',
      run: () => onOpenSettings('blog'),
    },
    {
      id: 'settings.blog',
      group: 'settings',
      title: '博客与路径设置',
      keywords: ['blog', 'hexo_dir', 'boke', 'lujing'],
      run: () => onOpenSettings('blog'),
    },
    {
      id: 'settings.gallery',
      group: 'settings',
      title: '图库与尺寸过滤设置',
      keywords: ['gallery', 'tuku', 'size', 'chicun'],
      run: () => onOpenSettings('gallery'),
    },
    {
      id: 'settings.generators',
      group: 'settings',
      title: '生成器默认值设置 (GitHub / Socialify)',
      keywords: ['socialify', 'github', 'kapian', 'kp', 'shengcheng', 'generator'],
      run: () => onOpenSettings('gallery'),
    },
    {
      id: 'settings.network',
      group: 'settings',
      title: '网络代理与部署模式设置',
      keywords: ['network', 'proxy', 'daili', 'dl', 'wangluo'],
      run: () => onOpenSettings('network'),
    },
    {
      id: 'settings.doctor',
      group: 'settings',
      title: '系统健康体检与自检诊断',
      keywords: ['doctor', 'zhenduan', 'tijian', 'zd', 'jiankang'],
      run: () => onOpenSettings('doctor'),
    },
    {
      id: 'settings.about',
      group: 'settings',
      title: '关于 hpic 与软件版本升级',
      keywords: ['about', 'guanyu', 'banben', 'update', 'gy'],
      run: () => onOpenSettings('about'),
    },
  ];
}
