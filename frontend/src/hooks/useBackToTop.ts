import { useCallback, useState } from 'react';
import type { RefObject } from 'react';

/** 回到顶部按钮显隐的滚动阈值（px） */
const BACK_TO_TOP_THRESHOLD = 260;

/**
 * 主内容区滚动与「回到顶部」按钮（App.tsx A5 提取）。
 */
export function useBackToTop(mainContentRef: RefObject<HTMLElement | null>) {
  const [showBackToTop, setShowBackToTop] = useState(false);

  const handleMainScroll = useCallback((e: React.UIEvent<HTMLElement>) => {
    setShowBackToTop(e.currentTarget.scrollTop > BACK_TO_TOP_THRESHOLD);
  }, []);

  const handleScrollToTop = useCallback(() => {
    mainContentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [mainContentRef]);

  return { showBackToTop, handleMainScroll, handleScrollToTop };
}
