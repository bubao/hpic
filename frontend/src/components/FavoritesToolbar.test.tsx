import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { FavoritesToolbar } from './FavoritesToolbar';
import { api } from '../api';
import { ToastProvider } from '../context/ToastContext';
import { FavoriteItem } from '../types';

vi.mock('../api', () => ({
  api: {
    addFavorite: vi.fn(),
  },
}));

const mockItems: FavoriteItem[] = [
  {
    id: '1',
    url: 'https://example.com/a.jpg',
    thumb_url: 'https://example.com/a-thumb.jpg',
    title: '山景',
    source: 'unsplash',
    tags: ['风景', '山'],
    created_at: '2026-11-01T10:00:00Z',
  },
  {
    id: '2',
    url: 'https://example.com/b.jpg',
    thumb_url: '',
    title: '代码',
    source: 'wallhaven',
    tags: [],
    created_at: '2026-11-02T10:00:00Z',
  },
];

const renderComponent = (items: FavoriteItem[] = mockItems, onImported: () => void | Promise<void> = vi.fn()) =>
  render(
    <ToastProvider>
      <FavoritesToolbar items={items} onImported={onImported} />
    </ToastProvider>
  );

describe('FavoritesToolbar', () => {
  let createdBlob: Blob | null = null;
  let clickSpy: ReturnType<typeof vi.fn<() => void>>;
  const origCreateObjectURL = URL.createObjectURL;
  const origRevokeObjectURL = URL.revokeObjectURL;

  beforeEach(() => {
    vi.clearAllMocks();
    createdBlob = null;
    URL.createObjectURL = vi.fn((blob: Blob) => {
      createdBlob = blob;
      return 'blob:mock';
    });
    URL.revokeObjectURL = vi.fn();
    clickSpy = vi.fn<() => void>();
    HTMLAnchorElement.prototype.click = clickSpy;
  });

  afterEach(() => {
    URL.createObjectURL = origCreateObjectURL;
    URL.revokeObjectURL = origRevokeObjectURL;
    // @ts-expect-error 还原原型方法
    delete HTMLAnchorElement.prototype.click;
  });

  it('exports JSON with all metadata', async () => {
    renderComponent();

    fireEvent.click(screen.getByText('导出 JSON'));

    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    expect(createdBlob).not.toBeNull();
    const text = await createdBlob!.text();
    const parsed = JSON.parse(text);
    expect(parsed.schema_version).toBe(1);
    expect(parsed.total).toBe(2);
    expect(parsed.items[0]).toMatchObject({
      url: 'https://example.com/a.jpg',
      title: '山景',
      source: 'unsplash',
      tags: ['风景', '山'],
    });
  });

  it('exports Markdown with pasteable image syntax', async () => {
    renderComponent();

    fireEvent.click(screen.getByText('导出 Markdown'));

    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    const text = await createdBlob!.text();
    expect(text).toContain('# hpic 收藏夹导出');
    expect(text).toContain('- ![山景](https://example.com/a.jpg)');
    expect(text).toContain('来源: unsplash');
    expect(text).toContain('- ![代码](https://example.com/b.jpg)');
  });

  it('imports a JSON backup and deduplicates through addFavorite', async () => {
    vi.mocked(api.addFavorite).mockResolvedValue({ success: true } as any);
    const onImported = vi.fn();
    renderComponent(mockItems, onImported);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const backup = JSON.stringify({ schema_version: 1, items: mockItems });
    const file = new File([backup], 'hpic-favorites.json', { type: 'application/json' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(api.addFavorite).toHaveBeenCalledTimes(2));
    expect(api.addFavorite).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://example.com/a.jpg', title: '山景' })
    );
    await waitFor(() => expect(onImported).toHaveBeenCalled());
  });

  it('skips invalid entries while importing', async () => {
    vi.mocked(api.addFavorite).mockResolvedValue({ success: true } as any);
    renderComponent();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const backup = JSON.stringify({ items: [{ title: '缺 URL' }, { url: 'https://example.com/c.jpg' }] });
    const file = new File([backup], 'bad.json', { type: 'application/json' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(api.addFavorite).toHaveBeenCalledTimes(1));
  });

  it('disables export buttons when favorites are empty', () => {
    renderComponent([]);
    expect((screen.getByText('导出 JSON').closest('button') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByText('导出 Markdown').closest('button') as HTMLButtonElement).disabled).toBe(true);
  });
});
