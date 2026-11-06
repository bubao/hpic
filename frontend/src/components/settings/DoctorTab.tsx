import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Stethoscope,
  RefreshCw,
  Download,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import { DoctorProbe, DoctorReport, DoctorStatus } from '../../types';
import { api } from '../../api';
import { useToast } from '../../context/ToastContext';

const STATUS_META: Record<DoctorStatus, { label: string; color: string; Icon: React.ComponentType<{ size?: number; color?: string }> }> = {
  ok: { label: '正常', color: '#34d399', Icon: CheckCircle2 },
  warn: { label: '警告', color: '#f59e0b', Icon: AlertTriangle },
  error: { label: '异常', color: '#f87171', Icon: XCircle },
  info: { label: '信息', color: '#60a5fa', Icon: Info },
};

const CATEGORY_ORDER: Array<{ id: string; label: string }> = [
  { id: 'app', label: '应用与运行时' },
  { id: 'environment', label: '运行环境' },
  { id: 'config', label: '配置与路径' },
  { id: 'storage', label: '本地存储' },
  { id: 'network', label: '网络连通性' },
];

export const DoctorTab: React.FC = () => {
  const toast = useToast();
  const [report, setReport] = useState<DoctorReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [includeNetwork, setIncludeNetwork] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const runDoctor = useCallback(async (withNetwork: boolean) => {
    setIsLoading(true);
    try {
      const res = await api.getDoctorReport(withNetwork);
      setReport(res);
      setExpanded(new Set());
    } catch (e: any) {
      toast.error('诊断执行失败: ' + (e?.message || '未知错误'));
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void runDoctor(includeNetwork);
    // 仅在首次挂载时自动诊断；includeNetwork 变更由用户点击「重新诊断」触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grouped = useMemo(() => {
    if (!report) return [];
    return CATEGORY_ORDER
      .map(cat => ({
        ...cat,
        probes: report.probes.filter(p => p.category === cat.id),
      }))
      .filter(group => group.probes.length > 0);
  }, [report]);

  const toggleExpanded = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const blob = await api.exportDoctorReport(includeNetwork);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      a.href = url;
      a.download = `hpic-diagnostics-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('诊断包已导出，可直接用于报障');
    } catch (e: any) {
      toast.error('导出诊断包失败: ' + (e?.message || '未知错误'));
    } finally {
      setIsExporting(false);
    }
  };

  const overall = report ? STATUS_META[report.overall] : null;

  return (
    <>
      <div className="settings-card">
        <div className="settings-card-title">
          <Stethoscope size={16} style={{ color: 'var(--accent-color)' }} />
          <span>只读自检诊断</span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12.5,
              color: 'var(--text-muted)',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <input
              type="checkbox"
              checked={includeNetwork}
              onChange={e => setIncludeNetwork(e.target.checked)}
            />
            包含网络连通性探测
          </label>

          <div style={{ flex: 1 }} />

          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => runDoctor(includeNetwork)}
            disabled={isLoading}
            style={{ border: '1px solid var(--border-color)' }}
          >
            <RefreshCw size={13} className={isLoading ? 'spin' : ''} />
            <span>{isLoading ? '诊断中...' : '重新诊断'}</span>
          </button>

          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={handleExport}
            disabled={isLoading || isExporting}
            style={{ border: '1px solid var(--border-color)' }}
          >
            <Download size={13} className={isExporting ? 'spin' : ''} />
            <span>{isExporting ? '导出中...' : '导出诊断包'}</span>
          </button>
        </div>

        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          所有探针均为只读探测，不会修改任何配置或数据；发现的修复建议仅作为显式第二步，由你确认后手动执行。
        </div>
      </div>

      {isLoading && !report && (
        <div className="settings-card" style={{ textAlign: 'center', padding: '28px 16px', color: 'var(--text-muted)' }}>
          <RefreshCw size={20} className="spin" style={{ marginBottom: 8 }} />
          <div style={{ fontSize: 13 }}>正在执行只读诊断...</div>
        </div>
      )}

      {report && (
        <>
          <div className="settings-card">
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 14px',
                  borderRadius: 'var(--radius-sm)',
                  border: `1px solid ${overall?.color}55`,
                  background: `${overall?.color}18`,
                  color: overall?.color,
                  fontSize: 13.5,
                  fontWeight: 600,
                }}
              >
                {overall && <overall.Icon size={16} />}
                <span>整体结论：{overall?.label}</span>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {(['ok', 'warn', 'error', 'info'] as DoctorStatus[]).map(status => {
                  const meta = STATUS_META[status];
                  const count = status === 'ok'
                    ? report.summary.ok
                    : status === 'warn'
                      ? report.summary.warn
                      : status === 'error'
                        ? report.summary.error
                        : report.summary.info;
                  return (
                    <span
                      key={status}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 12,
                        color: 'var(--text-muted)',
                      }}
                    >
                      <meta.Icon size={13} color={meta.color} />
                      {meta.label} {count}
                    </span>
                  );
                })}
              </div>
            </div>

            <div
              style={{
                marginTop: 12,
                paddingTop: 10,
                borderTop: '1px solid var(--border-color)',
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                fontSize: 12,
                color: 'var(--text-muted)',
              }}
            >
              <span>版本：<code>{report.version}</code></span>
              <span>平台：<code>{report.platform}</code></span>
              <span>Go：<code>{report.go_version}</code></span>
              <span>
                生成时间：<code>{new Date(report.generated_at).toLocaleString()}</code>
              </span>
            </div>
          </div>

          {grouped.map(group => {
            const groupCounts = group.probes.reduce(
              (acc, p) => {
                acc[p.status] = (acc[p.status] || 0) + 1;
                return acc;
              },
              {} as Record<DoctorStatus, number>
            );
            return (
              <div key={group.id} className="settings-card">
                <div
                  className="settings-card-title"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ShieldCheck size={16} style={{ color: 'var(--accent-color)' }} />
                    <span>{group.label}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {(Object.keys(groupCounts) as DoctorStatus[]).map(status => {
                      const GroupIcon = STATUS_META[status].Icon;
                      return (
                        <span
                          key={status}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            fontSize: 11.5,
                            color: STATUS_META[status].color,
                          }}
                        >
                          <GroupIcon size={13} />
                          {groupCounts[status]}
                        </span>
                      );
                    })}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {group.probes.map(probe => (
                    <ProbeRow
                      key={probe.id}
                      probe={probe}
                      expanded={expanded.has(probe.id)}
                      onToggle={() => toggleExpanded(probe.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </>
      )}
    </>
  );
};

const ProbeRow: React.FC<{
  probe: DoctorProbe;
  expanded: boolean;
  onToggle: () => void;
}> = ({ probe, expanded, onToggle }) => {
  const meta = STATUS_META[probe.status];
  const hasDetails = probe.fix || probe.details;

  return (
    <div
      style={{
        border: '1px solid var(--border-color)',
        borderLeft: `3px solid ${meta.color}`,
        borderRadius: 'var(--radius-sm)',
        background: 'var(--bg-tertiary)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          padding: '10px 12px',
        }}
      >
        <span style={{ flexShrink: 0, marginTop: 2, display: 'inline-flex' }}>
          <meta.Icon size={16} color={meta.color} />
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{probe.name}</span>
            <span
              style={{
                fontSize: 10.5,
                padding: '1px 6px',
                borderRadius: 8,
                border: `1px solid ${meta.color}55`,
                color: meta.color,
              }}
            >
              {meta.label}
            </span>
            {probe.duration && (
              <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{probe.duration}</span>
            )}
          </div>
          <div style={{ marginTop: 4, fontSize: 12.5, color: 'var(--text-secondary, #cbd5e1)', lineHeight: 1.6 }}>
            {probe.message}
          </div>
          {probe.fix && (
            <div
              style={{
                marginTop: 6,
                padding: '6px 8px',
                borderRadius: 6,
                background: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid rgba(245, 158, 11, 0.22)',
                fontSize: 12,
                color: '#fbbf24',
                lineHeight: 1.5,
              }}
            >
              <span style={{ fontWeight: 600 }}>建议修复：</span>
              {probe.fix}
            </div>
          )}
        </div>

        {hasDetails && (
          <button
            type="button"
            className="btn btn-icon btn-ghost btn-sm"
            onClick={onToggle}
            title={expanded ? '收起明细' : '展开明细'}
            style={{ flexShrink: 0 }}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        )}
      </div>

      {expanded && probe.details && (
        <div
          style={{
            padding: '8px 12px 10px',
            borderTop: '1px solid var(--border-color)',
            fontSize: 11.5,
            color: 'var(--text-muted)',
          }}
        >
          <pre
            style={{
              margin: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            }}
          >
            {JSON.stringify(probe.details, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};
