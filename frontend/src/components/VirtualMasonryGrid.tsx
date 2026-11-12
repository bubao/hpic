import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

/**
 * 大图瀑布流虚拟化容器
 *
 * 背景：收藏夹 / 长列表检索结果可能上千张卡片，一次性挂载会导致
 * DOM 节点、图片解码与内存全面膨胀。这里只渲染「视口 + 上下 overscan」
 * 范围内的卡片，其余空间用容器总高度撑开，滚动条长度与真实内容一致。
 *
 * 布局方式：绝对定位 + 逐行实测高度。
 * 卡片高度并非固定（封面字段数量、标签换行都会影响按钮区行数），
 * 因此每个格子的高度由该行已渲染卡片的最大自然高度决定，
 * 并在 useLayoutEffect（绘制前）完成测量与校正，避免重叠或闪烁。
 */

export interface VirtualMasonryGridProps<T> {
  /** 全部数据（可能远多于实际渲染数量） */
  items: T[];
  /** 渲染单张卡片，返回值必须是单个根元素 */
  renderItem: (item: T, index: number) => React.ReactNode;
  /** 卡片稳定 key */
  keyOf: (item: T, index: number) => string;
  /** 卡片最小宽度，需与旧 .masonry-grid-container 的 minmax 保持一致 */
  minColumnWidth?: number;
  /** 卡片间距，需与旧 .masonry-grid-container 的 gap 保持一致 */
  gap?: number;
  /** 视口上下各多渲染的行数（缓冲带） */
  overscanRows?: number;
  /** 未测量行的估算高度；缺省按 16:9 缩略图 + 详情区估算 */
  estimatedRowHeight?: number;
  /** 滚动容器引用；缺省优先取 .app-main-content，再退化为 window */
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
  className?: string;
}

/** 与旧 CSS 栅格同样的列数推导：repeat(auto-fill, minmax(min, 1fr)) */
function computeColumns(width: number, minColumnWidth: number, gap: number): number {
  if (width <= 0) return 0;
  return Math.max(1, Math.floor((width + gap) / (minColumnWidth + gap)));
}

