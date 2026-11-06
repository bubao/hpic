import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Search, CornerDownLeft, Command, X, ArrowUp, ArrowDown } from 'lucide-react';
import { CommandItem, CommandGroup, UsageStats } from '../types';
import {
  rankCommands,
  highlightCommandTitle,
  loadUsageStats,
  saveUsageStats,
  recordCommandUsage,
} from '../utils/commandMatcher';

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: CommandItem[];
  groups?: CommandGroup[];
  placeholder?: string;
}

export const DEFAULT_GROUPS: CommandGroup[] = [
  { id: 'posts', label: '文章操作', order: 10 },
  { id: 'hexo', label: 'Hexo 服务与构建', order: 20 },
  { id: 'theme', label: '外观与主题', order: 30 },
  { id: 'settings', label: '设置与偏好', order: 40 },
  { id: 'tools', label: '工具与诊断', order: 50 },
  { id: 'navigation', label: '导航与页面', order: 60 },
];

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  commands,
  groups = DEFAULT_GROUPS,
  placeholder = '搜索全局命令、设置项或快捷操作…（支持拼音缩写）',
}) => {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [usageStats, setUsageStats] = useState<UsageStats>(() => loadUsageStats());
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const itemRefs = useRef<Map<number, HTMLLIElement>>(new Map());

  // 每次唤起时重置搜索词与焦点
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveIndex(0);
      setUsageStats(loadUsageStats());
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 30);
    }
  }, [isOpen]);

  // 根据当前查询与频次加权排序
  const filteredCommands = useMemo(() => {
    return rankCommands(commands, query, usageStats);
  }, [commands, query, usageStats]);

  // 当搜索词变更时，将 activeIndex 归零
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // 分组映射字典
  const groupLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of groups) {
      map.set(g.id, g.label);
    }
    return map;
  }, [groups]);

  // 保证当前高亮条目处于可视区
  useEffect(() => {
    const el = itemRefs.current.get(activeIndex);
    if (el) {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  const executeCommand = useCallback(
    (cmd: CommandItem) => {
      // 记录使用频次并持久化
      const nextStats = recordCommandUsage(usageStats, cmd.id);
      setUsageStats(nextStats);
      saveUsageStats(nextStats);

      onClose();
      // 在关闭微任务后执行具体逻辑，防止 UI 阻塞
      setTimeout(() => {
        cmd.run();
      }, 0);
    },
    [usageStats, onClose]
  );

  // 键盘快捷键处理
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (filteredCommands.length === 0) return;
      setActiveIndex((prev) => (prev + 1) % filteredCommands.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (filteredCommands.length === 0) return;
      setActiveIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const current = filteredCommands[activeIndex];
      if (current) {
        executeCommand(current);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop command-palette-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-label="命令面板"
    >
      <div className="command-palette-dialog" onClick={(e) => e.stopPropagation()}>
        {/* 顶部搜索框 */}
        <div className="command-palette-search-wrap">
          <Search size={18} className="command-palette-search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="command-palette-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            aria-autocomplete="list"
            aria-controls="command-palette-results"
            aria-activedescendant={
              filteredCommands[activeIndex] ? `cmd-${filteredCommands[activeIndex].id}` : undefined
            }
          />
          {query ? (
            <button
              type="button"
              className="command-palette-clear-btn"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              title="清空搜索"
            >
              <X size={14} />
            </button>
          ) : (
            <div className="command-palette-hotkey-badge">
              <Command size={11} />
              <span>K</span>
            </div>
          )}
        </div>

        {/* 结果列表 */}
        <div className="command-palette-results-wrap">
          {filteredCommands.length === 0 ? (
            <div className="command-palette-empty">
              <p>未找到匹配的命令或设置项</p>
              <span>可尝试使用汉字拼音首字母（如 qhzt）或别名搜索</span>
            </div>
          ) : (
            <ul
              ref={listRef}
              id="command-palette-results"
              role="listbox"
              className="command-palette-list"
            >
              {filteredCommands.map((cmd, idx) => {
                const isActive = idx === activeIndex;
                const chunks = highlightCommandTitle(cmd.title, query);
                const groupLabel = groupLabelMap.get(cmd.group) || cmd.group;

                return (
                  <li
                    key={cmd.id}
                    id={`cmd-${cmd.id}`}
                    ref={(el) => {
                      if (el) itemRefs.current.set(idx, el);
                      else itemRefs.current.delete(idx);
                    }}
                    role="option"
                    aria-selected={isActive}
                    className={`command-palette-item ${isActive ? 'active' : ''}`}
                    onClick={() => executeCommand(cmd)}
                    onMouseEnter={() => setActiveIndex(idx)}
                  >
                    <div className="command-palette-item-main">
                      <span className="command-palette-item-title">
                        {chunks.map((chunk, cIdx) =>
                          chunk.match ? (
                            <mark key={cIdx} className="command-palette-highlight">
                              {chunk.text}
                            </mark>
                          ) : (
                            <React.Fragment key={cIdx}>{chunk.text}</React.Fragment>
                          )
                        )}
                      </span>
                      <span className="command-palette-item-group">{groupLabel}</span>
                    </div>

                    <div className="command-palette-item-meta">
                      {cmd.shortcut && (
                        <kbd className="command-palette-shortcut">{cmd.shortcut}</kbd>
                      )}
                      {isActive && (
                        <span className="command-palette-enter-hint" title="回车执行">
                          <CornerDownLeft size={12} />
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* 底部快捷键提示 */}
        <div className="command-palette-footer">
          <div className="command-palette-footer-item">
            <kbd><ArrowUp size={11} /></kbd>
            <kbd><ArrowDown size={11} /></kbd>
            <span>导航</span>
          </div>
          <div className="command-palette-footer-item">
            <kbd><CornerDownLeft size={11} /></kbd>
            <span>执行</span>
          </div>
          <div className="command-palette-footer-item">
            <kbd>Esc</kbd>
            <span>关闭</span>
          </div>
          <div className="command-palette-footer-counter">
            {filteredCommands.length} 个结果
          </div>
        </div>
      </div>
    </div>
  );
};
