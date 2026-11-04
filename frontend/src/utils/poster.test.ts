import { describe, it, expect } from 'vitest';
import { generatePosterSVG, posterSVGToDataURI } from './poster';

describe('poster utility tests', () => {
  const baseOpts = {
    title: '深入理解 Go 并发模型',
    subtitle: 'Goroutine 与 Channel 核心实战',
    tags: ['Go', 'Concurrency', 'Backend'],
    date: '2026-11-04 12:00:00',
    author: 'bubao',
    category: '技术',
  };

  it('should generate valid SVG for terminal theme', () => {
    const svg = generatePosterSVG({ ...baseOpts, theme: 'terminal' });
    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox="0 0 1200 630"');
    expect(svg).toContain('深入理解 Go 并发模型');
    expect(svg).toContain('Goroutine 与 Channel 核心实战');
    expect(svg).toContain('#技术');
    expect(svg).toContain('@bubao');
    expect(svg).toContain('2026-11-04');
  });

  it('should generate valid SVG for cyberpunk theme', () => {
    const svg = generatePosterSVG({ ...baseOpts, theme: 'cyberpunk' });
    expect(svg).toContain('<svg');
    expect(svg).toContain('neonText');
    expect(svg).toContain('深入理解 Go 并发模型');
  });

  it('should generate valid SVG for glass theme', () => {
    const svg = generatePosterSVG({ ...baseOpts, theme: 'glass' });
    expect(svg).toContain('<svg');
    expect(svg).toContain('filter="blur(60px)"');
    expect(svg).toContain('深入理解 Go 并发模型');
  });

  it('should generate valid SVG for minimal theme', () => {
    const svg = generatePosterSVG({ ...baseOpts, theme: 'minimal' });
    expect(svg).toContain('<svg');
    expect(svg).toContain('深入理解 Go 并发模型');
  });

  it('should generate valid SVG for gradient theme', () => {
    const svg = generatePosterSVG({ ...baseOpts, theme: 'gradient' });
    expect(svg).toContain('<svg');
    expect(svg).toContain('深入理解 Go 并发模型');
  });

  it('should properly escape XML special characters to prevent SVG injection', () => {
    const svg = generatePosterSVG({
      title: '<script>alert("hack")</script> & "quotes"',
      theme: 'terminal',
    });
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
    expect(svg).toContain('&amp;');
    expect(svg).toContain('&quot;');
  });

  it('should generate correct data URI from SVG string', () => {
    const svg = generatePosterSVG({ ...baseOpts, theme: 'terminal' });
    const dataURI = posterSVGToDataURI(svg);
    expect(dataURI.startsWith('data:image/svg+xml;utf8,')).toBe(true);
    expect(dataURI).toContain(encodeURIComponent('深入理解 Go 并发模型'));
  });
});
