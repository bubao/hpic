import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nTab } from './I18nTab';
import { I18nProvider } from '../../i18n';
import { api } from '../../api';

vi.mock('../../api', () => ({
  api: {
    getI18nLocales: vi.fn().mockResolvedValue({
      locales: [
        { code: 'zh-CN', name: '简体中文 (zh-CN)', is_builtin: true, has_override: false },
        { code: 'en-US', name: 'English (en-US)', is_builtin: true, has_override: false },
      ],
      locales_dir: '/fake/locales',
    }),
    getI18nBundle: vi.fn().mockResolvedValue({
      header: { title: 'hpic' },
    }),
    saveI18nCustom: vi.fn().mockResolvedValue({ success: true }),
    resetI18nCustom: vi.fn().mockResolvedValue({ success: true }),
    openI18nFolder: vi.fn().mockResolvedValue({ success: true }),
  },
}));

describe('I18nTab Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('hpic_language', 'zh-CN');
  });

  it('renders language selector, actions and upload dropzone', async () => {
    render(
      <I18nProvider>
        <I18nTab />
      </I18nProvider>
    );

    expect(screen.getByText('语言与国际化')).toBeDefined();
    expect(screen.getByText('界面语言')).toBeDefined();
    expect(screen.getByText('打开语言包文件夹')).toBeDefined();
    expect(screen.getByText('刷新重载')).toBeDefined();
    expect(screen.getByText('导出当前完整语言包')).toBeDefined();
    expect(screen.getByText('上传与导入语言包')).toBeDefined();
    expect(screen.getByText('点击选择或将 JSON 语言包拖拽至此处')).toBeDefined();
  });

  it('triggers open folder when button is clicked', async () => {
    render(
      <I18nProvider>
        <I18nTab />
      </I18nProvider>
    );

    const openBtn = screen.getByText('打开语言包文件夹');
    fireEvent.click(openBtn);

    expect(api.openI18nFolder).toHaveBeenCalled();
  });

  it('triggers reload when reload button is clicked', async () => {
    render(
      <I18nProvider>
        <I18nTab />
      </I18nProvider>
    );

    const reloadBtn = screen.getByText('刷新重载');
    fireEvent.click(reloadBtn);

    await waitFor(() => {
      expect(api.getI18nLocales).toHaveBeenCalled();
    });
  });

  it('handles file upload and saves custom locale', async () => {
    render(
      <I18nProvider>
        <I18nTab />
      </I18nProvider>
    );

    const file = new File([JSON.stringify({ header: { title: 'Japanese Title' } })], 'ja-JP.json', {
      type: 'application/json',
    });

    const dropzone = screen.getByText('点击选择或将 JSON 语言包拖拽至此处');
    fireEvent.drop(dropzone, {
      dataTransfer: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(api.saveI18nCustom).toHaveBeenCalledWith(
        'ja-JP',
        expect.objectContaining({ header: { title: 'Japanese Title' } })
      );
    });
  });
});
