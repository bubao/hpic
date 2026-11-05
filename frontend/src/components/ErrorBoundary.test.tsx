import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { ErrorBoundary } from './ErrorBoundary';

// Helper component that throws an error when triggerError is true
const ProblemChild: React.FC<{ shouldThrow?: boolean; message?: string }> = ({
  shouldThrow = true,
  message = 'Test render error',
}) => {
  if (shouldThrow) {
    throw new Error(message);
  }
  return <div data-testid="child-content">Normal Content</div>;
};

describe('ErrorBoundary Component', () => {
  const reloadMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Suppress console.error during expected throw tests
    vi.spyOn(console, 'error').mockImplementation(() => {});

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...window.location,
        reload: reloadMock,
      },
    });

    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <ProblemChild shouldThrow={false} />
      </ErrorBoundary>
    );

    expect(screen.getByTestId('child-content')).toBeDefined();
    expect(screen.getByText('Normal Content')).toBeDefined();
    expect(screen.queryByText('页面遇到意外错误')).toBeNull();
  });

  it('catches render error and displays recovery UI', () => {
    render(
      <ErrorBoundary>
        <ProblemChild shouldThrow={true} message="Crash in test component" />
      </ErrorBoundary>
    );

    // 1. Header with friendly error message and warning icon
    expect(screen.getByText('页面遇到意外错误')).toBeDefined();
    expect(screen.getByTestId('error-warning-icon')).toBeDefined();
    expect(screen.getByText(/应用程序在渲染过程中遇到了未捕获的异常/)).toBeDefined();

    // 2. Action buttons
    expect(screen.getByRole('button', { name: /刷新页面/ })).toBeDefined();
    expect(screen.getByRole('button', { name: /重置配置并重载/ })).toBeDefined();

    // 3. Collapsible error stack details
    expect(screen.getByTestId('error-details')).toBeDefined();
    expect(screen.getByText('查看错误堆栈详情')).toBeDefined();
    expect(screen.getByText('Crash in test component')).toBeDefined();
  });

  it('triggers window.location.reload when clicking "刷新页面"', () => {
    render(
      <ErrorBoundary>
        <ProblemChild shouldThrow={true} />
      </ErrorBoundary>
    );

    const reloadButton = screen.getByRole('button', { name: /刷新页面/ });
    fireEvent.click(reloadButton);

    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it('clears localStorage and reloads when clicking "重置配置并重载"', () => {
    localStorage.setItem('hpic_test_key', 'test_value');
    sessionStorage.setItem('hpic_session_key', 'session_value');

    expect(localStorage.getItem('hpic_test_key')).toBe('test_value');

    render(
      <ErrorBoundary>
        <ProblemChild shouldThrow={true} />
      </ErrorBoundary>
    );

    const resetButton = screen.getByRole('button', { name: /重置配置并重载/ });
    fireEvent.click(resetButton);

    expect(localStorage.getItem('hpic_test_key')).toBeNull();
    expect(sessionStorage.getItem('hpic_session_key')).toBeNull();
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it('supports custom fallback ReactNode', () => {
    render(
      <ErrorBoundary fallback={<div data-testid="custom-fallback">Custom Crash View</div>}>
        <ProblemChild shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByTestId('custom-fallback')).toBeDefined();
    expect(screen.getByText('Custom Crash View')).toBeDefined();
    expect(screen.queryByText('页面遇到意外错误')).toBeNull();
  });

  it('supports custom fallback render function and resetErrorBoundary', () => {
    const handleReset = vi.fn();

    render(
      <ErrorBoundary
        onReset={handleReset}
        fallback={({ error, resetErrorBoundary }) => (
          <div>
            <span data-testid="err-msg">{error.message}</span>
            <button data-testid="btn-reset" onClick={resetErrorBoundary}>
              Retry
            </button>
          </div>
        )}
      >
        <ProblemChild shouldThrow={true} message="Function error test" />
      </ErrorBoundary>
    );

    expect(screen.getByTestId('err-msg').textContent).toBe('Function error test');

    const resetBtn = screen.getByTestId('btn-reset');
    fireEvent.click(resetBtn);

    expect(handleReset).toHaveBeenCalledTimes(1);
  });

  it('invokes onError prop when error is caught', () => {
    const onErrorMock = vi.fn();

    render(
      <ErrorBoundary onError={onErrorMock}>
        <ProblemChild shouldThrow={true} message="Notify error" />
      </ErrorBoundary>
    );

    expect(onErrorMock).toHaveBeenCalledTimes(1);
    expect(onErrorMock.mock.calls[0][0].message).toBe('Notify error');
  });
});
