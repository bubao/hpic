import React, { useState, useEffect, useRef } from 'react';
import { useI18n } from '../../i18n';
import { Icon } from '../common/Icon';

export const I18nTab: React.FC = () => {
  const {
    language,
    setLanguage,
    availableLocales,
    localesDir,
    reloadLocales,
    saveCustomOverride,
    resetCustomOverride,
    openLocalesFolder,
    uploadLocaleFile,
    exportCurrentBundle,
    t,
  } = useI18n();

  const [overrideJsonText, setOverrideJsonText] = useState('');
  const [isReloading, setIsReloading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 切换提示反馈自动淡出
  useEffect(() => {
    if (feedbackMsg) {
      const timer = setTimeout(() => setFeedbackMsg(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [feedbackMsg]);

  // 打开本地文件夹
  const handleOpenFolder = async () => {
    try {
      await openLocalesFolder();
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err?.message || '无法打开文件夹' });
    }
  };

  // 刷新重载语言包
  const handleReload = async () => {
    setIsReloading(true);
    try {
      await reloadLocales();
      setFeedbackMsg({ type: 'success', text: t('i18n.refreshSuccess') });
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err?.message || '刷新重载失败' });
    } finally {
      setIsReloading(false);
    }
  };

  // 导出当前语言包
  const handleExport = () => {
    try {
      const content = exportCurrentBundle();
      const blob = new Blob([content], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${language}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setFeedbackMsg({ type: 'success', text: `已成功导出 ${language}.json` });
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err?.message || '导出失败' });
    }
  };

  // 上传文件通用处理器 (支持文件对话框选择与拖拽)
  const processUploadedFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.json')) {
      setFeedbackMsg({ type: 'error', text: t('i18n.uploadInvalidFile') });
      return;
    }

    setIsUploading(true);
    try {
      const langCode = await uploadLocaleFile(file);
      setFeedbackMsg({
        type: 'success',
        text: `已成功导入并保存至配置文件夹：${langCode}.json，已为您自动切换！`,
      });
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err?.message || '上传语言包失败' });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processUploadedFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processUploadedFile(file);
    }
  };

  // 保存快速覆盖
  const handleSaveOverride = async () => {
    if (!overrideJsonText.trim()) {
      return;
    }
    let parsed: any;
    try {
      parsed = JSON.parse(overrideJsonText);
    } catch {
      setFeedbackMsg({ type: 'error', text: t('i18n.invalidJson') });
      return;
    }

    setIsSaving(true);
    try {
      await saveCustomOverride(parsed);
      setOverrideJsonText('');
      setFeedbackMsg({ type: 'success', text: t('i18n.savedSuccess') });
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err?.message || '保存失败' });
    } finally {
      setIsSaving(false);
    }
  };

  // 恢复系统默认
  const handleResetOverride = async () => {
    if (!window.confirm('确定清除该语言在本地的所有自定义修改，恢复为系统默认词典吗？')) {
      return;
    }
    setIsResetting(true);
    try {
      await resetCustomOverride();
      setOverrideJsonText('');
      setFeedbackMsg({ type: 'success', text: t('i18n.resetSuccess') });
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err?.message || '重置失败' });
    } finally {
      setIsResetting(false);
    }
  };

  const currentMeta = availableLocales.find(item => item.code === language);

  return (
    <>
      <div className="settings-card">
        <div className="settings-card-title">
          <Icon name="languages" size="sm" variant="primary" />
          <span>{t('i18n.title')}</span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
          {t('i18n.subtitle')}
        </p>

        {/* 提示信息 */}
        {feedbackMsg && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius-sm)',
              marginBottom: 16,
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              backgroundColor: feedbackMsg.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              color: feedbackMsg.type === 'success' ? 'var(--success-color)' : 'var(--danger-color)',
              border: `1px solid ${feedbackMsg.type === 'success' ? 'var(--success-color)' : 'var(--danger-color)'}`,
            }}
          >
            <Icon name={feedbackMsg.type === 'success' ? 'check' : 'alertCircle'} size="xs" />
            <span>{feedbackMsg.text}</span>
          </div>
        )}

        {/* 语言切换控制行 */}
        <div className="form-group" style={{ marginBottom: 20 }}>
          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{t('i18n.currentLang')}</span>
            {currentMeta && (
              <span style={{ fontSize: 11, display: 'flex', gap: 6 }}>
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: 999,
                    backgroundColor: currentMeta.is_builtin ? 'rgba(99, 102, 241, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                    color: currentMeta.is_builtin ? 'var(--accent-color)' : 'var(--warning-color)',
                  }}
                >
                  {currentMeta.is_builtin ? t('i18n.builtinBadge') : t('i18n.customBadge')}
                </span>
                {currentMeta.has_override && (
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 999,
                      backgroundColor: 'rgba(16, 185, 129, 0.15)',
                      color: 'var(--success-color)',
                    }}
                  >
                    {t('i18n.overriddenBadge')}
                  </span>
                )}
              </span>
            )}
          </label>
          <select
            value={language}
            onChange={e => setLanguage(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              backgroundColor: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
              fontSize: 14,
            }}
          >
            {availableLocales.map(item => (
              <option key={item.code} value={item.code}>
                {item.name} {item.has_override ? ' [已自定义]' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* 本地目录与操作按钮组 */}
        <div
          style={{
            padding: 14,
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            marginBottom: 20,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="folder" size="xs" variant="primary" />
            <span>{t('i18n.localesDir')}</span>
          </div>
          <div
            style={{
              fontSize: 12,
              fontFamily: 'monospace',
              color: 'var(--text-muted)',
              marginBottom: 12,
              wordBreak: 'break-all',
              userSelect: 'text',
            }}
          >
            {localesDir || '~/.config/hpic/locales'}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={handleOpenFolder}
              title={t('i18n.openFolderDesc')}
            >
              <Icon name="external" size="xs" />
              <span>{t('i18n.openFolder')}</span>
            </button>

            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={handleReload}
              disabled={isReloading}
              title="重新读取目录下的所有语言包文件"
            >
              <Icon name="refresh" size="xs" animation={isReloading ? 'spin' : 'none'} />
              <span>{isReloading ? '重载中...' : t('i18n.refresh')}</span>
            </button>

            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={handleExport}
              title={t('i18n.exportDesc')}
            >
              <Icon name="download" size="xs" />
              <span>{t('i18n.exportCurrent')}</span>
            </button>

            {currentMeta?.has_override && (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={handleResetOverride}
                disabled={isResetting}
                style={{ color: 'var(--danger-color)', marginLeft: 'auto' }}
              >
                <Icon name="trash" size="xs" />
                <span>{isResetting ? '恢复中...' : t('i18n.resetOverride')}</span>
              </button>
            )}
          </div>
        </div>

        {/* 语言包自主上传与拖拽导入区域 */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="upload" size="xs" variant="primary" />
            <span>{t('i18n.uploadTitle')}</span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
            {t('i18n.uploadDesc')}
          </p>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileInputChange}
            accept=".json,application/json"
            style={{ display: 'none' }}
          />

          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${isDragging ? 'var(--accent-color)' : 'var(--border-color)'}`,
              borderRadius: 'var(--radius-md)',
              padding: '20px 16px',
              textAlign: 'center',
              backgroundColor: isDragging ? 'var(--accent-bg)' : 'var(--bg-tertiary)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            <div style={{ marginBottom: 6 }}>
              <Icon
                name={isUploading ? 'loading' : 'upload'}
                size="md"
                variant={isDragging ? 'primary' : 'muted'}
                animation={isUploading ? 'spin' : 'none'}
              />
            </div>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
              {isDragging ? t('i18n.dropToUpload') : t('i18n.clickToUpload')}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              支持标准 JSON 语言文件，例如 <code>ja-JP.json</code>、<code>zh-TW.json</code>、<code>fr-FR.json</code>
            </div>
          </div>
        </div>

        {/* 快捷局部覆盖编辑器 */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="edit" size="xs" />
            <span>{t('i18n.customOverride')}</span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
            若只想微调一两处词条（例如修改导航栏标题、按钮文案），可直接在此处编写 JSON 片段，保存后将自动与系统词典深度合并：
          </p>

          <textarea
            value={overrideJsonText}
            onChange={e => setOverrideJsonText(e.target.value)}
            placeholder={t('i18n.customOverridePlaceholder')}
            rows={4}
            style={{
              width: '100%',
              padding: 10,
              fontFamily: 'Consolas, Monaco, "Courier New", monospace',
              fontSize: 12.5,
              backgroundColor: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
              resize: 'vertical',
              outline: 'none',
              marginBottom: 10,
            }}
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={handleSaveOverride}
              disabled={isSaving || !overrideJsonText.trim()}
            >
              <Icon name={isSaving ? 'loading' : 'check'} size="xs" animation={isSaving ? 'spin' : 'none'} />
              <span>{isSaving ? '保存中...' : t('i18n.saveOverride')}</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
