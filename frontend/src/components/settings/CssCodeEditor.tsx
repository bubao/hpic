import React, { useMemo, useRef } from 'react';

interface CssCodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

/**
 * CSS 词法高亮正则（顺序即优先级）：
 * 1 注释 → 2 字符串 → 3 十六进制颜色 → 4 rgba/rgb → 5 属性名 → 6 数值/单位 → 7 标点
 */
const CSS_TOKEN_REGEX = /(\/\*[\s\S]*?\*\/)|("[^"\n]*"|'[^'\n]*')|(#[0-9a-fA-F]{3,8}\b)|(rgba?\([^)\n]*\))|(--?[a-zA-Z][\w-]*|[a-zA-Z-]+)(?=\s*:)|(\b\d+(?:\.\d+)?)(px|em|rem|%|vh|vw|vmin|vmax|deg|s|ms)?\b|([{}:;,])/g;

function tokenizeCss(code: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;

  for (const match of code.matchAll(CSS_TOKEN_REGEX)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      nodes.push(<span key={key++}>{code.slice(lastIndex, index)}</span>);
    }

    const [full, comment, str, hexColor, rgbaColor, prop, num, punct] = match;
    let cls = '';
    if (comment) cls = 'css-tok-comment';
    else if (str) cls = 'css-tok-string';
    else if (hexColor || rgbaColor) cls = 'css-tok-color';
    else if (prop) cls = 'css-tok-prop';
    else if (num) cls = 'css-tok-number';
    else if (punct) cls = 'css-tok-punct';

    nodes.push(
      <span key={key++} className={cls}>
        {full}
      </span>
    );
    lastIndex = index + full.length;
  }

  if (lastIndex < code.length) {
    nodes.push(<span key={key++}>{code.slice(lastIndex)}</span>);
  }

  return nodes;
}

/**
 * 轻量 CSS 代码编辑器：<textarea> 负责输入（文字透明），
 * 其下层的 <pre> 用高亮后的 token 渲染，滚动时保持同步。
 */
export const CssCodeEditor: React.FC<CssCodeEditorProps> = ({ value, onChange, placeholder }) => {
  const preRef = useRef<HTMLPreElement>(null);

  const highlighted = useMemo(() => tokenizeCss(value), [value]);

  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    const pre = preRef.current;
    if (pre) {
      pre.scrollTop = e.currentTarget.scrollTop;
      pre.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  return (
    <div className="css-editor">
      <pre ref={preRef} className="css-editor-pre" aria-hidden="true">
        {highlighted}
      </pre>
      <textarea
        className="css-editor-textarea"
        value={value}
        onChange={e => onChange(e.target.value)}
        onScroll={handleScroll}
        placeholder={placeholder}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        aria-label="自定义 CSS 代码编辑器"
      />
    </div>
  );
};
