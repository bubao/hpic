import { HexoStatus, PostInfo } from '../types';
import { AppTheme } from '../utils/useTheme';
import { SettingsCategory } from '../components/SettingsModal';

/**
 * 命令面板依赖注入（App.tsx → commands/ 注册表）。
 * 各命令模块只消费动作回调与状态快照，不反向依赖 App。
 */
export interface CommandDeps {
  canUndo: boolean;
  selectedPost: PostInfo | null;
  hexoStatus: HexoStatus | null;
  onRefreshPosts: () => void;
  onCreatePost: () => void;
  onUndoSelectedPost: () => void;
  onOpenHistory: () => void;
  onOpenGlobalHistory: () => void;
  onOpenManualUrl: () => void;
  onClearAll: () => void;
  onToggleServer: () => void;
  onPreview: () => void;
  onGenerate: () => void;
  onClean: () => void;
  onOpenDeploy: () => void;
  onOpenLogs: () => void;
  onSelectTheme: (theme: AppTheme) => void;
  onToggleTheme: () => void;
  onOpenSettings: (category: SettingsCategory) => void;
  onOpenHealth: () => void;
  onOpenUpdate: () => void;
  onScrollToTop: () => void;
}
