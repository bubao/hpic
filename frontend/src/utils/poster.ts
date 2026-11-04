export interface PosterOptions {
  title: string;
  subtitle?: string;
  tags?: string[];
  date?: string;
  author?: string;
  theme: 'glass' | 'terminal' | 'cyberpunk' | 'minimal' | 'gradient';
  category?: string;
}

export function generatePosterSVG(opts: PosterOptions): string {
  const width = 1200;
  const height = 630; // 经典的 1.91:1 / ~16:9 横幅黄金比例

  const title = escapeXML(opts.title || 'Untitled Blog Post');
  const subtitle = escapeXML(opts.subtitle || '');
  const author = escapeXML(opts.author || 'Hexo Blog');
  const date = escapeXML(opts.date ? opts.date.substring(0, 10) : new Date().toISOString().substring(0, 10));
  const category = escapeXML(opts.category || 'Tech');
  const tags = (opts.tags || []).slice(0, 4).map(escapeXML);

  switch (opts.theme) {
    case 'terminal':
      return `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
          <defs>
            <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#090d16"/>
              <stop offset="100%" stop-color="#020408"/>
            </linearGradient>
          </defs>
          <rect width="100%" height="100%" fill="url(#bg)"/>
          <!-- 终端卡片窗口 -->
          <rect x="80" y="60" width="1040" height="510" rx="16" fill="#111827" stroke="rgba(255,255,255,0.12)" stroke-width="1.5"/>
          <!-- 标题栏按钮 -->
          <circle cx="115" cy="95" r="7" fill="#ef4444"/>
          <circle cx="138" cy="95" r="7" fill="#f59e0b"/>
          <circle cx="161" cy="95" r="7" fill="#10b981"/>
          <text x="560" y="100" fill="#6b7280" font-size="14" font-family="monospace" text-anchor="middle">bash - hexo ~/blog</text>

          <!-- 内容代码流 -->
          <text x="120" y="170" fill="#10b981" font-size="20" font-family="monospace">&gt; cat post-metadata.json</text>

          <!-- 主标题 -->
          <text x="120" y="270" fill="#f9fafb" font-size="44" font-weight="bold" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">
            ${title}
          </text>

          ${subtitle ? `<text x="120" y="340" fill="#9ca3af" font-size="24" font-family="-apple-system, sans-serif">${subtitle}</text>` : ''}

          <!-- 标签与作者栏 -->
          <g transform="translate(120, 480)">
            <text x="0" y="0" fill="#6366f1" font-size="18" font-family="monospace">
              #${category} ${tags.map(t => '#' + t).join(' ')}
            </text>
            <text x="880" y="0" fill="#6b7280" font-size="16" font-family="monospace" text-anchor="end">
              @${author} · ${date}
            </text>
          </g>
        </svg>
      `.trim();

    case 'cyberpunk':
      return `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
          <defs>
            <linearGradient id="cyberBg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#0a051b"/>
              <stop offset="100%" stop-color="#180b30"/>
            </linearGradient>
            <linearGradient id="neonText" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="#00f0ff"/>
              <stop offset="100%" stop-color="#ff007f"/>
            </linearGradient>
          </defs>
          <rect width="100%" height="100%" fill="url(#cyberBg)"/>
          <!-- 霓虹网格与背景线 -->
          <path d="M0 500 L1200 500 M0 550 L1200 550 M0 590 L1200 590" stroke="rgba(0,240,255,0.15)" stroke-width="1"/>
          <line x1="80" y1="80" x2="1120" y2="80" stroke="#00f0ff" stroke-width="3" stroke-dasharray="20 10"/>

          <rect x="80" y="110" width="100" height="30" rx="4" fill="rgba(0,240,255,0.15)" stroke="#00f0ff"/>
          <text x="130" y="131" fill="#00f0ff" font-size="14" font-weight="bold" font-family="monospace" text-anchor="middle">${category}</text>

          <text x="80" y="270" fill="url(#neonText)" font-size="48" font-weight="900" font-family="-apple-system, sans-serif">
            ${title}
          </text>
          ${subtitle ? `<text x="80" y="340" fill="#e2e8f0" font-size="22" font-family="-apple-system, sans-serif">${subtitle}</text>` : ''}

          <g transform="translate(80, 520)">
            <text x="0" y="0" fill="#f43f5e" font-size="18" font-weight="600" font-family="monospace">${tags.map(t => '/// ' + t).join(' ')}</text>
            <text x="1040" y="0" fill="#94a3b8" font-size="16" font-family="monospace" text-anchor="end">${author} · [${date}]</text>
          </g>
        </svg>
      `.trim();

    case 'minimal':
      return `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
          <rect width="100%" height="100%" fill="#18181b"/>
          <rect x="60" y="60" width="1080" height="510" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>

          <text x="120" y="140" fill="#71717a" font-size="14" font-weight="600" letter-spacing="4" font-family="-apple-system, sans-serif">
            ${category.toUpperCase()} / ARCHIVE
          </text>

          <text x="120" y="280" fill="#fafafa" font-size="50" font-weight="600" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">
            ${title}
          </text>
          ${subtitle ? `<text x="120" y="350" fill="#a1a1aa" font-size="24" font-family="-apple-system, sans-serif">${subtitle}</text>` : ''}

          <line x1="120" y1="440" x2="260" y2="440" stroke="#6366f1" stroke-width="2"/>

          <g transform="translate(120, 500)">
            <text x="0" y="0" fill="#71717a" font-size="16" font-family="-apple-system, sans-serif">${tags.map(t => '#' + t).join(' ')}</text>
            <text x="960" y="0" fill="#52525b" font-size="16" font-family="-apple-system, sans-serif" text-anchor="end">${author} — ${date}</text>
          </g>
        </svg>
      `.trim();

    case 'gradient':
      return `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
          <defs>
            <linearGradient id="mainGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#4f46e5"/>
              <stop offset="50%" stop-color="#7c3aed"/>
              <stop offset="100%" stop-color="#db2777"/>
            </linearGradient>
          </defs>
          <rect width="100%" height="100%" fill="url(#mainGrad)"/>
          <circle cx="1050" cy="120" r="220" fill="rgba(255,255,255,0.08)"/>
          <circle cx="150" cy="550" r="260" fill="rgba(0,0,0,0.15)"/>

          <rect x="80" y="80" width="1040" height="470" rx="20" fill="rgba(0,0,0,0.25)" stroke="rgba(255,255,255,0.15)"/>

          <text x="140" y="170" fill="rgba(255,255,255,0.8)" font-size="16" font-weight="bold" letter-spacing="3" font-family="-apple-system, sans-serif">
            ${category.toUpperCase()}
          </text>

          <text x="140" y="280" fill="#ffffff" font-size="46" font-weight="800" font-family="-apple-system, sans-serif">
            ${title}
          </text>
          ${subtitle ? `<text x="140" y="350" fill="rgba(255,255,255,0.85)" font-size="22" font-family="-apple-system, sans-serif">${subtitle}</text>` : ''}

          <g transform="translate(140, 480)">
            <text x="0" y="0" fill="rgba(255,255,255,0.7)" font-size="16" font-family="-apple-system, sans-serif">${tags.map(t => '#' + t).join(' ')}</text>
            <text x="920" y="0" fill="rgba(255,255,255,0.7)" font-size="16" font-family="-apple-system, sans-serif" text-anchor="end">${author} · ${date}</text>
          </g>
        </svg>
      `.trim();

    case 'glass':
    default:
      return `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
          <defs>
            <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#0f172a"/>
              <stop offset="50%" stop-color="#1e1b4b"/>
              <stop offset="100%" stop-color="#090d16"/>
            </linearGradient>
            <linearGradient id="glow1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#6366f1"/>
              <stop offset="100%" stop-color="#ec4899"/>
            </linearGradient>
            <linearGradient id="glow2" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#06b6d4"/>
              <stop offset="100%" stop-color="#3b82f6"/>
            </linearGradient>
          </defs>
          <rect width="100%" height="100%" fill="url(#bgGrad)"/>

          <!-- 背景光斑球 -->
          <circle cx="220" cy="180" r="160" fill="url(#glow1)" opacity="0.45" filter="blur(60px)"/>
          <circle cx="980" cy="460" r="200" fill="url(#glow2)" opacity="0.35" filter="blur(70px)"/>

          <!-- 毛玻璃主面板 -->
          <rect x="70" y="60" width="1060" height="510" rx="24" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.15)" stroke-width="1.5"/>

          <rect x="120" y="110" width="110" height="32" rx="16" fill="rgba(99,102,241,0.2)" stroke="rgba(99,102,241,0.4)"/>
          <text x="175" y="131" fill="#a5b4fc" font-size="13" font-weight="600" text-anchor="middle" font-family="-apple-system, sans-serif">
            ${category}
          </text>

          <text x="120" y="270" fill="#ffffff" font-size="48" font-weight="800" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">
            ${title}
          </text>
          ${subtitle ? `<text x="120" y="340" fill="#94a3b8" font-size="22" font-family="-apple-system, sans-serif">${subtitle}</text>` : ''}

          <g transform="translate(120, 500)">
            <text x="0" y="0" fill="#818cf8" font-size="17" font-weight="500" font-family="-apple-system, sans-serif">
              ${tags.map(t => '#' + t).join('  ')}
            </text>
            <text x="960" y="0" fill="#64748b" font-size="16" font-family="-apple-system, sans-serif" text-anchor="end">
              ${author} · ${date}
            </text>
          </g>
        </svg>
      `.trim();
  }
}

export function posterSVGToDataURI(svgString: string): string {
  // 安全转为 Data URI，便于直接存入 markdown frontmatter 且不依赖本地文件
  return `data:image/svg+xml;utf8,${encodeURIComponent(svgString)}`;
}

function escapeXML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
