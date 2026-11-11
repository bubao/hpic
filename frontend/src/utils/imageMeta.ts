/**
 * 图像元数据推导与格式化工具函数
 * 确保所有网络图片、本地图片与 SVG 资源渲染后，均能精准展示文件名与物理分辨率
 */

/**
 * 判断图片链接是否为 SVG 格式
 * 覆盖常见 .svg 扩展名、data:image/svg+xml 以及 skillicons、carbon、ray.so 等 SVG 代码卡片生成器
 */
export function isSvgUrl(url?: string | null): boolean {
  if (!url) return false;
  const clean = url.trim().toLowerCase();
  if (!clean) return false;

  // Data URI：仅 SVG 类型按矢量处理
  if (clean.startsWith('data:')) {
    return clean.startsWith('data:image/svg+xml');
  }

  try {
    const parsed = new URL(clean, 'http://localhost');
    const host = parsed.hostname;
    // 仅按主机名识别代码卡片生成器，避免误伤 URL 参数里恰含关键字的位图
    const isSvgHost =
      /(^|\.)skillicons\.dev$/.test(host) ||
      /(^|\.)carbon\.now\.sh$/.test(host) ||
      /(^|\.)ray\.so$/.test(host) ||
      /(^|\.)img\.shields\.io$/.test(host) ||
      /(^|\.)api\.dicebear\.com$/.test(host) ||
      /(^|\.)github-readme-stats\.vercel\.app$/.test(host);
    return isSvgHost || clean.includes('.svg');
  } catch {
    return clean.includes('.svg');
  }
}

/**
 * 从任意 URL、Data URI 或图床链接中提取直观的文件名
 */
