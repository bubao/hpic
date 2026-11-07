import { CommandItem } from '../types';
import { CommandDeps } from './deps';

/** 文章操作类命令 */
export function postCommands(deps: CommandDeps): CommandItem[] {
  const { canUndo, selectedPost } = deps;
  return [
    {
      id: 'posts.refresh',
      group: 'posts',
      title: '刷新博文列表',
      keywords: ['shuaxin', 'refresh', 'sx', 'liebiao'],
      shortcut: 'R',
      run: () => deps.onRefreshPosts(),
    },
    {
      id: 'posts.create',
      group: 'posts',
      title: '新建文章草稿',
      keywords: ['xinjian', 'create', 'new', 'post', 'xj', 'wenzhang'],
      shortcut: 'N',
      run: () => deps.onCreatePost(),
    },
    {
      id: 'posts.undo',
      group: 'posts',
      title: '撤销上一步封面变更',
      keywords: ['chexiao', 'undo', 'cx'],
      shortcut: '⌘Z',
      enabled: canUndo && !!selectedPost,
      run: () => {
        if (selectedPost) deps.onUndoSelectedPost();
      },
    },
    {
      id: 'posts.history',
      group: 'posts',
      title: '查看当前文章封面变更历史',
      keywords: ['history', 'lishi', 'ls', 'shiguangji'],
      enabled: !!selectedPost,
      run: () => deps.onOpenHistory(),
    },
    {
      id: 'posts.manual_url',
      group: 'posts',
      title: '手动填入网络图片链接',
      keywords: ['url', 'shoutian', 'link', 'st', 'tupian'],
      enabled: !!selectedPost,
      run: () => deps.onOpenManualUrl(),
    },
    {
      id: 'posts.clear_cover',
      group: 'posts',
      title: '清空当前文章所有封面',
      keywords: ['clear', 'qingkong', 'qk', 'shanchufengmian'],
      enabled: !!selectedPost,
      run: () => deps.onClearAll(),
    },
  ];
}
