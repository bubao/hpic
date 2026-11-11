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

/**
 * 配置字段默认值（单一真相源）。
 * 新增字段时只需在此登记默认值，设置面板 / 差分保存均可自动派生，
 * 配合 createDefaultConfig() 可得到隔离的独立副本。
 */
export const DEFAULT_CONFIG: Config = {
  hexo_dir: '',
  posts_dir: '',
  drafts_dir: '',
  cover_fields: ['index_img', 'banner_img'],
  date_field: 'date',
  updated_field: 'updated',
  orientation: 'landscape',
  image_size: 'large',
  min_width: 1200,
  min_height: 600,
  image_width: 1200,
  image_quality: 80,
  github_owner: '',
  socialify_pattern: 'Signal',
  socialify_theme: 'Dark',
  proxy: '',
  deploy_mode: 'git',
  git_commit_template: 'chore(cover): update cover for {title}',
  auto_search: false,
  infinite_scroll: false,
  theme: 'dark',
  custom_css: '',
};

/** 默认配置工厂：返回深隔离副本（数组字段独立拷贝，调用方可安全变更） */
export function createDefaultConfig(): Config {
  return {
    ...DEFAULT_CONFIG,
    cover_fields: [...DEFAULT_CONFIG.cover_fields],
  };
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
  batch_id?: number;
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
  parsed_date?: string;
  updated: string;
  parsed_update?: string;
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
  color?: string;
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

/**
 * 封面图片来源元数据（CoverProvider 注册表 wire 契约镜像）。
 * kind: search = 关键词检索来源；generator = 参数化生成来源。
 */
export interface GalleryProvider {
  id: string;
  display_name: string;
  kind: string;
}

/** 跨来源统一候选封面图（CoverCandidate wire 契约镜像） */
export interface CoverCandidate {
  url: string;
  thumbnail: string;
  width: number;
  height: number;
  author: string;
  source_id: string;
  meta?: Record<string, unknown>;
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
  url?: string;
  server_pid?: number;
  pid?: number;
  uptime_seconds: number;
  generate_running: boolean;
  generate_watch: boolean;
  has_hexo?: boolean;
  hexo_root: string;
  hexo_bin: string;
  posts_dir: string;
  recent_logs?: string[];
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
  /** 连接层失败（断网/超时/DNS），非确证失效，不应被当作永久破图。 */
  network_error?: boolean;
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
	binary_download_url?: string;
	binary_asset_file_name?: string;
	platform: string;
	install_pending_restart?: boolean;  // 已安装新版但需重启当前进程才能生效
}

// Doctor 只读自检诊断（Report/Probe 与后端 wire 契约镜像一致）
export type DoctorStatus = 'ok' | 'warn' | 'error' | 'info';

export interface DoctorProbe {
  id: string;
  name: string;
  category: 'app' | 'environment' | 'config' | 'storage' | 'network';
  status: DoctorStatus;
  message: string;
  fix?: string;
  duration?: string;
  details?: Record<string, unknown>;
}

export interface DoctorSummary {
  total: number;
  ok: number;
  warn: number;
  error: number;
  info: number;
}

export interface DoctorReport {
  version: string;
  platform: string;
  go_version: string;
  overall: DoctorStatus;
  summary: DoctorSummary;
  probes: DoctorProbe[];
  generated_at: string;
}

export interface DoctorExportBundle {
  schema_version: number;
  exporter: string;
  exporter_version: string;
  exported_at: string;
  report: DoctorReport;
}

// ------------------------------------------------------------------
// ⌘K 命令面板（条目模型；索引/匹配/频次排序由 utils/commandMatcher 提供）
// ------------------------------------------------------------------

/** 命令分组定义（顺序即展示顺序） */
export interface CommandGroup {
  id: string;
  label: string;
  order?: number;
}

/** 单个可执行命令；run 由应用装配层注入 */
export interface CommandItem {
  id: string;
  /** 分组 id，对应 CommandGroup.id */
  group: string;
  title: string;
  /** 中文 / 英文 / 拼音别名（全拼或首字母），用于模糊检索 */
  keywords?: string[];
  /** 展示用快捷键提示，例如 ⌘K、⌘Z */
  shortcut?: string;
  /** 同组内排序（越小越靠前，为空时按标题） */
  order?: number;
  /** 是否可出现在面板中（默认 true；禁用命令直接隐藏） */
  enabled?: boolean;
  /** 执行回调（由应用装配层注入，面板只负责调度与埋点） */
  run: () => void;
}

/** 单条命令的累计使用记录 */
export interface CommandUsageEntry {
  count: number;
  /** 最后一次使用的时间戳（epoch ms），用于衰减 */
  last_used: number;
}

// ------------------------------------------------------------------
// 语言与国际化扩展模型 (i18n)
// ------------------------------------------------------------------

export interface LocaleMeta {
  code: string;
  name: string;
  is_builtin: boolean;
  has_override: boolean;
}

export interface LocalesListResponse {
  locales: LocaleMeta[];
  locales_dir: string;
}

/** 外观预设（内置或用户放置于 ~/.config/hpic/themes/*.json 的自定义皮肤） */
export interface ThemePreset {
  id: string;
  name: string;
  desc?: string;
  theme: 'dark' | 'light' | 'auto';
  css: string;
  is_builtin: boolean;
  has_override?: boolean;
}

export interface ThemePresetsResponse {
  presets: ThemePreset[];
  themes_dir: string;
}


export type UsageStats = Record<string, CommandUsageEntry>;

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
