import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useModalManager } from './useModalManager';

describe('useModalManager Hook', () => {
  it('initializes with all modals closed by default', () => {
    const { result } = renderHook(() => useModalManager());

    expect(result.current.isSettingsOpen).toBe(false);
    expect(result.current.isHealthOpen).toBe(false);
    expect(result.current.isLogsOpen).toBe(false);
    expect(result.current.isDeployModalOpen).toBe(false);
    expect(result.current.isCreatePostOpen).toBe(false);
    expect(result.current.isHistoryModalOpen).toBe(false);
    expect(result.current.isManualOpen).toBe(false);
    expect(result.current.isUpdateModalOpen).toBe(false);
    expect(result.current.confirmModalState.isOpen).toBe(false);
    expect(result.current.lightboxState.isOpen).toBe(false);
  });

  it('manages confirm modal open and close flow', () => {
    const { result } = renderHook(() => useModalManager());
    const onConfirmMock = () => {};

    act(() => {
      result.current.openConfirm({
        title: '确认删除文章封面？',
        message: '该操作可撤销',
        danger: true,
        onConfirm: onConfirmMock,
      });
    });

    expect(result.current.confirmModalState.isOpen).toBe(true);
    expect(result.current.confirmModalState.title).toBe('确认删除文章封面？');
    expect(result.current.confirmModalState.danger).toBe(true);

    act(() => {
      result.current.closeConfirm();
    });

    expect(result.current.confirmModalState.isOpen).toBe(false);
  });

  it('manages lightbox open and close flow', () => {
    const { result } = renderHook(() => useModalManager());

    act(() => {
      result.current.openLightbox('https://example.com/pic.jpg', '预览大图');
    });

    expect(result.current.lightboxState.isOpen).toBe(true);
    expect(result.current.lightboxState.url).toBe('https://example.com/pic.jpg');
    expect(result.current.lightboxState.title).toBe('预览大图');

    act(() => {
      result.current.closeLightbox();
    });

    expect(result.current.lightboxState.isOpen).toBe(false);
  });

  it('allows toggling individual modal open states directly', () => {
    const { result } = renderHook(() => useModalManager());

    act(() => {
      result.current.setIsSettingsOpen(true);
      result.current.setIsCreatePostOpen(true);
    });

    expect(result.current.isSettingsOpen).toBe(true);
    expect(result.current.isCreatePostOpen).toBe(true);
  });
});
