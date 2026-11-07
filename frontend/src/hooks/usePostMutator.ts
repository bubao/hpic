import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { PostInfo } from '../types';

interface UsePostMutatorOptions {
  setSelectedPost: (post: PostInfo) => void;
  setPosts: Dispatch<SetStateAction<PostInfo[]>>;
  loadPostHistory: (filePath?: string) => void | Promise<void>;
}

/**
 * 博文本地状态单一同步入口（App.tsx A6 提取）：
 * 用服务端返回的最新 PostInfo 同步「选中项 + 列表 + 变更历史」。
 * 取代原先散落在 6 个 handler 中的 setSelectedPost + setPosts(map) + loadPostHistory 三连组合。
 */
export function usePostMutator({ setSelectedPost, setPosts, loadPostHistory }: UsePostMutatorOptions) {
  const applyLocalPost = useCallback((updated: PostInfo, filePath?: string) => {
    setSelectedPost(updated);
    setPosts(prev => prev.map(p => p.file_path === updated.file_path ? updated : p));
    loadPostHistory(filePath || updated.file_path);
  }, [setSelectedPost, setPosts, loadPostHistory]);

  return { applyLocalPost };
}
