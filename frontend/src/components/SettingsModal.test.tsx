import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SettingsModal } from './SettingsModal';
import { Config } from '../types';
import { ToastProvider } from '../context/ToastContext';
import { api } from '../api';

describe('SettingsModal full-coverage tests', () => {
  const dummyConfig: Config = {
    hexo_dir: '/fake/hexo',
    posts_dir: '/fake/hexo/source/_posts',
    cover_fields: ['index_img', 'banner_img'],
    date_field: 'date',
    updated_field: 'updated',
    orientation: 'landscape',
    image_size: 'large',
    min_width: 1200,
    min_height: 600,
    image_width: 1200,
    image_quality: 80,
    github_owner: 'bubao',
    socialify_pattern: 'Signal',
    socialify_theme: 'Dark',
    proxy: 'http://127.0.0.1:7890',
    deploy_mode: 'git',
    git_commit_template: 'chore(cover): update cover for {title}',
    auto_search: true,
    infinite_scroll: false,
    config_file_path: '/Users/test/.hpicrc',
    version: '0.0.2',
  };

  it('should not render dialog when isOpen is false', () => {
    render(
      <ToastProvider>
        <SettingsModal
          isOpen={false}
          onClose={vi.fn()}
          config={dummyConfig}
          onSaved={vi.fn()}
        />
      </ToastProvider>
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('should render full-coverage overlay with back button and categories', () => {
    const handleClose = vi.fn();
    render(
      <ToastProvider>
        <SettingsModal
          isOpen={true}
          onClose={handleClose}
          config={dummyConfig}
          onSaved={vi.fn()}
        />
      </ToastProvider>
    );

    // 检查左上角返回按钮
    const backBtn = screen.getByTitle('返回主界面 (Esc)');
    expect(backBtn).toBeDefined();

    // 检查分类导航栏
    expect(screen.getAllByText('博客与路径').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('图库与尺寸')).toBeDefined();
    expect(screen.getByText('外观与样式')).toBeDefined();
    expect(screen.getByText('开源与生成器')).toBeDefined();
    expect(screen.getByText('网络与部署')).toBeDefined();
    expect(screen.getByText('关于与更新')).toBeDefined();

    // 点击返回按钮触发 onClose
    fireEvent.click(backBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('should switch categories when category items are clicked', () => {
    render(
      <ToastProvider>
        <SettingsModal
          isOpen={true}
          onClose={vi.fn()}
          config={dummyConfig}
          onSaved={vi.fn()}
        />
      </ToastProvider>
    );

    // 初始处于 "博客与路径"
    expect(screen.getByText('Hexo 博客根目录 (hexo_dir):')).toBeDefined();

    // 切换到 "图库与尺寸"
    fireEvent.click(screen.getByText('图库与尺寸'));
    expect(screen.getByText('默认构图比例 (orientation):')).toBeDefined();
    expect(screen.getByText('外部图片压缩宽度 (image_width):')).toBeDefined();

    // 切换到 "网络与部署"
    fireEvent.click(screen.getByText('网络与部署'));
    expect(screen.getByText('网络代理地址 (支持 HTTP / SOCKS5):')).toBeDefined();
    expect(screen.getByText('发布模式 (deploy_mode):')).toBeDefined();

    // 切换到 "关于与更新"
    fireEvent.click(screen.getByText('关于与更新'));
    expect(screen.getByText('hpic 桌面客户端')).toBeDefined();
    expect(screen.getByText('检查新版本')).toBeDefined();
  });

  it('should handle Escape key to trigger onClose', () => {
    const handleClose = vi.fn();
    render(
      <ToastProvider>
        <SettingsModal
          isOpen={true}
          onClose={handleClose}
          config={dummyConfig}
          onSaved={vi.fn()}
        />
      </ToastProvider>
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('should save updated config on clicking save button', async () => {
    const handleSaved = vi.fn();
    const handleClose = vi.fn();
    vi.spyOn(api, 'saveConfig').mockResolvedValueOnce({
      success: true,
      config: { ...dummyConfig, hexo_dir: '/new/path' },
    });

    render(
      <ToastProvider>
        <SettingsModal
          isOpen={true}
          onClose={handleClose}
          config={dummyConfig}
          onSaved={handleSaved}
        />
      </ToastProvider>
    );

    const saveBtn = screen.getByText('保存并应用');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(api.saveConfig).toHaveBeenCalled();
      expect(handleSaved).toHaveBeenCalled();
      expect(handleClose).toHaveBeenCalled();
    });
  });

  it('should switch to appearance tab and inject cyberpunk preset', () => {
    render(
      <ToastProvider>
        <SettingsModal
          isOpen={true}
          onClose={vi.fn()}
          config={dummyConfig}
          onSaved={vi.fn()}
        />
      </ToastProvider>
    );

    const appearanceNav = screen.getByText('外观与样式');
    fireEvent.click(appearanceNav);

    expect(screen.getByText('界面主题色彩模式')).toBeDefined();
    expect(screen.getByText('亮色清爽 (Light)')).toBeDefined();

    // 点击亮色模式
    const lightCard = screen.getByText('亮色清爽 (Light)');
    fireEvent.click(lightCard);

    // 点击赛博霓虹预设按钮
    const cyberpunkBtn = screen.getByText('赛博霓虹');
    fireEvent.click(cyberpunkBtn);

    const textarea = screen.getByPlaceholderText(/例如自定义强调色与圆角/i) as HTMLTextAreaElement;
    expect(textarea.value).toContain('赛博朋克深紫霓虹风格');
  });
});
