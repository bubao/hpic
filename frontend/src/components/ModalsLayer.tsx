import React from 'react';
import type { ComponentProps } from 'react';
import { Config, PostInfo, VersionInfo, BrokenReport, CommandItem } from '../types';
import { useModalManager } from '../hooks/useModalManager';
import { useHexoRunner } from '../hooks/useHexoRunner';
import { DeployModal } from './DeployModal';
import { ConfirmModal } from './ConfirmModal';
import { HealthModal } from './HealthModal';
import { LogsModal } from './LogsModal';
import { SettingsModal } from './SettingsModal';
import { Lightbox } from './Lightbox';
import { ManualUrlModal } from './ManualUrlModal';
import { UpdateModal } from './UpdateModal';
import { CreatePostModal } from './CreatePostModal';
import { PostHistoryModal } from './PostHistoryModal';
import { CommandPalette } from './CommandPalette';

type ModalManagerValue = ReturnType<typeof useModalManager>;
type HexoRunnerValue = ReturnType<typeof useHexoRunner>;

/**
 * 弹窗挂载层（App.tsx A5 提取）：集中装配 11 个全局 Modal 的 props。
 * 组件本身不含业务逻辑，只做 props 绑定与部署提交信息的模板渲染。
 */
export interface ModalsLayerProps {
  modals: ModalManagerValue;
  hexo: HexoRunnerValue;
  config: Config | null;
  posts: PostInfo[];
  selectedPost: PostInfo | null;
  coverFields: string[];
  updateInfo: VersionInfo | null;
  setUpdateInfo: (info: VersionInfo | null) => void;
  setConfig: (cfg: Config) => void;
  setBrokenReports: React.Dispatch<React.SetStateAction<BrokenReport[]>>;
  setIsHealthChecking: React.Dispatch<React.SetStateAction<boolean>>;
  loadPostsList: () => void | Promise<void>;
  setSelectedPost: (post: PostInfo) => void;
  onDeploy: ComponentProps<typeof DeployModal>['onDeploy'];
  onApplyImage: ComponentProps<typeof Lightbox>['onApplyImage'];
  onMarkBroken: ComponentProps<typeof Lightbox>['onMarkBroken'];
  onAppearanceChange: NonNullable<ComponentProps<typeof SettingsModal>['onAppearanceChange']>;
  onPostCreated: ComponentProps<typeof CreatePostModal>['onPostCreated'];
  onPostUpdated: (post: PostInfo) => void;
  onHistoryChanged: () => void;
  commandItems: CommandItem[];
}

export const ModalsLayer: React.FC<ModalsLayerProps> = ({
  modals,
  hexo,
  config,
  posts,
  selectedPost,
  coverFields,
  updateInfo,
  setUpdateInfo,
  setConfig,
  setBrokenReports,
  setIsHealthChecking,
  loadPostsList,
  setSelectedPost,
  onDeploy,
  onApplyImage,
  onMarkBroken,
  onAppearanceChange,
  onPostCreated,
  onPostUpdated,
  onHistoryChanged,
  commandItems,
}) => {
  // 部署提交信息模板渲染：{标题}/{文件名}/{日期} 占位符替换
  const defaultCommitMsg = (() => {
    const tmpl = config?.git_commit_template || 'chore(cover): update cover for {title}';
    const title = selectedPost?.title || 'blog posts';
    const filename = selectedPost?.file_name || '';
    const dateStr = selectedPost?.date ? selectedPost.date.substring(0, 10) : new Date().toISOString().substring(0, 10);
    return tmpl
      .replace(/\{title\}/g, title)
      .replace(/\{filename\}/g, filename)
      .replace(/\{date\}/g, dateStr);
  })();

  return (
    <>
      <DeployModal
        isOpen={modals.isDeployModalOpen}
        deployMode={config?.deploy_mode || 'git'}
        defaultCommitMsg={defaultCommitMsg}
        postTitle={selectedPost?.title}
        onClose={() => modals.setIsDeployModalOpen(false)}
        onDeploy={onDeploy}
        isDeploying={hexo.isDeploying}
        deployError={hexo.deployError}
      />

      <ConfirmModal
        isOpen={modals.confirmModalState.isOpen}
        title={modals.confirmModalState.title}
        message={modals.confirmModalState.message}
        subMessage={modals.confirmModalState.subMessage}
        thumbUrl={modals.confirmModalState.thumbUrl}
        diffPreview={modals.confirmModalState.diffPreview}
        confirmText={modals.confirmModalState.confirmText}
        cancelText={modals.confirmModalState.cancelText}
        danger={modals.confirmModalState.danger}
        onCancel={modals.closeConfirm}
        onConfirm={modals.confirmModalState.onConfirm}
      />

      <HealthModal
        isOpen={modals.isHealthOpen}
        onClose={() => modals.setIsHealthOpen(false)}
        onSelectPostByPath={p => {
          const match = posts.find(x => x.file_path === p);
          if (match) setSelectedPost(match);
        }}
        posts={posts}
        onUpdateReports={setBrokenReports}
        onRunningChange={setIsHealthChecking}
      />

      <LogsModal
        isOpen={modals.isLogsOpen}
        onClose={() => modals.setIsLogsOpen(false)}
        status={hexo.hexoStatus}
      />

      <SettingsModal
        isOpen={modals.isSettingsOpen}
        onClose={() => modals.setIsSettingsOpen(false)}
        config={config}
        onSaved={cfg => {
          setConfig(cfg);
          loadPostsList();
        }}
        onAppearanceChange={onAppearanceChange}
        initialCategory={modals.settingsCategory}
      />

      <Lightbox
        isOpen={modals.lightboxState.isOpen}
        onClose={modals.closeLightbox}
        url={modals.lightboxState.url}
        fallbackUrl={modals.lightboxState.fallbackUrl}
        title={modals.lightboxState.title}
        coverFields={coverFields}
        onApplyImage={onApplyImage}
        onMarkBroken={onMarkBroken}
      />

      <ManualUrlModal
        isOpen={modals.isManualOpen}
        onClose={() => modals.setIsManualOpen(false)}
        coverFields={coverFields}
        postTitle={selectedPost?.title}
        onApplyImage={(url, fields) => onApplyImage?.(url, fields)}
      />

      <UpdateModal
        isOpen={modals.isUpdateModalOpen}
        onClose={() => modals.setIsUpdateModalOpen(false)}
        versionInfo={updateInfo}
        onUpdateInfoChange={setUpdateInfo}
      />

      <CreatePostModal
        isOpen={modals.isCreatePostOpen}
        onClose={() => modals.setIsCreatePostOpen(false)}
        onPostCreated={onPostCreated}
      />

      <PostHistoryModal
        isOpen={modals.isHistoryModalOpen}
        onClose={() => modals.setIsHistoryModalOpen(false)}
        post={selectedPost}
        onPostUpdated={onPostUpdated}
        onHistoryChanged={onHistoryChanged}
      />

      {/* ⌘K 全局命令面板 */}
      <CommandPalette
        isOpen={modals.isCommandPaletteOpen}
        onClose={() => modals.setIsCommandPaletteOpen(false)}
        commands={commandItems}
      />
    </>
  );
};
