import type { ComponentType } from 'react';
import { GitBranch, Code2, Layers } from 'lucide-react';
import { PostInfo } from '../../types';
import { PosterGenerator } from './PosterGenerator';
import { SocialifyGenerator } from './SocialifyGenerator';
import { SkillIconsGenerator } from './SkillIconsGenerator';

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
];

export const DEFAULT_GENERATOR_KEY = 'socialify';
