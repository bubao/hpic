import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { useHexoRunner } from './useHexoRunner';
import { api } from '../api';
import { ToastProvider } from '../context/ToastContext';

vi.mock('../api', () => ({
  api: {
    getHexoStatus: vi.fn(),
    startHexoServer: vi.fn(),
    stopHexoServer: vi.fn(),
    openSystemURL: vi.fn(),
    runHexoClean: vi.fn(),
    runHexoGenerate: vi.fn(),
  },
}));

describe('useHexoRunner Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ToastProvider>{children}</ToastProvider>
  );

  it('fetches hexo status on mount', async () => {
    (api.getHexoStatus as any).mockResolvedValue({
      server_running: false,
      port: 4000,
      uptime_seconds: 0,
      generate_running: false,
      generate_watch: false,
      hexo_root: '/blog',
      hexo_bin: 'hexo',
      posts_dir: '/blog/source/_posts',
    });

    const { result } = renderHook(() => useHexoRunner(), { wrapper });

    await act(async () => {
      await result.current.fetchStatus();
    });

    expect(result.current.hexoStatus?.server_running).toBe(false);
    expect(result.current.hexoStatus?.port).toBe(4000);
  });

  it('starts hexo server when currently stopped', async () => {
    (api.getHexoStatus as any).mockResolvedValue({
      server_running: false,
      port: 4000,
      uptime_seconds: 0,
      generate_running: false,
      generate_watch: false,
      hexo_root: '/blog',
      hexo_bin: 'hexo',
      posts_dir: '/blog/source/_posts',
    });
    (api.startHexoServer as any).mockResolvedValueOnce({
      success: true,
      status: { server_running: true, port: 4000, uptime_seconds: 1 },
    });

    const { result } = renderHook(() => useHexoRunner(), { wrapper });

    await act(async () => {
      await result.current.handleToggleServer();
    });

    expect(api.startHexoServer).toHaveBeenCalledWith(4000);
    expect(result.current.hexoStatus?.server_running).toBe(true);
  });

  it('stops hexo server when currently running', async () => {
    (api.getHexoStatus as any).mockResolvedValue({
      server_running: true,
      port: 4000,
      uptime_seconds: 10,
    });
    (api.stopHexoServer as any).mockResolvedValueOnce({
      success: true,
      status: { server_running: false, port: 4000, uptime_seconds: 0 },
    });

    const { result } = renderHook(() => useHexoRunner(), { wrapper });

    act(() => {
      result.current.setHexoStatus({ server_running: true, port: 4000 } as any);
    });

    await act(async () => {
      await result.current.handleToggleServer();
    });

    expect(api.stopHexoServer).toHaveBeenCalled();
    expect(result.current.hexoStatus?.server_running).toBe(false);
  });

  it('opens preview URL with hexo port', () => {
    const { result } = renderHook(() => useHexoRunner(), { wrapper });

    act(() => {
      result.current.setHexoStatus({ server_running: true, port: 5000 } as any);
    });

    act(() => {
      result.current.handlePreview();
    });

    expect(api.openSystemURL).toHaveBeenCalledWith('http://localhost:5000');
  });

  it('executes handleClean successfully', async () => {
    (api.runHexoClean as any).mockResolvedValueOnce({
      success: true,
      duration: '1.2s',
    });
    (api.getHexoStatus as any).mockResolvedValue({
      server_running: false,
      port: 4000,
      uptime_seconds: 0,
    });

    const { result } = renderHook(() => useHexoRunner(), { wrapper });

    await act(async () => {
      await result.current.handleClean();
    });

    expect(api.runHexoClean).toHaveBeenCalled();
  });
});
