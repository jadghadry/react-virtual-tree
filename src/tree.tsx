import type { CSSProperties, FC, ReactNode } from "react";

import type { TreeDefinition, TreeItem } from "./types";

import { useVirtualizer } from "@tanstack/react-virtual";
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";

import { CheckedState } from "./constants";
import { Engine } from "./engine";

export type TreeCheckboxRenderProps = {
  id: string;
  checkedState: CheckedState;
  isFolder: boolean;
  isExpanded: boolean;
  isFocused: boolean;
  level: number;
  item: TreeItem;
  onChange: (nextChecked: boolean) => void;
};

export type TreeExpanderRenderProps = {
  id: string;
  isFolder: boolean;
  isExpanded: boolean;
  level: number;
  item: TreeItem;
  onToggle: () => void;
};

export type TreeProps = {
  /** Optional controlled list of checked leaf IDs. */
  checkedItems?: null | string[];
  /** Additional className for outer scroll container. */
  className?: string;
  /** Must include "\_\_root\_\_" node */
  data: TreeDefinition;
  /** Optional controlled list of expanded folder IDs. */
  expandedItems?: null | string[];
  /** Height of the scroll container. Defaults to "100%". */
  height?: number | string;
  /** Defaults to 3 */
  minSearchChars?: number;
  /** Called whenever the set of checked leaf IDs changes. */
  onCheck?: (selection: string[]) => void;
  /** Called whenever the list of expanded folder IDs changes. */
  onExpand?: (expanded: string[]) => void;
  /** Custom checkbox renderer. Default uses <input type="checkbox" />. */
  renderCheckbox?: (props: TreeCheckboxRenderProps) => ReactNode;
  /** Custom expander renderer. Default uses a small +/- button. */
  renderExpander?: (props: TreeExpanderRenderProps) => ReactNode;
  /** Custom row content (label, icon, etc). Default uses item.label. */
  renderItem?: (item: TreeItem) => ReactNode;
  /** Current search query (controlled). */
  searchQuery?: string;
};

export type TreeRef = {
  collapseAll: () => void;
  expandAll: () => void;
  scrollToId?: (id: string) => void;
};

export const Tree = forwardRef<TreeRef, TreeProps>(
  (
    {
      checkedItems,
      className,
      data,
      expandedItems,
      height,
      minSearchChars = 3,
      onCheck,
      onExpand,
      renderItem,
      renderCheckbox,
      renderExpander,
      searchQuery,
    },
    ref
  ) => {
    const engine = useMemo(
      () => new Engine(data, { minSearchChars }),
      [data, minSearchChars]
    );

    // React to engine notifications
    const [, force] = useReducer((x) => x + 1, 0);
    useEffect(() => engine.subscribe(force), [engine]);

    // Upstream events
    useEffect(() => {
      let prevSelVer = engine.getSelectionVersion();
      let prevExpVer = engine.getExpandVersion();

      return engine.subscribe(() => {
        const selVer = engine.getSelectionVersion();
        const expVer = engine.getExpandVersion();

        if (selVer !== prevSelVer) {
          prevSelVer = selVer;
          onCheck?.(engine.getAllChecked());
        }
        if (expVer !== prevExpVer) {
          prevExpVer = expVer;
          onExpand?.(engine.getExpanded());
        }

        force();
      });
    }, [engine, onCheck, onExpand]);

    // Controlled: checked items (allow empty array)
    useEffect(() => {
      if (!checkedItems) return;
      engine.setChecked(checkedItems, true);
    }, [checkedItems, engine]);

    // Controlled: expanded items (optional override)
    useEffect(() => {
      if (expandedItems) engine.setExpanded(expandedItems);
    }, [expandedItems, engine]);

    // Controlled: search
    useEffect(() => {
      engine.setSearchQuery(searchQuery ?? "");
    }, [engine, searchQuery]);

    // View-aware rows (filtered or full)
    const items = engine.getVisibleItems();

    const pRef = useRef<HTMLDivElement | null>(null);
    const virtualizer = useVirtualizer({
      count: items.length,
      estimateSize: () => 32,
      getItemKey: (i) => items[i]?.id,
      getScrollElement: () => pRef.current,
      overscan: 5,
    });
    useLayoutEffect(() => {
      virtualizer.measure();
    }, [virtualizer, height]);

    useImperativeHandle(
      ref,
      () => ({
        collapseAll: () => engine.collapseAll(),
        expandAll: () => engine.expandAll(),
        scrollToId: (id: string) => {
          const i = engine.indexOf(id);
          if (i >= 0) virtualizer.scrollToIndex(i);
        },
      }),
      [engine, virtualizer]
    );

    const handleCheckboxChange = useCallback(
      (id: string, checked: boolean) => {
        engine.toggle(id, checked); // context-aware: filtered vs full
      },
      [engine]
    );

    return (
      <div
        className={className}
        ref={pRef}
        style={{
          height: height ?? "100%",
          overflow: "auto",
          position: "relative",
        }}
      >
        <div
          className="relative min-w-full"
          style={{
            height: `${virtualizer.getTotalSize()}px`,
          }}
        >
          {virtualizer.getVirtualItems().map((vi) => {
            const row = items[vi.index];
            if (!row) return null;

            const { id, isFolder } = row;
            const isExpanded = row.isExpanded;
            const level = row.level >= 0 ? row.level : 0;
            const checkedState = engine.getViewState(id);

            return (
              <TreeRow
                checkedState={checkedState}
                id={id}
                isExpanded={isExpanded}
                isFocused={false}
                isFolder={isFolder}
                item={data[id]}
                key={id}
                level={level}
                onCheckboxChange={handleCheckboxChange}
                onToggleExpand={() => engine.toggleExpanded(id)}
                renderCheckbox={renderCheckbox}
                renderExpander={renderExpander}
                renderItem={renderItem}
                virtualItem={vi}
              />
            );
          })}
        </div>
      </div>
    );
  }
);
Tree.displayName = "Tree";

