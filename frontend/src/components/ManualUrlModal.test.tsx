import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import React, { useState } from 'react';
import { ManualUrlModal } from './ManualUrlModal';
import { ToastProvider } from '../context/ToastContext';
import { FavoritesProvider } from '../context/FavoritesContext';

vi.mock('../api', () => ({
  api: {
    getFavorites: vi.fn().mockResolvedValue({ items: [], tags: [] }),
    addFavorite: vi.fn().mockResolvedValue({ success: true }),
    removeFavorite: vi.fn().mockResolvedValue({ success: true }),
    updateFavoriteTags: vi.fn().mockResolvedValue({ success: true }),
  },
}));

const COVER_FIELDS = ['index_img', 'banner_img'];
const IMAGE_URL = 'https://cdn.example.com/cover.jpg';

/**
 * 与 App.tsx 一致的装配方式：由父级持有 isOpen，模拟真实的「打开 → 关闭 → 再打开」链路。
 */
const Harness = ({ onApplyImage }: { onApplyImage: (url: string, fields: string[]) => void }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <ToastProvider>
      <FavoritesProvider>
        <button type="button" onClick={() => setIsOpen(true)}>
          open-manual
        </button>
        <ManualUrlModal
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          coverFields={COVER_FIELDS}
          postTitle="测试文章"
          onApplyImage={onApplyImage}
        />
      </FavoritesProvider>
    </ToastProvider>
  );
};

const openModal = () => {
  act(() => {
    screen.getByText('open-manual').click();
  });
};

const typeUrl = (url: string) => {
  fireEvent.change(screen.getByTestId('manual-url-input'), { target: { value: url } });
};

describe('ManualUrlModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('关闭态不渲染任何内容', () => {
    render(<Harness onApplyImage={vi.fn()} />);
    expect(screen.queryByTestId('manual-url-input')).toBeNull();
  });

  it('打开后输入链接，出现「设为全部封面」与逐字段按钮', () => {
    render(<Harness onApplyImage={vi.fn()} />);
    openModal();

    expect((screen.getByTestId('manual-url-input') as HTMLInputElement).value).toBe('');

    typeUrl(IMAGE_URL);

    expect((screen.getByTestId('manual-url-input') as HTMLInputElement).value).toBe(IMAGE_URL);
    expect(screen.getByTestId('apply-all-button')).toBeDefined();
    const fieldButtons = screen.getAllByTestId('apply-field-button');
    expect(fieldButtons.map(b => b.getAttribute('data-field'))).toEqual(COVER_FIELDS);
  });

  it('点击「设为全部封面」回调全部封面字段并关闭弹窗', () => {
    const onApplyImage = vi.fn();
    render(
      <ToastProvider>
        <FavoritesProvider>
          <ManualUrlModal
            isOpen={true}
            onClose={vi.fn()}
            coverFields={COVER_FIELDS}
            postTitle="测试文章"
            onApplyImage={onApplyImage}
          />
        </FavoritesProvider>
      </ToastProvider>
    );

    typeUrl(IMAGE_URL);
    fireEvent.click(screen.getByTestId('apply-all-button'));

    expect(onApplyImage).toHaveBeenCalledWith(IMAGE_URL, COVER_FIELDS);
  });

  it('再次打开会清空已输入的链接，重新输入后按钮组正常出现', () => {
    render(<Harness onApplyImage={vi.fn()} />);

    // 第一次打开 → 输入 → 关闭
    openModal();
    typeUrl(IMAGE_URL);
    fireEvent.click(screen.getByText('取消'));
    expect(screen.queryByTestId('manual-url-input')).toBeNull();

    // 再次打开：输入被清空，且此时不应出现应用按钮
    openModal();
    expect((screen.getByTestId('manual-url-input') as HTMLInputElement).value).toBe('');
    expect(screen.queryByTestId('apply-all-button')).toBeNull();

    typeUrl(IMAGE_URL);
    expect((screen.getByTestId('manual-url-input') as HTMLInputElement).value).toBe(IMAGE_URL);
    expect(screen.getByTestId('apply-all-button')).toBeDefined();
  });
});
