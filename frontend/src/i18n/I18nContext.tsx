import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from 'react';
import { SupportedLanguage, TranslationSchema } from './types';
import { zhCN } from './locales/zh-CN';
import { enUS } from './locales/en-US';
import { api } from '../api';
import { LocaleMeta } from '../types';

const BUILTIN_LOCALES: Record<string, TranslationSchema> = {
  'zh-CN': zhCN,
  'en-US': enUS,
};

interface I18nContextType {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  isZh: boolean;
  isEn: boolean;
  availableLocales: LocaleMeta[];
  localesDir: string;
  reloadLocales: () => Promise<void>;
  saveCustomOverride: (content: any) => Promise<void>;
  resetCustomOverride: () => Promise<void>;
  openLocalesFolder: () => Promise<void>;
  uploadLocaleFile: (file: File, langOverride?: string) => Promise<string>;
  exportCurrentBundle: () => string;
  t: (path: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextType | null>(null);

function getInitialLanguage(): SupportedLanguage {
  try {
    const saved = localStorage.getItem('hpic_language');
    if (saved) {
      return saved;
    }
  } catch {}
  return navigator.language.startsWith('en') ? 'en-US' : 'zh-CN';
}

/** 深度递归合并对象 */
function deepMerge<T extends Record<string, any>>(target: T, source: Record<string, any>): T {
  const output = { ...target };
  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    const targetVal = output[key];

    if (
      sourceVal &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal) &&
      targetVal &&
      typeof targetVal === 'object' &&
      !Array.isArray(targetVal)
    ) {
      (output as any)[key] = deepMerge(targetVal, sourceVal);
    } else if (sourceVal !== undefined) {
      (output as any)[key] = sourceVal;
    }
  }
  return output;
}

