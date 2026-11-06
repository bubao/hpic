import React from 'react';
import {
  History,
  RotateCcw,
  Clock,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Layers,
  Trash2,
  Check,
  FileText,
  Calendar,
  Folder,
  Image,
  Search,
  X,
  RotateCw,
  FilePlus,
  ExternalLink,
  Copy,
  AlertTriangle,
  Star,
  Loader2,
  Play,
  Square,
  Zap,
  Send,
  Activity,
  Terminal,
  Settings,
  Sparkles,
  ArrowUpCircle,
  Moon,
  Sun,
  Laptop,
  Command,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Eye,
  Grid,
  List,
  SlidersHorizontal,
  Languages,
  Download,
  Upload,
  Edit3,
  Maximize2,
  Minimize2,
  LucideIcon,
} from 'lucide-react';

export const ICON_MAP = {
  history: History,
  undo: RotateCcw,
  clock: Clock,
  arrowRight: ArrowRight,
  checkCircle: CheckCircle2,
  alertCircle: AlertCircle,
  refresh: RefreshCw,
  rotate: RotateCw,
  layers: Layers,
  trash: Trash2,
  check: Check,
  fileText: FileText,
  calendar: Calendar,
  folder: Folder,
  image: Image,
  search: Search,
  close: X,
  filePlus: FilePlus,
  external: ExternalLink,
  copy: Copy,
  warning: AlertTriangle,
  star: Star,
  loading: Loader2,
  play: Play,
  stop: Square,
  zap: Zap,
  send: Send,
  activity: Activity,
  terminal: Terminal,
  settings: Settings,
  sparkles: Sparkles,
  arrowUpCircle: ArrowUpCircle,
  moon: Moon,
  sun: Sun,
  laptop: Laptop,
  command: Command,
  chevronDown: ChevronDown,
  chevronUp: ChevronUp,
  chevronRight: ChevronRight,
  eye: Eye,
  grid: Grid,
  list: List,
  filter: SlidersHorizontal,
  languages: Languages,
  download: Download,
  upload: Upload,
  edit: Edit3,
  maximize: Maximize2,
  minimize: Minimize2,
} as const;

export type IconName = keyof typeof ICON_MAP;

export type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number;
export type IconVariant = 'default' | 'primary' | 'muted' | 'success' | 'warning' | 'danger' | 'current';
export type IconAnimation = 'none' | 'spin' | 'pulse' | 'hover-scale';

const SIZE_MAP: Record<'xs' | 'sm' | 'md' | 'lg' | 'xl', number> = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 24,
};

const VARIANT_COLOR_MAP: Record<IconVariant, string | undefined> = {
  default: undefined,
  primary: 'var(--accent-color, #6366f1)',
  muted: 'var(--text-muted, #94a3b8)',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  current: 'currentColor',
};

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  name?: IconName;
  icon?: LucideIcon;
  size?: IconSize;
  variant?: IconVariant;
  animation?: IconAnimation;
  strokeWidth?: number;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}

export const Icon: React.FC<IconProps> = ({
  name,
  icon: DirectIcon,
  size = 'md',
  variant = 'default',
  animation = 'none',
  strokeWidth = 1.8,
  className = '',
  style,
  title,
  ...rest
}) => {
  const Component = DirectIcon || (name ? ICON_MAP[name] : null);
  if (!Component) {
    return null;
  }

  const numericSize = typeof size === 'number' ? size : SIZE_MAP[size] || 16;
  const variantColor = VARIANT_COLOR_MAP[variant];

  const animationClass =
    animation === 'spin'
      ? 'icon-spin'
      : animation === 'pulse'
      ? 'icon-pulse'
      : animation === 'hover-scale'
      ? 'icon-hover-scale'
      : '';

  const combinedClassName = `app-icon app-icon-${name || 'custom'} ${animationClass} ${className}`.trim();

  return (
    <Component
      size={numericSize}
      strokeWidth={strokeWidth}
      color={variantColor}
      className={combinedClassName}
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        flexShrink: 0,
        ...style,
      }}
      aria-label={title}
      {...(rest as any)}
    />
  );
};
