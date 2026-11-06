import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { CommandPalette } from './CommandPalette';
import { CommandItem } from '../types';

describe('CommandPalette', () => {
  const dummyCommands: CommandItem[] = [
    {
      id: 'theme.dark',
      group: 'theme',
      title: '切换为暗黑主题',
      keywords: ['dark', 'ahzt', 'anheizhuti'],
      shortcut: '⌘D',
      run: vi.fn(),
    },
    {
      id: 'theme.light',
      group: 'theme',
      title: '切换为亮色主题',
      keywords: ['light', 'lszt', 'liangsezhuti'],
      run: vi.fn(),
    },
    {
      id: 'hexo.generate',
      group: 'hexo',
      title: '生成静态页面',
      keywords: ['generate', 'scjt', 'shengcheng'],
      shortcut: '⌘G',
      run: vi.fn(),
    },
    {
      id: 'settings.open',
      group: 'settings',
      title: '打开偏好设置',
      keywords: ['settings', 'config', 'sz', 'shezhi'],
      shortcut: '⌘,',
      run: vi.fn(),
    },
    {
      id: 'tools.doctor',
      group: 'tools',
      title: '健康体检与自检诊断',
      keywords: ['doctor', 'zd', 'zhenduan'],
      run: vi.fn(),
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <CommandPalette isOpen={false} onClose={vi.fn()} commands={dummyCommands} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders input and all active commands when isOpen is true', () => {
    render(
      <CommandPalette isOpen={true} onClose={vi.fn()} commands={dummyCommands} />
    );
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByPlaceholderText(/搜索全局命令/)).toBeDefined();

    const options = screen.getAllByRole('option');
    expect(options.length).toBe(dummyCommands.length);
  });

  it('filters commands by keyword and pinyin abbreviation', () => {
    render(
      <CommandPalette isOpen={true} onClose={vi.fn()} commands={dummyCommands} />
    );
    const input = screen.getByRole('textbox');

    // 拼音首字母匹配: "scjt" -> "生成静态页面"
    fireEvent.change(input, { target: { value: 'scjt' } });
    const options = screen.getAllByRole('option');
    expect(options.length).toBe(1);
    expect(options[0].textContent).toContain('生成静态页面');
  });

  it('navigates with ArrowDown and ArrowUp, then executes with Enter', () => {
    const onClose = vi.fn();
    render(
      <CommandPalette isOpen={true} onClose={onClose} commands={dummyCommands} />
    );
    const input = screen.getByRole('textbox');

    // 默认第 0 项选中
    let options = screen.getAllByRole('option');
    expect(options[0].getAttribute('aria-selected')).toBe('true');

    // 按下 ArrowDown -> 选中第 1 项
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    options = screen.getAllByRole('option');
    expect(options[1].getAttribute('aria-selected')).toBe('true');

    // 回车执行选中的第 1 项
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onClose).toHaveBeenCalled();
  });

  it('closes when pressing Escape', () => {
    const onClose = vi.fn();
    render(
      <CommandPalette isOpen={true} onClose={onClose} commands={dummyCommands} />
    );
    const input = screen.getByRole('textbox');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('closes when clicking backdrop', () => {
    const onClose = vi.fn();
    render(
      <CommandPalette isOpen={true} onClose={onClose} commands={dummyCommands} />
    );
    const backdrop = screen.getByRole('dialog');
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it('executes command when clicking an item directly', () => {
    const onClose = vi.fn();
    render(
      <CommandPalette isOpen={true} onClose={onClose} commands={dummyCommands} />
    );
    const item = screen.getByText('健康体检与自检诊断');
    fireEvent.click(item);
    expect(onClose).toHaveBeenCalled();
  });

  it('shows empty state when no commands match query', () => {
    render(
      <CommandPalette isOpen={true} onClose={vi.fn()} commands={dummyCommands} />
    );
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'nonexistent-query-xyz' } });

    expect(screen.getByText('未找到匹配的命令或设置项')).toBeDefined();
  });
});
