import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { DoctorTab } from './DoctorTab';
import { api } from '../../api';
import { ToastProvider } from '../../context/ToastContext';
import { DoctorReport } from '../../types';

vi.mock('../../api', () => ({
  api: {
    getDoctorReport: vi.fn(),
    exportDoctorReport: vi.fn(),
  },
}));

const mockReport: DoctorReport = {
  version: 'v0.0.2-test',
  platform: 'darwin/arm64',
  go_version: 'go1.27.2',
  overall: 'warn',
  summary: { total: 3, ok: 1, warn: 1, error: 0, info: 1 },
  probes: [
    {
      id: 'app.version',
      name: '运行时版本',
      category: 'app',
      status: 'ok',
      message: 'hpic v0.0.2-test',
      duration: '1ms',
    },
    {
      id: 'environment.node',
      name: 'Node.js 运行时',
      category: 'environment',
      status: 'warn',
      message: 'Node.js 可执行文件无法正常运行',
      fix: '重新安装 Node.js，或在系统设置中修正 PATH 后重启 hpic',
      duration: '12ms',
      details: { node_path: '/usr/local/bin/node' },
    },
    {
      id: 'config.proxy',
      name: '代理配置',
      category: 'config',
      status: 'info',
      message: '未配置代理（直连模式）',
      duration: '0ms',
    },
  ],
  generated_at: '2026-11-06T10:00:00Z',
};

describe('DoctorTab Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders report summary and grouped probes after diagnosis', async () => {
    (api.getDoctorReport as any).mockResolvedValue(mockReport);

    render(
      <ToastProvider>
        <DoctorTab />
      </ToastProvider>
    );

    expect(screen.getByText('只读自检诊断')).toBeDefined();

    // 默认包含网络探测
    await waitFor(() => {
      expect(api.getDoctorReport).toHaveBeenCalledWith(true);
    });

    // 整体结论与汇总计数
    expect(await screen.findByText('整体结论：警告')).toBeDefined();
    expect(screen.getByText('hpic v0.0.2-test')).toBeDefined();
    expect(screen.getByText('运行环境')).toBeDefined();
    expect(screen.getByText('Node.js 运行时')).toBeDefined();
    expect(screen.getByText('重新安装 Node.js，或在系统设置中修正 PATH 后重启 hpic')).toBeDefined();
  });

  it('propagates includeNetwork=false when checkbox is toggled and refreshed', async () => {
    (api.getDoctorReport as any).mockResolvedValue(mockReport);

    render(
      <ToastProvider>
        <DoctorTab />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(api.getDoctorReport).toHaveBeenCalledWith(true);
    });

    const checkbox = screen.getByRole('checkbox');
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.click(checkbox);

    fireEvent.click(screen.getByText('重新诊断'));

    await waitFor(() => {
      expect(api.getDoctorReport).toHaveBeenLastCalledWith(false);
    });
  });
});
