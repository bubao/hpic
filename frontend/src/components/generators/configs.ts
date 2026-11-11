import { UrlBuilderConfig } from './UrlBuilderGenerator';

const enc = encodeURIComponent;

/** Shields.io 的路径转义：空格用下划线，其余交由 URL 编码。 */
const shieldEsc = (s: string) => enc(s).replace(/%20/g, '_');

/**
 * 各免 Key 图源的 URL 构建配置。
 * 新增来源时只需在 GENERATOR_REGISTRY 中登记一份配置即可。
 */

export const PICSMUM_CONFIG: UrlBuilderConfig = {
  sourceLabel: 'Lorem Picsum',
  fallbackTitle: 'picsum-cover.jpg',
  hint: '基于种子生成确定性随机摄影图：同一种子始终得到同一张图，适合作为占位 / 随机封面。',
  fields: [
    { key: 'seed', label: '种子 (Seed)', type: 'text', defaultValue: 'hpic', placeholder: '任意关键词，如 mountain', required: true },
    { key: 'width', label: '宽度', type: 'number', defaultValue: '1920' },
    { key: 'height', label: '高度', type: 'number', defaultValue: '1080' },
    {
      key: 'effect', label: '效果', type: 'select', defaultValue: 'none',
      options: [
        { value: 'none', label: '无' },
        { value: 'grayscale', label: '黑白 (Grayscale)' },
        { value: 'blur', label: '模糊 (Blur)' },
      ],
    },
  ],
  buildUrl: v => {
    const seed = v.seed.trim();
    if (!seed) return '';
    const w = v.width || '1920';
    const h = v.height || '1080';
    const params: string[] = [];
    if (v.effect === 'grayscale') params.push('grayscale');
    if (v.effect === 'blur') params.push('blur=2');
    const qs = params.length ? `?${params.join('&')}` : '';
    return `https://picsum.photos/seed/${enc(seed)}/${w}/${h}${qs}`;
  },
};

