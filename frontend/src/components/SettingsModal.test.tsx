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
    expect(screen.getByText('卡片生成器')).toBeDefined();
    expect(screen.getByText('网络与部署')).toBeDefined();
    expect(screen.getByText('关于与更新')).toBeDefined();

    // 点击返回按钮触发 onClose
    fireEvent.click(backBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('should switch categories when category items are clicked', async () => {
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

    // 初始处于 "博客与路径"（懒加载 chunk 就绪后渲染）
    expect(await screen.findByText('Hexo 博客根目录 (hexo_dir):')).toBeDefined();

    // 切换到 "图库与尺寸"
    fireEvent.click(screen.getByText('图库与尺寸'));
    expect(await screen.findByText('默认构图比例 (orientation):')).toBeDefined();
    expect(screen.getByText('外部图片压缩宽度 (image_width):')).toBeDefined();

    // 切换到 "网络与部署"
    fireEvent.click(screen.getByText('网络与部署'));
    expect(await screen.findByText('网络代理地址 (支持 HTTP / SOCKS5):')).toBeDefined();
    expect(screen.getByText('发布模式 (deploy_mode):')).toBeDefined();

    // 切换到 "关于与更新"
    fireEvent.click(screen.getByText('关于与更新'));
    expect(await screen.findByText('hpic 桌面客户端')).toBeDefined();
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
      // 应用后保持设置面板展开，不自动退出
      expect(handleClose).not.toHaveBeenCalled();
    });
  });

  it('should switch to appearance tab and inject cyberpunk preset', async () => {
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

    // 统一后的外观预设卡片（懒加载 chunk 就绪后渲染）
    expect(await screen.findByText('外观样式')).toBeDefined();
    expect(screen.getByText('亮色清爽')).toBeDefined();

    // 展开自定义 CSS 面板以读取内容
    fireEvent.click(screen.getByText('自定义 CSS'));

    // 点击亮色预设
    fireEvent.click(screen.getByText('亮色清爽'));

    // 点击赛博霓虹预设
    fireEvent.click(screen.getByText('赛博霓虹'));

    const textarea = screen.getByPlaceholderText(/例如自定义强调色与圆角/i) as HTMLTextAreaElement;
    expect(textarea.value).toContain('赛博朋克深紫霓虹风格');
  });

  it('should intercept tab switching and closing when form is dirty', async () => {
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

    // 修改 hexoDir 使表单处于 dirty 状态（懒加载 chunk 就绪后再操作）
    const hexoInput = await screen.findByPlaceholderText('/Users/username/my-hexo-blog');
    fireEvent.change(hexoInput, { target: { value: '/Users/test/dirty-hexo' } });

    // 尝试切换到 "图库与尺寸"
    fireEvent.click(screen.getByText('图库与尺寸'));

    // 验证弹出未保存拦截弹窗
    expect(screen.getByText('检测到未保存的设置更改')).toBeDefined();
    expect(screen.getByText('保存更改')).toBeDefined();
    expect(screen.getByText('放弃更改')).toBeDefined();

    // 点击“取消 (留在此页)”
    fireEvent.click(screen.getByText('取消 (留在此页)'));
    expect(screen.queryByText('检测到未保存的设置更改')).toBeNull();

    // 点击右上角/左上角“取消”尝试关闭
    const cancelBtn = screen.getByRole('button', { name: '取消' });
    fireEvent.click(cancelBtn);
    expect(screen.getByText('检测到未保存的设置更改')).toBeDefined();

    // 点击“放弃更改”后允许继续关闭
    fireEvent.click(screen.getByText('放弃更改'));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('should render user custom theme presets group and apply custom preset', async () => {
    const spy = vi.spyOn(api, 'getThemePresets').mockResolvedValue({
      themes_dir: '/tmp/hpic-themes',
      presets: [
        { id: 'dark', name: '暗色极客', desc: '深黑沉浸', theme: 'dark', css: '', is_builtin: true },
        { id: 'light', name: '亮色清爽', desc: '纸白纯净', theme: 'light', css: '', is_builtin: true },
        { id: 'auto', name: '跟随系统', desc: '自动适配', theme: 'auto', css: '', is_builtin: true },
        { id: 'cyberpunk', name: '赛博霓虹', desc: '深紫霓虹', theme: 'dark', css: '', is_builtin: true },
        { id: 'minimal', name: '极简墨水', desc: '纸墨极简', theme: 'light', css: '', is_builtin: true },
        {
          id: 'my-theme',
          name: '我的主题',
          desc: '用户自定义皮肤',
          theme: 'light',
          css: ':root { --accent-color: #123456; }',
          is_builtin: false,
        },
      ],
    });

    try {
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

      fireEvent.click(screen.getByText('外观与样式'));
      expect(await screen.findByText('外观样式')).toBeDefined();

      // 用户自定义主题分组（来自主题预设目录）
      expect(await screen.findByText('用户自定义主题')).toBeDefined();
      expect(screen.getByText('我的主题')).toBeDefined();

      // 展开自定义 CSS 面板后点击自定义预设，读取注入内容
      fireEvent.click(screen.getByText('自定义 CSS'));
      fireEvent.click(screen.getByText('我的主题'));
      const textarea = screen.getByPlaceholderText(/例如自定义强调色与圆角/i) as HTMLTextAreaElement;
      expect(textarea.value).toContain('--accent-color: #123456');
    } finally {
      spy.mockRestore();
    }
  });
});
