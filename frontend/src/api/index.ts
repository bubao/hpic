/**
 * API 层统一出口（原 api.ts 按域拆分后的入口）。
 *
 * - 传输层与版本裂隙防护：`./http`
 * - 业务域模块：`./config` / `./posts` / `./gallery` / `./favorites` /
 *   `./hexo` / `./system` / `./version` / `./i18n` / `./theme`
 *
 * 对外契约保持不变：调用方继续使用 `api.xxx`，纯函数（版本工具）继续具名导出。
 */
import { apiFetch } from './http';
import { getConfig, saveConfig, checkLegacyConfig, migrateLegacyConfig, testProxy } from './config';
import {
  getPosts,
  getPostsStatus,
  getPost,
  createPost,
  updatePost,
  insertPostImage,
  undoPostOperation,
  getPostHistory,
  deletePostHistory,
  clearPostHistory,
  checkHealth,
  checkHealthStream,
} from './posts';
import {
  searchPhotos,
  fetchImageText,
  checkImageHealth,
  fetchGalleryProviders,
  searchGalleryProvider,
} from './gallery';
import { getFavorites, addFavorite, removeFavorite, updateFavoriteTags } from './favorites';
import {
  getHexoStatus,
  startHexoServer,
  stopHexoServer,
  runHexoGenerate,
  runHexoClean,
  getGitStatus,
  runHexoDeploy,
} from './hexo';
import { selectDirectory, getDoctorReport, exportDoctorReport } from './system';
import { checkVersion, upgradeVersion, installVersion, restartVersion, getChangelog } from './version';
import { getI18nLocales, getI18nBundle, saveI18nCustom, resetI18nCustom, openI18nFolder } from './i18n';
import { getThemePresets, openThemeFolder } from './theme';
import {
  normalizeVersion,
  isVersionMismatch,
  notifyVersionMismatch,
  onVersionMismatch,
  resetVersionMismatchState,
  checkResponseVersion,
} from './http';

// 版本契约工具继续从入口具名导出，保持既有 import 语句不变
export {
  apiFetch,
  normalizeVersion,
  isVersionMismatch,
  notifyVersionMismatch,
  onVersionMismatch,
  resetVersionMismatchState,
  checkResponseVersion,
};
export type { VersionMismatchCallback, HpicFetchOptions } from './http';

export const api = {
  // 版本契约与裂隙防护监听
  onVersionMismatch,
  normalizeVersion,
  isVersionMismatch,
  notifyVersionMismatch,
  resetVersionMismatchState,
  checkResponseVersion,

  // 配置
  getConfig,
  saveConfig,
  checkLegacyConfig,
  migrateLegacyConfig,
  testProxy,

  // 文章
  getPosts,
  getPostsStatus,
  getPost,
  createPost,
  updatePost,
  insertPostImage,
  undoPostOperation,
  getPostHistory,
  deletePostHistory,
  clearPostHistory,

  // 封面健康检查 (404 检测)
  checkHealth,
  checkHealthStream,

  // 图片搜索与单图预检（searchPhotos 兼容旧端点；注册表端点供新来源动态接入）
  searchPhotos,
  fetchGalleryProviders,
  searchGalleryProvider,
  fetchImageText,
  checkImageHealth,

  // 收藏夹
  getFavorites,
  addFavorite,
  removeFavorite,
  updateFavoriteTags,

  // Hexo 操作
  getHexoStatus,
  startHexoServer,
  stopHexoServer,
  runHexoGenerate,
  runHexoClean,
  getGitStatus,
  runHexoDeploy,

  // 系统打开外部链接 (通过后端调用操作系统默认浏览器，或前端降级处理)
  // 非 fetch 类方法（window.open）按约定保留在入口文件
  openSystemURL: (url: string) => {
    let target = (url || '').trim();
    if (!target) return;

    if (target.startsWith('/')) {
      target = window.location.origin + target;
    }

    if (target.startsWith('data:image')) {
      const win = window.open('');
      if (win) {
        win.document.write(`<body style="margin:0;background:#0d1117;display:flex;align-items:center;justify-content:center;min-height:100vh;"><img src="${target}" style="max-width:95vw;max-height:95vh;object-fit:contain;box-shadow:0 8px 24px rgba(0,0,0,0.5);border-radius:8px;" /></body>`);
      }
      return;
    }

    apiFetch('/api/system/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: target }),
    }).catch(() => {
      window.open(target, '_blank');
    });
  },

  // 版本检测与在线升级
  checkVersion,
  upgradeVersion,
  installVersion,
  restartVersion,
  getChangelog,

  // Doctor 只读自检诊断
  getDoctorReport,
  exportDoctorReport,

  // 原生目录选择
  selectDirectory,

  // 语言与国际化动态扩展
  getI18nLocales,
  getI18nBundle,
  saveI18nCustom,
  resetI18nCustom,
  openI18nFolder,

  // 外观预设（内置 + 用户自定义主题目录）
  getThemePresets,
  openThemeFolder,
};
