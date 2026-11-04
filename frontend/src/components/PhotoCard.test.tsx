import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PhotoCard, PhotoCardProps } from './PhotoCard';

vi.mock('./SmoothImage', () => ({
  SmoothImage: ({ onClick }: { onClick?: () => void }) => (
    <div data-testid="mock-smooth-image" onClick={onClick} />
  ),
}));

describe('PhotoCard component tests', () => {
  const defaultProps: PhotoCardProps = {
    url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=2560&h=1440',
    thumbUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=400',
    title: 'Beautiful Mountain Lake',
    subtitle: 'Photo by Landscape Artist',
    sourceBadge: 'Unsplash',
    isFavorited: false,
    isUsedByCurrent: false,
    isBroken: false,
    coverFields: ['cover', 'banner_img'],
    onToggleFavorite: vi.fn(),
    onOpenLightbox: vi.fn(),
    onApplyImage: vi.fn(),
  };

  it('should render card title, subtitle and source badge', () => {
    render(<PhotoCard {...defaultProps} />);

    expect(screen.getByText('Beautiful Mountain Lake')).toBeDefined();
    expect(screen.getByText('Photo by Landscape Artist')).toBeDefined();
    expect(screen.getByText('Unsplash')).toBeDefined();
  });

  it('should show 404 broken badge when isBroken is true', () => {
    render(<PhotoCard {...defaultProps} isBroken={true} />);

    expect(screen.getByText(/404 失效/)).toBeDefined();
  });

  it('should add active highlight class when isUsedByCurrent is true', () => {
    const { container } = render(<PhotoCard {...defaultProps} isUsedByCurrent={true} />);
    const card = container.querySelector('.gallery-card-item');

    expect(card?.classList.contains('card-highlight-active')).toBe(true);
  });

  it('should trigger onToggleFavorite when clicking favorite star button', () => {
    const handleToggleFav = vi.fn();
    render(<PhotoCard {...defaultProps} onToggleFavorite={handleToggleFav} />);

    const favButton = screen.getByTitle('收藏此图片');
    fireEvent.click(favButton);

    expect(handleToggleFav).toHaveBeenCalledTimes(1);
  });

  it('should display active favorite state when isFavorited is true', () => {
    render(<PhotoCard {...defaultProps} isFavorited={true} />);

    expect(screen.getByTitle('已在灵感收藏夹 (点击取消)')).toBeDefined();
  });

  it('should trigger onOpenLightbox when clicking image area', () => {
    const handleOpenLightbox = vi.fn();
    render(<PhotoCard {...defaultProps} onOpenLightbox={handleOpenLightbox} />);

    const mockImg = screen.getByTestId('mock-smooth-image');
    fireEvent.click(mockImg);

    expect(handleOpenLightbox).toHaveBeenCalledTimes(1);
  });

  it('should trigger onEditTags when clicking tag button', () => {
    const handleEditTags = vi.fn();
    render(<PhotoCard {...defaultProps} onEditTags={handleEditTags} />);

    const tagBtn = screen.getByText('标签');
    fireEvent.click(tagBtn);

    expect(handleEditTags).toHaveBeenCalledTimes(1);
  });

  it('should render tags list when provided', () => {
    render(<PhotoCard {...defaultProps} tags={['nature', 'wallpaper']} />);

    expect(screen.getByText('#nature')).toBeDefined();
    expect(screen.getByText('#wallpaper')).toBeDefined();
  });

  it('should render "无标签" when tags array is empty', () => {
    render(<PhotoCard {...defaultProps} tags={[]} />);

    expect(screen.getByText('无标签')).toBeDefined();
  });

  it('should trigger onCopyUrl when copy button is clicked', () => {
    const handleCopy = vi.fn();
    render(<PhotoCard {...defaultProps} onCopyUrl={handleCopy} />);

    const copyBtn = screen.getByTitle('复制图片链接');
    fireEvent.click(copyBtn);

    expect(handleCopy).toHaveBeenCalledTimes(1);
  });

  it('should trigger onOpenExternal when open external button is clicked', () => {
    const handleExternal = vi.fn();
    render(<PhotoCard {...defaultProps} onOpenExternal={handleExternal} />);

    const externalBtn = screen.getByTitle('在浏览器中查看原图');
    fireEvent.click(externalBtn);

    expect(handleExternal).toHaveBeenCalledTimes(1);
  });

  it('should trigger onApplyImage with correct cover fields', () => {
    const handleApply = vi.fn();
    render(<PhotoCard {...defaultProps} onApplyImage={handleApply} />);

    const applyAllBtn = screen.getByText('设为全部');
    fireEvent.click(applyAllBtn);

    expect(handleApply).toHaveBeenCalledWith(defaultProps.url, ['cover', 'banner_img']);

    const applyCoverBtn = screen.getByText('cover');
    fireEvent.click(applyCoverBtn);

    expect(handleApply).toHaveBeenCalledWith(defaultProps.url, ['cover']);
  });
});
