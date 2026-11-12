import { describe, it, expect } from 'vitest';
import { extractImageFilename, getImageAspectRatio, getImageQualityBadge, extractTargetDimensions, isSvgUrl, buildMarkdownImage } from './imageMeta';

describe('imageMeta utility tests', () => {
  describe('isSvgUrl', () => {
    it('should correctly identify SVG urls', () => {
      expect(isSvgUrl('https://example.com/logo.svg')).toBe(true);
      expect(isSvgUrl('https://cdn.jsdelivr.net/gh/bubao/picgo_db_tiny/img/20210325223847.svg')).toBe(true);
      expect(isSvgUrl('https://example.com/logo.SVG?v=1')).toBe(true);
      expect(isSvgUrl('data:image/svg+xml;utf8,<svg></svg>')).toBe(true);
      expect(isSvgUrl('https://skillicons.dev/icons?i=go,docker,linux')).toBe(true);
      expect(isSvgUrl('https://carbon.now.sh/embed/abc')).toBe(true);
      expect(isSvgUrl('https://ray.so/embed/xyz')).toBe(true);
    });

    it('should return false for non-SVG urls', () => {
      expect(isSvgUrl('https://example.com/photo.jpg')).toBe(false);
      expect(isSvgUrl('https://example.com/photo.png')).toBe(false);
      expect(isSvgUrl('https://example.com/photo.webp')).toBe(false);
      expect(isSvgUrl('')).toBe(false);
      expect(isSvgUrl(null)).toBe(false);
      expect(isSvgUrl(undefined)).toBe(false);
    });

    it('should not treat bitmap urls that merely contain generator keywords as SVG', () => {
      expect(isSvgUrl('https://example.com/carbon-lighting.webp')).toBe(false);
      expect(isSvgUrl('https://example.com/photo-ray.so.png')).toBe(false);
      expect(isSvgUrl('https://notray.so/img.png')).toBe(false);
      expect(isSvgUrl('https://mycarbon.example.com/a.png')).toBe(false);
      expect(isSvgUrl('data:image/png;base64,AAAA')).toBe(false);
    });

    it('should recognize SVG generators hostnames with subdomains', () => {
      expect(isSvgUrl('https://www.skillicons.dev/icons?i=go')).toBe(true);
      expect(isSvgUrl('https://cdn.ray.so/a/b.svg')).toBe(true);
    });

    it('should recognize SVG hosts added for keyless generators', () => {
      expect(isSvgUrl('https://img.shields.io/badge/build-passing-brightgreen')).toBe(true);
      expect(isSvgUrl('https://api.dicebear.com/9.x/adventurer/svg?seed=hpic')).toBe(true);
      expect(isSvgUrl('https://github-readme-stats.vercel.app/api?username=bubao&theme=dark')).toBe(true);
    });

    it('should not treat lookalike hosts or bitmap urls as SVG', () => {
      expect(isSvgUrl('https://notshields.io/badge/a-b-green.png')).toBe(false);
      expect(isSvgUrl('https://example.com/api.dicebear.com/x.png')).toBe(false);
      expect(isSvgUrl('https://github-readme-stats.vercel.app.evil.com/x')).toBe(false);
    });
  });
  describe('extractImageFilename', () => {
    it('should handle empty or whitespace URLs', () => {
      expect(extractImageFilename('')).toBe('');
      expect(extractImageFilename('   ')).toBe('');
    });

    it('should recognize Data URIs and generate appropriate filenames', () => {
      expect(extractImageFilename('data:image/svg+xml;base64,...')).toBe('poster-cover.svg');
      expect(extractImageFilename('data:image/png;base64,...')).toBe('poster-cover.png');
      expect(extractImageFilename('data:image/webp;base64,...')).toBe('poster-cover.webp');
      expect(extractImageFilename('data:image/jpeg;base64,...')).toBe('poster-cover.jpg');
    });

    it('should derive repository name for Socialify cards', () => {
      expect(extractImageFilename('https://socialify.git.ci/bubao/hpic/image?theme=Dark')).toBe('bubao-hpic-socialify.png');
      expect(extractImageFilename('https://socialify.git.ci/')).toBe('socialify-card.png');
    });

    it('should handle SkillIcons generator URLs', () => {
      expect(extractImageFilename('https://skillicons.dev/icons?i=go,docker,linux')).toBe('skill-icons.svg');
    });

    it('should derive filenames for keyless generator hosts', () => {
      expect(extractImageFilename('https://picsum.photos/seed/mountain/1920/1080')).toBe('mountain-picsum.jpg');
      expect(extractImageFilename('https://picsum.photos/seed/my%20photo/800/600?grayscale')).toBe('my photo-picsum.jpg');
expect(extractImageFilename('https://loremflickr.com/1920/1080/mountain')).toBe('mountain-loremflickr.jpg');
expect(extractImageFilename('https://loremflickr.com/g/800/600/dog,cat/3')).toBe('dog,cat-loremflickr.jpg');
expect(extractImageFilename('https://loremflickr.com/1920/1080/all')).toBe('all-loremflickr.jpg');
      expect(extractImageFilename('https://img.shields.io/badge/build-passing-brightgreen')).toBe('shields-badge.svg');
      expect(extractImageFilename('https://github-readme-stats.vercel.app/api?username=bubao&theme=dark')).toBe('github-stats-card.svg');
      expect(extractImageFilename('https://quickchart.io/chart?c=%7B%7D&w=800&h=500')).toBe('quickchart.png');
      expect(extractImageFilename('https://placehold.co/1920x1080/EEEEEE/31343C?text=hpic')).toBe('placeholder.png');
      expect(extractImageFilename('https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=abc')).toBe('qrcode.png');
      expect(extractImageFilename('https://api.dicebear.com/9.x/adventurer/svg?seed=hpic')).toBe('dicebear-avatar.svg');
      expect(extractImageFilename('https://image.pollinations.ai/prompt/a%20city?width=1920')).toBe('pollinations-cover.png');
    });

    it('should extract IDs from Unsplash URLs', () => {
      expect(extractImageFilename('https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1200')).toBe('photo-1506744038136-46273834b3fb.jpg');
    });

    it('should extract filenames from Wallhaven URLs', () => {
      expect(extractImageFilename('https://w.wallhaven.cc/full/72/wallhaven-728639.jpg')).toBe('wallhaven-728639.jpg');
    });

    it('should handle ordinary local or static paths', () => {
      expect(extractImageFilename('https://myblog.com/images/cover.png?v=1')).toBe('cover.png');
      expect(extractImageFilename('/images/banner.webp')).toBe('banner.webp');
      expect(extractImageFilename('/images/custom-file')).toBe('custom-file.jpg');
    });

    it('should sanitize fallback title when fallback is used', () => {
      // 当 URL 解析后没有具体文件名（例如根路径 /）
      expect(extractImageFilename('http://example.com/', 'Clean "Dangerous" Title/')).toBe('Clean -Dangerous- Title-.jpg');
      expect(extractImageFilename('http://example.com/')).toBe('image.jpg');
    });
  });

  describe('getImageAspectRatio', () => {
    it('should handle invalid or zero dimensions', () => {
      expect(getImageAspectRatio(0, 0)).toBe('');
      expect(getImageAspectRatio(1920, 0)).toBe('');
      expect(getImageAspectRatio(-10, 100)).toBe('');
    });

    it('should detect standard aspect ratios accurately', () => {
      expect(getImageAspectRatio(1920, 1080)).toBe('16:9');
      expect(getImageAspectRatio(3840, 2160)).toBe('16:9');
      expect(getImageAspectRatio(2560, 1440)).toBe('16:9');

      expect(getImageAspectRatio(3440, 1440)).toBe('21:9');
      expect(getImageAspectRatio(2560, 1080)).toBe('21:9');

      expect(getImageAspectRatio(1920, 1200)).toBe('16:10');
      expect(getImageAspectRatio(2560, 1600)).toBe('16:10');

      expect(getImageAspectRatio(1024, 768)).toBe('4:3');
      expect(getImageAspectRatio(1000, 1000)).toBe('1:1');
      expect(getImageAspectRatio(1080, 1920)).toBe('9:16');
      expect(getImageAspectRatio(1800, 1200)).toBe('3:2');
    });

    it('should fall back to orientation categories for non-standard ratios', () => {
      expect(getImageAspectRatio(2000, 1000)).toBe('横屏');
      expect(getImageAspectRatio(1000, 2000)).toBe('竖屏');
      expect(getImageAspectRatio(1000, 900)).toBe('方形');
    });
  });

  describe('getImageQualityBadge', () => {
    it('should identify 4K, 2K, 1080P and HD resolutions', () => {
      expect(getImageQualityBadge(3840, 2160)).toBe('4K');
      expect(getImageQualityBadge(4096, 2160)).toBe('4K');
      expect(getImageQualityBadge(2560, 1440)).toBe('2K');
      expect(getImageQualityBadge(1920, 1080)).toBe('1080P');
      expect(getImageQualityBadge(1280, 720)).toBe('HD');
      expect(getImageQualityBadge(800, 600)).toBe('');
    });

    it('should identify quality for portrait/vertical images', () => {
      expect(getImageQualityBadge(2160, 3840)).toBe('4K');
      expect(getImageQualityBadge(1080, 1920)).toBe('1080P');
      expect(getImageQualityBadge(720, 1280)).toBe('HD');
    });
  });

  describe('extractTargetDimensions', () => {
    it('should prefer explicit width and height with quality badge', () => {
      const result = extractTargetDimensions('https://example.com/img.jpg', 3840, 2160);
      expect(result).toEqual({ width: 3840, height: 2160, quality: '4K' });
    });

    it('should parse dimensions from URL search parameters if omitted', () => {
      const result = extractTargetDimensions('https://images.unsplash.com/photo-123?w=2560&h=1440');
      expect(result).toEqual({ width: 2560, height: 1440, quality: '2K' });
    });

    it('should parse alternative width and height query parameters', () => {
      const result = extractTargetDimensions('https://images.unsplash.com/photo-123?width=1920&height=1080');
      expect(result).toEqual({ width: 1920, height: 1080, quality: '1080P' });
    });

    it('should handle partial or invalid parameters gracefully', () => {
      expect(extractTargetDimensions('https://example.com/test.jpg?w=invalid&h=invalid')).toBeNull();
      expect(extractTargetDimensions('https://example.com/test.jpg?w=1920')).toBeNull();
      expect(extractTargetDimensions('https://example.com/test.jpg?h=1080')).toBeNull();
      expect(extractTargetDimensions('')).toBeNull();
      expect(extractTargetDimensions(undefined)).toBeNull();
    });

    it('should return null if dimensions cannot be determined', () => {
      expect(extractTargetDimensions('https://example.com/test.jpg')).toBeNull();
    });
  });

  describe('buildMarkdownImage', () => {
    it('should build inline image syntax from url and title', () => {
      expect(buildMarkdownImage('https://example.com/a.jpg', '封面')).toBe('![封面](https://example.com/a.jpg)');
    });

    it('should fall back to 配图 when title is empty', () => {
      expect(buildMarkdownImage('https://example.com/a.jpg', '')).toBe('![配图](https://example.com/a.jpg)');
      expect(buildMarkdownImage('https://example.com/a.jpg', null)).toBe('![配图](https://example.com/a.jpg)');
      expect(buildMarkdownImage('https://example.com/a.jpg')).toBe('![配图](https://example.com/a.jpg)');
    });

    it('should neutralize characters that break the syntax', () => {
      expect(buildMarkdownImage('https://example.com/a.jpg', 'a]b')).toBe('![a)b](https://example.com/a.jpg)');
      expect(buildMarkdownImage('https://example.com/a.jpg', 'line1\nline2')).toBe('![line1 line2](https://example.com/a.jpg)');
    });
  });
});