export function extractImageFilename(url: string, fallbackTitle = ''): string {
  const clean = (url || '').trim();
  if (!clean) return '';

  // 1. Data URI 特殊处理 (海报 SVG 等)
  if (clean.startsWith('data:image/svg+xml')) return 'poster-cover.svg';
  if (clean.startsWith('data:image/png')) return 'poster-cover.png';
  if (clean.startsWith('data:image/webp')) return 'poster-cover.webp';
  if (clean.startsWith('data:image/jpeg') || clean.startsWith('data:image/jpg')) return 'poster-cover.jpg';

  // 2. Socialify 生成器
  if (clean.includes('socialify.git.ci')) {
    const m = clean.match(/socialify\.git\.ci\/([^/]+)\/([^/]+)/);
    if (m) return `${m[1]}-${m[2]}-socialify.png`;
    return 'socialify-card.png';
  }

  // 3. SkillIcons 生成器
  if (clean.includes('skillicons.dev')) {
    return 'skill-icons.svg';
  }

  // 3.1 新增免 Key 图源
  if (clean.includes('picsum.photos/seed/')) {
    const m = clean.match(/picsum\.photos\/seed\/([^/]+)\//);
    const seed = m ? decodeURIComponent(m[1]) : 'picsum';
    return `${seed}-picsum.jpg`;
  }
  if (clean.includes('loremflickr.com/')) {
    const m = clean.match(/loremflickr\.com\/(?:g\/)?\d+\/\d+\/([^/]+)/);
    const keyword = m ? decodeURIComponent(m[1]) : 'all';
    return `${keyword}-loremflickr.jpg`;
  }
  if (clean.includes('img.shields.io/badge/')) {
    return 'shields-badge.svg';
  }
  if (clean.includes('github-readme-stats.vercel.app')) {
    return 'github-stats-card.svg';
  }
  if (clean.includes('quickchart.io/chart')) {
    return 'quickchart.png';
  }
  if (clean.includes('placehold.co/')) {
    return 'placeholder.png';
  }
  if (clean.includes('api.qrserver.com/')) {
    return 'qrcode.png';
  }
  if (clean.includes('api.dicebear.com/')) {
    return 'dicebear-avatar.svg';
  }
  if (clean.includes('image.pollinations.ai/')) {
    return 'pollinations-cover.png';
  }

  // 4. 解析标准 URL
  try {
    const parsed = new URL(clean, 'http://localhost');
    const pathname = parsed.pathname;

    // A. Unsplash 图片 (格式形如 /photo-1506744038136-xxx)
    if (parsed.hostname.includes('unsplash.com')) {
      const parts = pathname.split('/').filter(Boolean);
      const lastPart = parts[parts.length - 1] || 'unsplash-photo';
      const cleanID = lastPart.split('?')[0];
      return `${cleanID}.jpg`;
    }

    // B. Wallhaven 图片 (形如 /wallhaven-g7lzv7.jpg)
    if (parsed.hostname.includes('wallhaven.cc')) {
      const parts = pathname.split('/').filter(Boolean);
      const lastPart = parts[parts.length - 1];
      if (lastPart) return lastPart;
    }

    // C. 本地静态文件或普通网络路径
    const lastSlash = pathname.lastIndexOf('/');
    if (lastSlash !== -1) {
      const filename = pathname.substring(lastSlash + 1).split('?')[0];
      if (filename && filename.includes('.')) {
        return decodeURIComponent(filename);
      } else if (filename) {
        return `${decodeURIComponent(filename)}.jpg`;
      }
    }
  } catch {}

  // 5. 兜底策略
  if (fallbackTitle) {
    const safeTitle = fallbackTitle.replace(/[\\/:*?"<>|]/g, '-').trim();
    if (safeTitle) return `${safeTitle}.jpg`;
  }

  return 'image.jpg';
}

/**
 * 根据物理分辨率计算常见的摄影/显示比例字符串 (如 16:9, 21:9, 4:3, 1:1, 9:16)
 */
export function getImageAspectRatio(width: number, height: number): string {
  if (!width || !height || width <= 0 || height <= 0) return '';
  const ratio = width / height;

  if (Math.abs(ratio - 16 / 9) < 0.05) return '16:9';
  if (Math.abs(ratio - 21 / 9) < 0.08 || Math.abs(ratio - 2.39) < 0.08) return '21:9';
  if (Math.abs(ratio - 16 / 10) < 0.05 || Math.abs(ratio - 8 / 5) < 0.05) return '16:10';
  if (Math.abs(ratio - 4 / 3) < 0.05) return '4:3';
  if (Math.abs(ratio - 1) < 0.05) return '1:1';
  if (Math.abs(ratio - 9 / 16) < 0.05) return '9:16';
  if (Math.abs(ratio - 3 / 2) < 0.05) return '3:2';

  return ratio > 1.2 ? '横屏' : ratio < 0.85 ? '竖屏' : '方形';
}

/**
 * 根据物理分辨率判断清晰度等级 (4K, 2K, 1080P, HD)
 */
export function getImageQualityBadge(width: number, height: number): string {
  if (!width || !height || width <= 0 || height <= 0) return '';
  const maxDim = Math.max(width, height);
  const minDim = Math.min(width, height);

  if (maxDim >= 3840 || minDim >= 2160) return '4K';
  if (maxDim >= 2560 || minDim >= 1440) return '2K';
  if (maxDim >= 1920 || minDim >= 1080) return '1080P';
  if (maxDim >= 1280 || minDim >= 720) return 'HD';
  return '';
}

/**
 * 从 URL 参数或显式宽高推导大图真实物理分辨率
 */
export function extractTargetDimensions(
  url?: string,
  explicitWidth?: number,
  explicitHeight?: number
): { width: number; height: number; quality?: string } | null {
  let w = explicitWidth || 0;
  let h = explicitHeight || 0;

  if ((!w || !h) && url) {
    try {
      const parsed = new URL(url, 'http://localhost');
      const wQuery = parsed.searchParams.get('w') || parsed.searchParams.get('width');
      const hQuery = parsed.searchParams.get('h') || parsed.searchParams.get('height');
      if (wQuery) w = parseInt(wQuery, 10);
      if (hQuery) h = parseInt(hQuery, 10);
    } catch {
      // ignore
    }
  }

  if (isNaN(w) || isNaN(h) || w <= 0 || h <= 0) return null;

  const quality = getImageQualityBadge(w, h);
  return { width: w, height: h, quality };
}