const TreeRow = React.memo<{
  checkedState: CheckedState;
  id: string;
  isExpanded: boolean;
  isFocused: boolean;
  isFolder: boolean;
  item: TreeItem;
  level: number;
  onCheckboxChange: (id: string, checked: boolean) => void;
  onToggleExpand: () => void;
  renderItem?: (item: TreeItem) => ReactNode;
  renderCheckbox?: (props: TreeCheckboxRenderProps) => ReactNode;
  renderExpander?: (props: TreeExpanderRenderProps) => ReactNode;
  virtualItem: { size: number; start: number };
}>(
  ({
    checkedState,
    id,
    isExpanded,
    isFocused,
    isFolder,
    item,
    level,
    onCheckboxChange,
    onToggleExpand,
    renderItem,
    renderCheckbox,
    renderExpander,
    virtualItem,
  }) => {
    const handleRowClick = useCallback(() => {
      if (isFolder) onToggleExpand();
    }, [isFolder, onToggleExpand]);

    const handleCheckboxClick = useCallback(
      (checked: "indeterminate" | boolean) => {
        const nextChecked = checked === "indeterminate" ? true : checked;
        onCheckboxChange(id, nextChecked);
      },
      [id, onCheckboxChange]
    );

    // ----- defaults (headless but with basic HTML) -----

    const DefaultExpander: FC<TreeExpanderRenderProps> = ({
      isExpanded,
      onToggle,
    }) => (
      <button
        type="button"
        aria-label={isExpanded ? "Collapse" : "Expand"}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        style={{
          marginRight: 4,
          width: 16,
          height: 16,
          fontSize: 10,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {isExpanded ? "-" : "+"}
      </button>
    );

    const DefaultCheckbox: FC<TreeCheckboxRenderProps> = ({
      checkedState,
      onChange,
    }) => {
      const t = radixChecked(checkedState);
      return (
        <input
          type="checkbox"
          checked={t === true}
          ref={(el) => {
            if (el) el.indeterminate = t === "indeterminate";
          }}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onChange(e.target.checked)}
          style={{ marginRight: 6 }}
        />
      );
    };

    const ExpanderComp = renderExpander ?? DefaultExpander;
    const CheckboxComp = renderCheckbox ?? DefaultCheckbox;

    const rs: CSSProperties = {
      position: "absolute",
      top: 0,
      left: 0,
      height: `${virtualItem.size}px`,
      transform: `translateY(${virtualItem.start}px)`,
      paddingLeft: `${level * 20 + (!isFolder ? 6 : 0)}px`,
      display: "flex",
      alignItems: "center",
      gap: 4,
      whiteSpace: "nowrap",
      width: "max-content",
      minWidth: "100%",
      cursor: isFolder ? "pointer" : "default",
    };

    return (
      <div
        aria-expanded={isFolder ? isExpanded : undefined}
        aria-selected={checkedState === CheckedState.Checked}
        className="rt-tree-row"
        onClick={handleRowClick}
        role="treeitem"
        style={rs}
      >
        {isFolder && (
          <ExpanderComp
            id={id}
            isFolder={isFolder}
            isExpanded={isExpanded}
            level={level}
            item={item}
            onToggle={onToggleExpand}
          />
        )}

        <CheckboxComp
          id={id}
          checkedState={checkedState}
          isFolder={isFolder}
          isExpanded={isExpanded}
          isFocused={isFocused}
          level={level}
          item={item}
          onChange={handleCheckboxClick}
        />

        <div className="rt-tree-label">
          {renderItem ? renderItem(item) : item.label}
        </div>
      </div>
    );
  },
  (a, b) =>
    a.id === b.id &&
    a.isFolder === b.isFolder &&
    a.checkedState === b.checkedState &&
    a.isExpanded === b.isExpanded &&
    a.isFocused === b.isFocused &&
    a.level === b.level &&
    a.item === b.item &&
    a.renderItem === b.renderItem &&
    a.renderCheckbox === b.renderCheckbox &&
    a.renderExpander === b.renderExpander &&
    a.virtualItem.start === b.virtualItem.start &&
    a.virtualItem.size === b.virtualItem.size
);
TreeRow.displayName = "TreeRow";

const radixChecked = (state: CheckedState): "indeterminate" | boolean => {
  if (state === CheckedState.Checked) return true;
  if (state === CheckedState.Indeterminate) return "indeterminate";
  return false;
};
