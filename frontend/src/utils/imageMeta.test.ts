import { describe, it, expect } from 'vitest';
import { extractImageFilename, getImageAspectRatio } from './imageMeta';

describe('imageMeta utility tests', () => {
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
});