export const LOREMFLICKR_CONFIG: UrlBuilderConfig = {
  sourceLabel: 'LoremFlickr',
  fallbackTitle: 'loremflickr-cover.jpg',
  hint: '按关键词从 Flickr 抓取真实图片：同关键词 + 同图序可复现同一张；留空关键词则完全随机。（该服务偶有波动，加载失败可换关键词重试）',
  fields: [
    { key: 'keywords', label: '关键词（多个用逗号分隔）', type: 'text', defaultValue: 'technology', placeholder: '如 mountain, night' },
    { key: 'width', label: '宽度', type: 'number', defaultValue: '1920' },
    { key: 'height', label: '高度', type: 'number', defaultValue: '1080' },
    {
      key: 'mode', label: '模式', type: 'select', defaultValue: 'color',
      options: [
        { value: 'color', label: '彩色' },
        { value: 'gray', label: '黑白 (Grayscale)' },
      ],
    },
    { key: 'index', label: '图序（可选）', type: 'number', defaultValue: '', placeholder: '留空随机，填 1 / 2 / 3 可复现' },
  ],
  buildUrl: v => {
    const w = v.width || '1920';
    const h = v.height || '1080';
    const keywords = (v.keywords || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .map(enc)
      .join(',');
    const prefix = v.mode === 'gray' ? 'g/' : '';
    const idx = (v.index || '').trim();
    const suffix = /^\d+$/.test(idx) ? `/${idx}` : '';
    return `https://loremflickr.com/${prefix}${w}/${h}/${keywords || 'all'}${suffix}`;
  },
};

export const SHIELDS_CONFIG: UrlBuilderConfig = {
  sourceLabel: 'Shields.io',
  fallbackTitle: 'shields-badge.svg',
  hint: '生成徽章 / 状态图，可直接作为技术封面或 README 标志。',
  fields: [
    { key: 'label', label: '左侧标签', type: 'text', defaultValue: 'build', required: true },
    { key: 'message', label: '右侧内容', type: 'text', defaultValue: 'passing', required: true },
    {
      key: 'color', label: '颜色', type: 'select', defaultValue: 'brightgreen',
      options: [
        { value: 'brightgreen', label: '亮绿' },
        { value: 'green', label: '绿' },
        { value: 'yellow', label: '黄' },
        { value: 'orange', label: '橙' },
        { value: 'red', label: '红' },
        { value: 'blue', label: '蓝' },
        { value: 'blueviolet', label: '紫' },
        { value: 'lightgrey', label: '浅灰' },
      ],
    },
  ],
  buildUrl: v => {
    const label = v.label.trim();
    const message = v.message.trim();
    if (!label || !message) return '';
    return `https://img.shields.io/badge/${shieldEsc(label)}-${shieldEsc(message)}-${v.color}`;
  },
};

export const GITHUB_STATS_CONFIG: UrlBuilderConfig = {
  sourceLabel: 'GitHub Readme Stats',
  fallbackTitle: 'github-stats-card.svg',
  hint: '根据 GitHub 用户名生成统计卡片（Star、Commit、Rank 等）。',
  fields: [
    { key: 'username', label: 'GitHub 用户名', type: 'text', defaultValue: '', placeholder: '例如 bubao', required: true },
    {
      key: 'theme', label: '主题', type: 'select', defaultValue: '',
      options: [
        { value: '', label: '默认' },
        { value: 'dark', label: '深色' },
        { value: 'radical', label: 'Radical' },
        { value: 'merko', label: 'Merko' },
        { value: 'gruvbox', label: 'Gruvbox' },
        { value: 'tokyonight', label: 'Tokyo Night' },
        { value: 'onedark', label: 'One Dark' },
        { value: 'dracula', label: 'Dracula' },
      ],
    },
    {
      key: 'show_icons', label: '显示图标', type: 'select', defaultValue: 'true',
      options: [
        { value: 'true', label: '显示' },
        { value: 'false', label: '隐藏' },
      ],
    },
  ],
  initialValues: ({ defaultOwner }) => ({ username: defaultOwner || '' }),
  buildUrl: v => {
    const username = v.username.trim();
    if (!username) return '';
    const qs = new URLSearchParams();
    qs.set('username', username);
    if (v.theme) qs.set('theme', v.theme);
    qs.set('show_icons', v.show_icons === 'false' ? 'false' : 'true');
    return `https://github-readme-stats.vercel.app/api?${qs.toString()}`;
  },
};

export const QUICKCHART_CONFIG: UrlBuilderConfig = {
  sourceLabel: 'QuickChart',
  fallbackTitle: 'quickchart.png',
  hint: '用 Chart.js 配置生成图表；在下方粘贴 JSON 配置即可（非法 JSON 不生成）。',
  fields: [
    {
      key: 'config', label: '图表配置 (JSON)', type: 'textarea', required: true,
      defaultValue: '{"type":"bar","data":{"labels":["A","B","C"],"datasets":[{"label":"Sample","data":[3,5,2],"backgroundColor":["#6366f1","#22c55e","#f59e0b"]}]}}',
    },
    { key: 'width', label: '宽度', type: 'number', defaultValue: '800' },
    { key: 'height', label: '高度', type: 'number', defaultValue: '500' },
  ],
  buildUrl: v => {
    const cfg = v.config.trim();
    if (!cfg) return '';
    try {
      JSON.parse(cfg);
    } catch {
      return '';
    }
    const qs = new URLSearchParams();
    qs.set('c', cfg);
    qs.set('w', v.width || '800');
    qs.set('h', v.height || '500');
    return `https://quickchart.io/chart?${qs.toString()}`;
  },
};

export const PLACEHOLDER_CONFIG: UrlBuilderConfig = {
  sourceLabel: 'Placeholder',
  fallbackTitle: 'placeholder.png',
  hint: '按尺寸 / 颜色 / 文字生成占位图，常用于版式预览。',
  fields: [
    { key: 'width', label: '宽度', type: 'number', defaultValue: '1920' },
    { key: 'height', label: '高度', type: 'number', defaultValue: '1080' },
    { key: 'text', label: '文字', type: 'text', defaultValue: 'hpic' },
    { key: 'bg', label: '背景色', type: 'text', defaultValue: 'EEEEEE' },
    { key: 'color', label: '文字色', type: 'text', defaultValue: '31343C' },
  ],
  buildUrl: v => {
    const w = v.width || '1920';
    const h = v.height || '1080';
    const bg = v.bg || 'EEEEEE';
    const color = v.color || '31343C';
    return `https://placehold.co/${w}x${h}/${bg}/${color}?text=${enc(v.text || '')}`;
  },
};

export const QR_CONFIG: UrlBuilderConfig = {
  sourceLabel: 'QR Code',
  fallbackTitle: 'qrcode.png',
  hint: '把任意文本 / 链接生成二维码图片。',
  fields: [
    { key: 'data', label: '内容', type: 'text', defaultValue: 'https://github.com/bubao/hpic', required: true },
    { key: 'size', label: '尺寸', type: 'number', defaultValue: '400' },
  ],
  buildUrl: v => {
    const data = v.data.trim();
    if (!data) return '';
    const size = v.size || '400';
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${enc(data)}`;
  },
};

export const DICEBEAR_CONFIG: UrlBuilderConfig = {
  sourceLabel: 'DiceBear',
  fallbackTitle: 'dicebear-avatar.svg',
  hint: '根据种子生成矢量头像（SVG），风格多样。',
  fields: [
    {
      key: 'style', label: '风格', type: 'select', defaultValue: 'adventurer',
      options: [
        { value: 'adventurer', label: 'Adventurer' },
        { value: 'avataaars', label: 'Avataaars' },
        { value: 'bottts', label: 'Bottts' },
        { value: 'lorelei', label: 'Lorelei' },
        { value: 'notionists', label: 'Notionists' },
        { value: 'open-peeps', label: 'Open Peeps' },
        { value: 'personas', label: 'Personas' },
        { value: 'pixel-art', label: 'Pixel Art' },
        { value: 'thumbs', label: 'Thumbs' },
      ],
    },
    { key: 'seed', label: '种子', type: 'text', defaultValue: 'hpic', required: true },
  ],
  buildUrl: v => {
    const seed = v.seed.trim();
    if (!seed) return '';
    return `https://api.dicebear.com/9.x/${v.style}/svg?seed=${enc(seed)}`;
  },
};

export const POLLINATIONS_CONFIG: UrlBuilderConfig = {
  sourceLabel: 'Pollinations AI',
  fallbackTitle: 'pollinations-cover.png',
  hint: '输入提示词由 AI 实时生成封面；固定随机种子可复现同一张图。',
  fields: [
    { key: 'prompt', label: '提示词', type: 'textarea', defaultValue: '', placeholder: '例如 a futuristic city skyline at dusk, cinematic', required: true },
    { key: 'width', label: '宽度', type: 'number', defaultValue: '1920' },
    { key: 'height', label: '高度', type: 'number', defaultValue: '1080' },
    {
      key: 'model', label: '模型', type: 'select', defaultValue: 'flux',
      options: [
        { value: 'flux', label: 'Flux' },
        { value: 'turbo', label: 'Turbo' },
      ],
    },
    { key: 'seed', label: '随机种子 (可选)', type: 'number', defaultValue: '' },
  ],
  buildUrl: v => {
    const prompt = v.prompt.trim();
    if (!prompt) return '';
    const qs = new URLSearchParams();
    qs.set('width', v.width || '1920');
    qs.set('height', v.height || '1080');
    qs.set('model', v.model || 'flux');
    qs.set('nologo', 'true');
    if (v.seed) qs.set('seed', v.seed);
    return `https://image.pollinations.ai/prompt/${enc(prompt)}?${qs.toString()}`;
  },
};
