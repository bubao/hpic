import type { ComponentType } from 'react';
import { GitBranch, Code2, Layers, Image as ImageIcon, Globe, Badge, BarChart3, LineChart, Square, QrCode, Smile, Sparkles } from 'lucide-react';
import { PostInfo } from '../../types';
import { PosterGenerator } from './PosterGenerator';
import { SocialifyGenerator } from './SocialifyGenerator';
import { SkillIconsGenerator } from './SkillIconsGenerator';
import { createUrlBuilderGenerator } from './UrlBuilderGenerator';
import { OpenGraphGenerator } from './OpenGraphGenerator';
import {
  PICSMUM_CONFIG,
  LOREMFLICKR_CONFIG,
  SHIELDS_CONFIG,
  GITHUB_STATS_CONFIG,
  QUICKCHART_CONFIG,
  PLACEHOLDER_CONFIG,
  QR_CONFIG,
  DICEBEAR_CONFIG,
  POLLINATIONS_CONFIG,
} from './configs';

/** 生成器统一 Props 契约（各子生成器为其子集） */
export interface GeneratorProps {
  post: PostInfo;
  coverFields: string[];
  defaultOwner: string;
  defaultPattern?: string;
  defaultTheme?: string;
  onApplyImage: (url: string, fields: string[]) => void;
  onOpenLightbox: (url: string, title: string) => void;
}

export interface GeneratorDescriptor {
  key: string;
  label: string;
  title: string;
  icon: typeof GitBranch;
  Component: ComponentType<GeneratorProps>;
}

/**
 * 动态封面生成器注册表（Generators.tsx A8 提取）。
 * 新增生成器：在此登记 descriptor 即可，无需改动切换与渲染逻辑。
 * 免 Key 的 URL 拼装类来源统一走 createUrlBuilderGenerator + configs.ts。
 */
export const GENERATOR_REGISTRY: GeneratorDescriptor[] = [
  {
    key: 'socialify',
    label: 'Socialify 开源卡片',
    title: '渲染 GitHub 仓库精美 Star 卡片',
    icon: GitBranch,
    Component: SocialifyGenerator,
  },
  {
    key: 'skillicons',
    label: 'SkillIcons 技术栈',
    title: '组合渲染技术栈徽章',
    icon: Code2,
    Component: SkillIconsGenerator,
  },
  {
    key: 'poster',
    label: '极客海报 (Poster)',
    title: '自动从博文标题、标签和分类渲染 SVG 海报',
    icon: Layers,
    Component: PosterGenerator,
  },
  {
    key: 'opengraph',
    label: 'OpenGraph 网页封面',
    title: '抓取任意网页的 og:image 作为封面',
    icon: Globe,
    Component: OpenGraphGenerator,
  },
  {
    key: 'picsum',
    label: 'Lorem Picsum 随机',
    title: '基于种子生成确定性随机摄影图',
    icon: ImageIcon,
    Component: createUrlBuilderGenerator(PICSMUM_CONFIG),
  },
  {
    key: 'loremflickr',
    label: 'LoremFlickr 关键词',
    title: '按关键词从 Flickr 抓取真实图片',
    icon: ImageIcon,
    Component: createUrlBuilderGenerator(LOREMFLICKR_CONFIG),
  },
  {
    key: 'shields',
    label: 'Shields 徽章',
    title: '生成徽章 / 状态图',
    icon: Badge,
    Component: createUrlBuilderGenerator(SHIELDS_CONFIG),
  },
  {
    key: 'github-stats',
    label: 'GitHub 统计卡',
    title: '根据用户名生成 GitHub 统计卡片',
    icon: BarChart3,
    Component: createUrlBuilderGenerator(GITHUB_STATS_CONFIG),
  },
  {
    key: 'quickchart',
    label: 'QuickChart 图表',
    title: '用 Chart.js 配置生成图表',
    icon: LineChart,
    Component: createUrlBuilderGenerator(QUICKCHART_CONFIG),
  },
  {
    key: 'placeholder',
    label: '占位图',
    title: '按尺寸 / 颜色 / 文字生成占位图',
    icon: Square,
    Component: createUrlBuilderGenerator(PLACEHOLDER_CONFIG),
  },
  {
    key: 'qr',
    label: '二维码',
    title: '把文本 / 链接生成二维码图片',
    icon: QrCode,
    Component: createUrlBuilderGenerator(QR_CONFIG),
  },
  {
    key: 'dicebear',
    label: 'DiceBear 头像',
    title: '根据种子生成矢量头像',
    icon: Smile,
    Component: createUrlBuilderGenerator(DICEBEAR_CONFIG),
  },
  {
    key: 'pollinations',
    label: 'AI 文生图',
    title: '输入提示词由 AI 实时生成封面',
    icon: Sparkles,
    Component: createUrlBuilderGenerator(POLLINATIONS_CONFIG),
  },
];

export const DEFAULT_GENERATOR_KEY = 'socialify';
