import { Camera, Monitor, Globe, Landmark } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * 图库来源 Tab 图标注册表。
 * 新增来源时在此登记图标；未登记的来源回退到 Globe。
 */
const PROVIDER_ICONS: Record<string, LucideIcon> = {
  unsplash: Camera,
  wallhaven: Monitor,
  openverse: Globe,
  commons: Landmark,
};

export const DEFAULT_PROVIDER_ICON: LucideIcon = Globe;

export function getGalleryProviderIcon(id: string): LucideIcon {
  return PROVIDER_ICONS[id] ?? DEFAULT_PROVIDER_ICON;
}
