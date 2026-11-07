import { useEffect, useRef } from 'react';

interface UseKeyboardShortcutsOptions {
  canUndo: boolean;
  selectedPostPath?: string;
  onToggleCommandPalette: () => void;
  onUndo: (filePath: string) => void;
}

/**
 * 全局快捷键（App.tsx A4 提取）：⌘K 开合命令面板、⌘Z 撤销上一变动。
 * onUndo 通过 ref 保存最新闭包，避免监听器捕获过期函数。
 */
export function useKeyboardShortcuts({
  canUndo,
  selectedPostPath,
  onToggleCommandPalette,
  onUndo,
}: UseKeyboardShortcutsOptions) {
  // 通过 ref 获取最新的 onUndo，总是操作当前选中文件
  const onUndoRef = useRef(onUndo);
  useEffect(() => {
    onUndoRef.current = onUndo;
  }, [onUndo]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onToggleCommandPalette();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        const isInputFocused = ['INPUT', 'TEXTAREA'].includes((document.activeElement?.tagName || ''));
        if (!isInputFocused && canUndo && selectedPostPath) {
          e.preventDefault();
          onUndoRef.current(selectedPostPath);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canUndo, selectedPostPath, onToggleCommandPalette]);
}
