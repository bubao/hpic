import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw, Trash2 } from 'lucide-react';

export interface ErrorBoundaryFallbackProps {
  error: Error;
  resetErrorBoundary: () => void;
}

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode | ((props: ErrorBoundaryFallbackProps) => ReactNode);
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  onReset?: () => void;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    this.props.onError?.(error, errorInfo);
    console.error('[ErrorBoundary] Caught render error:', error, errorInfo);
  }

  resetErrorBoundary = () => {
    this.props.onReset?.();
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  handleReload = () => {
    window.location.reload();
  };

  handleResetAndReload = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (e) {
      console.error('[ErrorBoundary] Failed to clear storage:', e);
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        if (typeof this.props.fallback === 'function') {
          return this.props.fallback({
            error: this.state.error || new Error('Unknown error'),
            resetErrorBoundary: this.resetErrorBoundary,
          });
        }
        return this.props.fallback;
      }

      const { error, errorInfo } = this.state;
      const errorMessage = error?.message || '未知错误';
      const errorStack = error?.stack || '';
      const componentStack = errorInfo?.componentStack || '';

      return (
        <div className="error-boundary-container" role="alert">
          <div className="error-boundary-card">
            <div className="error-boundary-header">
              <div className="error-boundary-icon-wrapper" aria-hidden="true" data-testid="error-warning-icon">
                <AlertTriangle size={26} />
              </div>
              <div>
                <h2 className="error-boundary-title">页面遇到意外错误</h2>
                <p className="error-boundary-desc">
                  应用程序在渲染过程中遇到了未捕获的异常，已自动阻断白屏。您可以尝试刷新页面，或在异常持续时重置本地配置与缓存恢复。
                </p>
              </div>
            </div>

            <div className="error-boundary-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={this.handleReload}
              >
                <RotateCcw size={15} />
                刷新页面
              </button>
              <button
                type="button"
                className="btn btn-danger-ghost"
                onClick={this.handleResetAndReload}
              >
                <Trash2 size={15} />
                重置配置并重载
              </button>
            </div>

            <details className="error-boundary-details" data-testid="error-details">
              <summary className="error-boundary-summary">
                查看错误堆栈详情
              </summary>
              <div className="error-boundary-details-body">
                <div className="error-boundary-message">
                  <strong>错误信息：</strong>
                  <span>{errorMessage}</span>
                </div>
                {(errorStack || componentStack) && (
                  <pre className="error-boundary-content" data-testid="error-stack">
                    {errorStack}
                    {componentStack ? `\n\n组件调用栈 (Component Stack):${componentStack}` : ''}
                  </pre>
                )}
              </div>
            </details>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
