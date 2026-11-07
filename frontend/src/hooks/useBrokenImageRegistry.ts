import { useCallback, useState } from 'react';
import { BrokenReport } from '../types';

/**
 * 死链（404 失效封面）登记（App.tsx A3 提取）：
 * 实时探测命中的失效 URL 集合 + 注入博文体检报告的全局状态。
 */
export function useBrokenImageRegistry() {
  const [brokenReports, setBrokenReports] = useState<BrokenReport[]>([]);
  // 经实时探测确认已失效的原图 URL 集合
  const [brokenUrls, setBrokenUrls] = useState<Set<string>>(new Set());

  // 登记原图失效并同步注入博文体检报告与全局状态
  const handleMarkBroken = useCallback((brokenUrl: string, filePath?: string, field?: string, postTitle?: string) => {
    if (!brokenUrl) return;

    setBrokenUrls(prev => {
      if (prev.has(brokenUrl)) return prev;
      const next = new Set(prev);
      next.add(brokenUrl);
      return next;
    });

    setBrokenReports(prev => {
      const newReports = [...prev];
      if (filePath && field) {
        const exist = newReports.some(r => r.file_path === filePath && r.field === field);
        if (!exist) {
          newReports.push({
            file_path: filePath,
            file_name: filePath.split('/').pop() || '未命名文章',
            post_title: postTitle || '未命名文章',
            field: field,
            url: brokenUrl,
            status_code: 404,
            error: '图片资源失效 (404 Not Found)',
          });
        }
      }
      return newReports;
    });
  }, []);

  return {
    brokenReports,
    setBrokenReports,
    brokenUrls,
    setBrokenUrls,
    handleMarkBroken,
  };
}