export const I18nProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<SupportedLanguage>(getInitialLanguage);
  const [availableLocales, setAvailableLocales] = useState<LocaleMeta[]>([
    { code: 'zh-CN', name: '简体中文 (zh-CN)', is_builtin: true, has_override: false },
    { code: 'en-US', name: 'English (en-US)', is_builtin: true, has_override: false },
  ]);
  const [localesDir, setLocalesDir] = useState<string>('');
  const [dynamicDicts, setDynamicDicts] = useState<Record<string, Record<string, any>>>({});

  // 1. 获取后端语言列表与路径
  const fetchLocalesList = useCallback(async () => {
    try {
      const res = await api.getI18nLocales();
      if (res && res.locales) {
        setAvailableLocales(res.locales);
        setLocalesDir(res.locales_dir || '');
      }
    } catch {
      // 离线或后端暂未就绪时保留内置兜底
    }
  }, []);

  // 2. 加载当前语言的完整字典 (含用户本地覆盖)
  const fetchBundle = useCallback(async (lang: string) => {
    try {
      const bundle = await api.getI18nBundle(lang);
      if (bundle && typeof bundle === 'object') {
        setDynamicDicts(prev => ({
          ...prev,
          [lang]: bundle,
        }));
      }
    } catch {
      // 网络或加载异常时优雅 fallback 到前端内置字典
    }
  }, []);

  useEffect(() => {
    fetchLocalesList();
  }, [fetchLocalesList]);

  useEffect(() => {
    fetchBundle(language);
  }, [language, fetchBundle]);

  // 无障碍：同步 <html lang>，让屏幕阅读器按界面真实语言发音
  // （默认中文界面此前固定在 index.html 上写死为 lang="en"，属错误标注）
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = (lang: SupportedLanguage) => {
    setLanguageState(lang);
    try {
      localStorage.setItem('hpic_language', lang);
    } catch {}
  };

  // 刷新重载语言包
  const reloadLocales = useCallback(async () => {
    await fetchLocalesList();
    await fetchBundle(language);
  }, [fetchLocalesList, fetchBundle, language]);

  // 保存自定义覆盖
  const saveCustomOverride = useCallback(
    async (content: any) => {
      await api.saveI18nCustom(language, content);
      await reloadLocales();
    },
    [language, reloadLocales]
  );

  // 恢复默认
  const resetCustomOverride = useCallback(async () => {
    await api.resetI18nCustom(language);
    await reloadLocales();
  }, [language, reloadLocales]);

  // 在系统文件管理器中打开文件夹
  const openLocalesFolder = useCallback(async () => {
    await api.openI18nFolder();
  }, []);

  // 用户上传本地 JSON 语言包文件，自动保存至本地目录并热加载切换
  const uploadLocaleFile = useCallback(
    async (file: File, langOverride?: string): Promise<string> => {
      const code = (langOverride || file.name.replace(/\.json$/i, '')).trim();
      if (!code) {
        throw new Error('无法从文件名识别语言代码');
      }
      const text = await file.text();
      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error('文件不是合法的 JSON 格式');
      }

      await api.saveI18nCustom(code, parsed);
      await reloadLocales();
      setLanguage(code);
      return code;
    },
    [reloadLocales]
  );

  // 计算当前合成字典：内置基础 + 动态覆盖
  const currentDict = useMemo(() => {
    const baseDict = BUILTIN_LOCALES[language] || (language === 'en-US' ? enUS : zhCN);
    const dynamic = dynamicDicts[language];
    if (dynamic) {
      return deepMerge(baseDict, dynamic);
    }
    return baseDict;
  }, [language, dynamicDicts]);

  // 导出当前语言的完整 JSON 字典
  const exportCurrentBundle = useCallback(() => {
    return JSON.stringify(currentDict, null, 2);
  }, [currentDict]);

  // t('common.save') 或 t('header.title')
  const t = useMemo(() => {
    return (path: string, params?: Record<string, string | number>): string => {
      const keys = path.split('.');

      // 先在当前字典中检索
      let val: any = currentDict;
      for (const k of keys) {
        if (val && typeof val === 'object' && k in val) {
          val = val[k];
        } else {
          val = undefined;
          break;
        }
      }

      // 若未命中，尝试在默认 zhCN 字典中做最后一次 fallback 保证不空
      if (typeof val !== 'string') {
        let fallbackVal: any = zhCN;
        for (const k of keys) {
          if (fallbackVal && typeof fallbackVal === 'object' && k in fallbackVal) {
            fallbackVal = fallbackVal[k];
          } else {
            fallbackVal = undefined;
            break;
          }
        }
        if (typeof fallbackVal === 'string') {
          val = fallbackVal;
        }
      }

      if (typeof val !== 'string') {
        return path;
      }

      if (params) {
        return Object.entries(params).reduce((acc, [k, v]) => {
          return acc.replace(new RegExp(`{${k}}`, 'g'), String(v));
        }, val);
      }

      return val;
    };
  }, [currentDict]);

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      isZh: language === 'zh-CN',
      isEn: language === 'en-US',
      availableLocales,
      localesDir,
      reloadLocales,
      saveCustomOverride,
      resetCustomOverride,
      openLocalesFolder,
      uploadLocaleFile,
      exportCurrentBundle,
      t,
    }),
    [
      language,
      availableLocales,
      localesDir,
      reloadLocales,
      saveCustomOverride,
      resetCustomOverride,
      openLocalesFolder,
      uploadLocaleFile,
      exportCurrentBundle,
      t,
    ]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = (): I18nContextType => {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    return {
      language: 'zh-CN',
      setLanguage: () => {},
      isZh: true,
      isEn: false,
      availableLocales: [],
      localesDir: '',
      reloadLocales: async () => {},
      saveCustomOverride: async () => {},
      resetCustomOverride: async () => {},
      openLocalesFolder: async () => {},
      uploadLocaleFile: async () => 'zh-CN',
      exportCurrentBundle: () => '{}',
      t: (path: string) => path,
    };
  }
  return ctx;
};
