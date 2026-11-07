import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { ErrorBoundary } from '../ErrorBoundary';
import { SectionErrorFallback } from './SectionErrorFallback';

describe('SectionErrorFallback 局部边界', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('正常渲染时不出现兜底', () => {
    render(
      <ErrorBoundary fallback={props => <SectionErrorFallback title="测试区" {...props} />}>
        <div data-testid="child">normal child</div>
      </ErrorBoundary>
    );

    expect(screen.getByTestId('child')).toBeDefined();
    expect(screen.queryByTestId('section-error-fallback')).toBeNull();
  });

  it('子组件抛错时只显示该区域兜底，相邻区域仍可用', () => {
    const Boom: React.FC = () => {
      throw new Error('boom-render');
    };

    render(
      <div>
        <div data-testid="sibling">sibling-alive</div>
        <ErrorBoundary fallback={props => <SectionErrorFallback title="测试区" {...props} />}>
          <Boom />
        </ErrorBoundary>
        <div data-testid="bottom">bottom-alive</div>
      </div>
    );

    const fallback = screen.getByTestId('section-error-fallback');
    expect(fallback).toBeDefined();
    expect(screen.getByText('测试区渲染失败')).toBeDefined();
    expect(screen.getByText(/boom-render/)).toBeDefined();

    // 关键点：相邻区域不受影响，依然可用
    expect(screen.getByTestId('sibling')).toBeDefined();
    expect(screen.getByTestId('bottom')).toBeDefined();
    expect(screen.getByText('sibling-alive')).toBeDefined();
    expect(screen.getByText('bottom-alive')).toBeDefined();
  });

  it('点击「重试」可恢复一次性渲染异常的区域', () => {
    let shouldThrow = true;
    const Flaky: React.FC = () => {
      if (shouldThrow) throw new Error('first-only-flake');
      return <div data-testid="recovered">recovered</div>;
    };

    render(
      <ErrorBoundary fallback={props => <SectionErrorFallback title="测试区" {...props} />}>
        <Flaky />
      </ErrorBoundary>
    );

    expect(screen.getByTestId('section-error-fallback')).toBeDefined();

    // 模拟异常条件消失（如 chunk 加载完成 / 数据恢复）后再点击重试
    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: '重试' }));

    expect(screen.getByTestId('recovered')).toBeDefined();
    expect(screen.queryByTestId('section-error-fallback')).toBeNull();
  });

  it('fill 变体附加 is-fill 类，便于大区块填满占位', () => {
    render(<SectionErrorFallback title="侧边栏" fill error={new Error('x')} resetErrorBoundary={() => {}} />);
    expect(screen.getByTestId('section-error-fallback').className).toContain('is-fill');
  });

  it('直接渲染时把「重试」透传给 resetErrorBoundary', () => {
    // SectionErrorFallback 自身不调用 reload，仅暴露 resetErrorBoundary
    const reset = vi.fn();
    render(<SectionErrorFallback title="封面区" error={new Error('y')} resetErrorBoundary={reset} />);

    fireEvent.click(screen.getByRole('button', { name: '重试' }));

    expect(reset).toHaveBeenCalledTimes(1);
  });

});