export function VirtualMasonryGrid<T>({
  items,
  renderItem,
  keyOf,
  minColumnWidth = 280,
  gap = 16,
  overscanRows = 2,
  estimatedRowHeight,
  scrollContainerRef,
  className,
}: VirtualMasonryGridProps<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // 逐行实测高度（行号 → 像素）。未测量的行用 fallbackRowHeight 参与排版。
  const rowHeightsRef = useRef<number[]>([]);
  const [width, setWidth] = useState(0);
  // 网格相对滚动容器可视区顶部的偏移（可能为负）与可视高度
  const [view, setView] = useState({ top: 0, height: 0 });
  // 测量后需要重算 rowTops，用自增计数触发 memo 失效
  const [measureTick, setMeasureTick] = useState(0);

  const cols = computeColumns(width, minColumnWidth, gap);
  const colWidth = cols > 0 ? (width - gap * (cols - 1)) / cols : 0;
  const rows = cols > 0 ? Math.ceil(items.length / cols) : 0;

  // 1. 跟踪容器宽度（列数 / 列宽变化会改变每张卡片的实际高度）
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width ?? 0;
      setWidth(prev => (Math.abs(prev - w) > 0.5 ? w : prev));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 列宽变化 → 旧的高度测量全部失效
  useEffect(() => {
    rowHeightsRef.current = [];
    setMeasureTick(t => t + 1);
  }, [colWidth]);

  const fallbackRowHeight = useMemo(() => {
    if (estimatedRowHeight && estimatedRowHeight > 0) return estimatedRowHeight;
    // 缩略图固定 16:9（含 1px 边框），详情区按最常见的两行按钮估算
    return Math.round(Math.max(0, colWidth - 2) * (9 / 16)) + 192;
  }, [colWidth, estimatedRowHeight]);

  const getRowHeight = useCallback(
    (row: number) => {
      const measured = rowHeightsRef.current[row];
      return measured && measured > 0 ? measured : fallbackRowHeight;
    },
    [fallbackRowHeight],
  );

  const rowTops = useMemo(() => {
    const tops = new Array<number>(rows);
    let acc = 0;
    for (let r = 0; r < rows; r++) {
      tops[r] = acc;
      acc += getRowHeight(r) + gap;
    }
    return tops;
    // measureTick: 实测高度更新后需要重算前缀和
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, getRowHeight, gap, measureTick]);

  const totalHeight = rows > 0 ? rowTops[rows - 1] + getRowHeight(rows - 1) : 0;

  // 2. 跟踪滚动位置（优先复用页面既有的 .app-main-content 滚动容器）
  useEffect(() => {
    if (!width) return;
    const el = scrollContainerRef?.current ?? null;
    const scroller: HTMLElement | Window =
      el ?? (typeof document !== 'undefined' ? document.querySelector('.app-main-content') : null) ?? window;

    const update = () => {
      const grid = containerRef.current;
      if (!grid) return;
      const rect = grid.getBoundingClientRect();
      if (scroller === window) {
        setView({ top: rect.top, height: window.innerHeight });
      } else {
        const sRect = (scroller as HTMLElement).getBoundingClientRect();
        setView({ top: rect.top - sRect.top, height: sRect.height });
      }
    };

    update();
    scroller.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      scroller.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [width, scrollContainerRef]);

  // 3. 计算需要渲染的行区间
  // view.top 是网格顶部相对滚动容器「可视区顶部」的偏移：
  // 网格被滚上去时为负，因此可视区对应的网格坐标要取 -view.top。
  const visibleRows = useMemo(() => {
    if (rows === 0 || view.height <= 0) return null;
    const overscanPx = overscanRows * (fallbackRowHeight + gap);
    const firstPx = -view.top - overscanPx;
    const lastPx = -view.top + view.height + overscanPx;

    // 二分：第一个「行底 > firstPx」的行
    let lo = 0;
    let hi = rows - 1;
    let start = rows;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (rowTops[mid] + getRowHeight(mid) <= firstPx) {
        lo = mid + 1;
      } else {
        start = mid;
        hi = mid - 1;
      }
    }

    let end = start - 1;
    for (let r = start; r < rows; r++) {
      if (rowTops[r] >= lastPx) break;
      end = r;
    }
    if (end < start) return null;
    return { start, end };
  }, [rows, view, rowTops, getRowHeight, fallbackRowHeight, gap, overscanRows]);

  const cells = useMemo(() => {
    if (!visibleRows) return [];
    const result: { index: number; row: number; col: number }[] = [];
    for (let r = visibleRows.start; r <= visibleRows.end; r++) {
      for (let c = 0; c < cols; c++) {
        const index = r * cols + c;
        if (index >= items.length) break;
        result.push({ index, row: r, col: c });
      }
    }
    return result;
  }, [visibleRows, cols, items.length]);

  // 4. 绘制前测量已渲染卡片的自然高度，修正行高（收敛一次即稳定）
  useLayoutEffect(() => {
    const root = containerRef.current;
    if (!root || cols <= 0 || cells.length === 0) return;

    let changed = false;
    const nodes = root.querySelectorAll<HTMLElement>('[data-vmg-cell]');
    nodes.forEach(node => {
      const index = Number(node.dataset.vmgCell);
      if (!Number.isInteger(index)) return;
      const row = Math.floor(index / cols);
      const card = node.firstElementChild as HTMLElement | null;
      const h = card ? card.offsetHeight : 0;
      if (h > 0 && h > (rowHeightsRef.current[row] ?? 0)) {
        rowHeightsRef.current[row] = h;
        changed = true;
      }
    });

    if (changed) setMeasureTick(t => t + 1);
  }, [cells, cols]);

  if (items.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: 'relative', width: '100%', height: totalHeight }}
    >
      {cells.map(({ index, row, col }) => (
        <div
          key={keyOf(items[index], index)}
          data-vmg-cell={index}
          style={{
            position: 'absolute',
            top: rowTops[row],
            left: col * (colWidth + gap),
            width: colWidth,
            height: getRowHeight(row),
            overflow: 'hidden',
          }}
        >
          {renderItem(items[index], index)}
        </div>
      ))}
    </div>
  );
}
