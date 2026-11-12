import { useState, useCallback } from 'react';
import { DiffPreviewData } from '../components/ConfirmModal';
import { SettingsCategory } from '../components/SettingsModal';

export interface ConfirmState {
  isOpen: boolean;
  title: string;
  message?: string;
  subMessage?: string;
  thumbUrl?: string;
  diffPreview?: DiffPreviewData;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  onConfirm: () => void;
}

export interface LightboxState {
  isOpen: boolean;
  url: string;
  title: string;
  fallbackUrl?: string;
}

export function useModalManager() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsCategory, setSettingsCategory] = useState<SettingsCategory>('blog');
  const [isHealthOpen, setIsHealthOpen] = useState(false);
  const [isLogsOpen, setIsLogsOpen] = useState(false);
  const [isDeployModalOpen, setIsDeployModalOpen] = useState(false);
  const [isCreatePostOpen, setIsCreatePostOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isGlobalHistoryOpen, setIsGlobalHistoryOpen] = useState(false);
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  const openSettings = useCallback((category: SettingsCategory = 'blog') => {
    setSettingsCategory(category);
    setIsSettingsOpen(true);
  }, []);

  const [confirmModalState, setConfirmModalState] = useState<ConfirmState>({
    isOpen: false,
    title: '',
    onConfirm: () => {},
  });

  const [lightboxState, setLightboxState] = useState<LightboxState>({
    isOpen: false,
    url: '',
    title: '',
  });

  const openConfirm = useCallback((opts: Omit<ConfirmState, 'isOpen'>) => {
    setConfirmModalState({
      ...opts,
      isOpen: true,
    });
  }, []);

  const closeConfirm = useCallback(() => {
    setConfirmModalState(prev => ({ ...prev, isOpen: false }));
  }, []);

  const openLightbox = useCallback((url: string, title: string, fallbackUrl?: string) => {
    setLightboxState({
      isOpen: true,
      url,
      title,
      fallbackUrl,
    });
  }, []);

  const closeLightbox = useCallback(() => {
    setLightboxState(prev => ({ ...prev, isOpen: false }));
  }, []);

  return {
    isSettingsOpen,
    setIsSettingsOpen,
    settingsCategory,
    setSettingsCategory,
    openSettings,
    isHealthOpen,
    setIsHealthOpen,
    isLogsOpen,
    setIsLogsOpen,
    isDeployModalOpen,
    setIsDeployModalOpen,
    isCreatePostOpen,
    setIsCreatePostOpen,
    isHistoryModalOpen,
    setIsHistoryModalOpen,
    isGlobalHistoryOpen,
    setIsGlobalHistoryOpen,
    isManualOpen,
    setIsManualOpen,
    isUpdateModalOpen,
    setIsUpdateModalOpen,
    isCommandPaletteOpen,
    setIsCommandPaletteOpen,
    confirmModalState,
    setConfirmModalState,
    openConfirm,
    closeConfirm,
    lightboxState,
    setLightboxState,
    openLightbox,
    closeLightbox,
  };
}
