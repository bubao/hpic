import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  action?: ToastAction;
  duration?: number;
}

interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  action?: ToastAction;
}

interface ToastContextType {
  toast: {
    success: (msg: string, opts?: ToastOptions) => void;
    error: (msg: string, opts?: ToastOptions) => void;
    info: (msg: string, opts?: ToastOptions) => void;
  };
}

const ToastContext = createContext<ToastContextType | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((type: ToastType, message: string, opts?: ToastOptions) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, type, message, action: opts?.action }]);

    const duration = opts?.duration || (opts?.action ? 5000 : 3200);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = useMemo(() => ({
    success: (msg: string, opts?: ToastOptions) => addToast('success', msg, opts),
    error: (msg: string, opts?: ToastOptions) => addToast('error', msg, opts),
    info: (msg: string, opts?: ToastOptions) => addToast('info', msg, opts),
  }), [addToast]);

  const contextValue = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div
        style={{
          position: 'fixed',
          top: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 10,
          pointerEvents: 'none',
        }}
      >
        {toasts.map(t => (
          <div
            key={t.id}
            style={{
              pointerEvents: 'auto',
              minWidth: 260,
              maxWidth: 480,
              padding: '10px 16px',
              borderRadius: '8px',
              background: 'var(--bg-secondary)',
              border: `1px solid ${
                t.type === 'success'
                  ? 'rgba(16, 185, 129, 0.45)'
                  : t.type === 'error'
                  ? 'rgba(239, 68, 68, 0.45)'
                  : 'var(--border-hover)'
              }`,
              boxShadow: 'var(--shadow-lg)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              animation: 'toast-in 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
              color: 'var(--text-primary)',
              fontSize: 13,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {t.type === 'success' && <CheckCircle2 size={16} color="#10b981" style={{ flexShrink: 0 }} />}
              {t.type === 'error' && <AlertCircle size={16} color="#ef4444" style={{ flexShrink: 0 }} />}
              {t.type === 'info' && <Info size={16} color="var(--accent-color)" style={{ flexShrink: 0 }} />}
              <span style={{ wordBreak: 'break-word', lineHeight: 1.4, color: 'var(--text-primary)' }}>{t.message}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {t.action && (
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    t.action?.onClick();
                    removeToast(t.id);
                  }}
                  style={{
                    background: 'var(--accent-bg)',
                    border: '1px solid var(--accent-color)',
                    color: 'var(--accent-color)',
                    padding: '2px 8px',
                    borderRadius: 4,
                    fontSize: 11.5,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {t.action.label}
                </button>
              )}
              <button
                onClick={() => removeToast(t.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: 2,
                  display: 'flex',
                }}
              >
                <X size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return ctx.toast;
};
