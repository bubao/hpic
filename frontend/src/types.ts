declare const __APP_VERSION__: string | undefined;
export const DEFAULT_APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.2';

export interface Config {
  config_file_path?: string;
  version?: string;
  app?: string;
  hexo_dir?: string;
  posts_dir: string;
  drafts_dir?: string;
  proxy: string;
  image_width: number;
  image_quality: number;
  auto_search: boolean;
  infinite_scroll: boolean;
  cover_fields: string[];
  date_field?: string;
  updated_field?: string;
  github_owner: string;
  socialify_pattern: string;
  socialify_theme: string;
  orientation: string;
  image_size: string;
  min_width: number;
  min_height: number;
  deploy_mode?: 'git' | 'hexo';
  git_commit_template?: string;
  theme?: 'dark' | 'light' | 'auto';
  custom_css?: string;
}

export type GeneratePhase = 'idle' | 'stopping_server' | 'generating' | 'restarting_server';

export interface LegacyCheckResult {
  has_legacy: boolean;
  legacy_files: string[];
  target_dir: string;
  target_config: string;
  already_migrated: boolean;
}

export interface SelectDirectoryResult {
  success: boolean;
  canceled?: boolean;
  path?: string;
  is_hexo_root?: boolean;
  error?: string;
}

export interface GitFileStatus {
  status: string;
  path: string;
}

export interface OperationRecord {
  id: number;
  file_path: string;
  post_title: string;
  operation_type: 'update_cover' | 'clear_cover' | 'insert_image';
  field?: string;
  old_value?: string;
  new_value?: string;
  created_at: string;
  is_undone: boolean;
}

export interface PostInfo {
  file_path: string;
  file_name: string;
  title: string;
  date: string;
  updated: string;
  categories: string;
  tags: string;
  images: Record<string, string>;
  index_img?: string;
  banner_img?: string;
  has_all_images: boolean;
  status: 'complete' | 'partial' | 'missing';
  is_draft?: boolean;
  mod_time: string;
}

export interface PhotoURLs {
  raw: string;
  full: string;
  regular: string;
  small: string;
  thumb: string;
}

export interface Photo {
  id: string;
  width?: number;
  height?: number;
  description?: string;
  alt_description?: string;
  urls: PhotoURLs;
  user?: {
    name: string;
    username: string;
    link: string;
  };
  source: string;
}

export interface FavoriteItem {
  id: string;
  url: string;
  thumb_url: string;
  title: string;
  source: string;
  tags: string[];
  created_at: string;
}

export interface TagStat {
  name: string;
  count: number;
}

export interface HexoEnvironment {
  node_path: string;
  npx_path: string;
  hexo_bin: string;
  hexo_root: string;
  has_hexo: boolean;
  path_dirs: string[];
}

export interface HexoStatus {
  running?: boolean;
  server_running?: boolean;
  port: number;
  server_pid?: number;
  pid?: number;
  uptime_seconds: number;
  generate_running: boolean;
  generate_watch: boolean;
  hexo_root: string;
  hexo_bin: string;
  posts_dir: string;
  recent_logs?: string[];
  logs?: string[];
  env?: HexoEnvironment;
}

export interface BrokenReport {
  post_title: string;
  file_path: string;
  file_name: string;
  field: string;
  url: string;
  status_code: number;
  error: string;
}

export interface ImageCheckResult {
  url: string;
  ok: boolean;
  status_code: number;
  need_proxy: boolean;
  is_broken: boolean;
  error?: string;
}

export interface HealthCheckResult {
  total_posts: number;
  total_images: number;
  healthy_images: number;
  broken_count: number;
  broken_reports: BrokenReport[];
  duration: string;
}

export interface HealthProgressEvent {
  type: 'start' | 'progress' | 'done' | 'error';
  total_posts: number;
  total_images: number;
  scanned_images: number;
  healthy_images: number;
  broken_count: number;
  current_url?: string;
  last_report?: BrokenReport;
  broken_reports?: BrokenReport[];
  duration?: string;
  error?: string;
}

export interface VersionInfo {
  current_version: string;
  latest_version: string;
  has_update: boolean;
  no_release?: boolean;
  repo?: string;
  release_name: string;
  release_notes: string;
  published_at: string;
  release_url: string;
  download_url: string;
  asset_file_name: string;
  platform: string;
}

// 提取图片的物理唯一主键（剔除裁剪尺寸、格式、质量等可变参数，杜绝重复收藏与匹配偏差）
export function getCanonicalImageKey(url?: string): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (trimmed.startsWith('data:image')) {
    return trimmed;
  }
  // 1. Unsplash
  const unsplashMatch = trimmed.match(/https?:\/\/[a-zA-Z0-9.\-_]*unsplash\.com\/([a-zA-Z0-9\-_]+)/i);
  if (unsplashMatch && unsplashMatch[1]) {
    return `unsplash::${unsplashMatch[1]}`;
  }
  // 2. Wallhaven
  const wallhavenMatch = trimmed.match(/(wallhaven-[a-zA-Z0-9]+)/i);
  if (wallhavenMatch && wallhavenMatch[1]) {
    return `wallhaven::${wallhavenMatch[1]}`;
  }
  // 3. 通用网络图片，去除可变 query 参数
  try {
    const u = new URL(trimmed);
    return `${u.host}${u.pathname.replace(/\/+$/, '')}`.toLowerCase();
  } catch {
    return trimmed.toLowerCase();
  }
}
