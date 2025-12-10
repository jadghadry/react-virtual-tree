'use strict';

var reactVirtual = require('@tanstack/react-virtual');
var React = require('react');
var jsxRuntime = require('react/jsx-runtime');

function _interopDefault (e) { return e && e.__esModule ? e : { default: e }; }

var React__default = /*#__PURE__*/_interopDefault(React);

// src/constants.ts
var CheckedState = /* @__PURE__ */ ((CheckedState2) => {
  CheckedState2["Checked"] = "checked";
  CheckedState2["Indeterminate"] = "indeterminate";
  CheckedState2["Unchecked"] = "unchecked";
  return CheckedState2;
})(CheckedState || {});

// src/engine.ts
var Engine = class _Engine {
  /**
   * Creates a new tree engine from hierarchical data.
   *
   * @param data - Tree structure where each key is a node ID and value contains children and label
   * @param opts - Configuration options for root ID, initial expansion, and search behavior
   */
  constructor(data, opts) {
    this.allCheckedCache = [];
    this.allCheckedCacheVersion = -1;
    this.assignments = /* @__PURE__ */ new Map();
    this.childrenMap = /* @__PURE__ */ new Map();
    this.expanded = /* @__PURE__ */ new Set();
    this.expandVersion = 0;
    this.flatCacheVersion = -1;
    this.flatVisibleItems = [];
    this.folderSet = /* @__PURE__ */ new Set();
    this.indexById = /* @__PURE__ */ new Map();
    this.labelMap = /* @__PURE__ */ new Map();
    this.leafIds = [];
    this.minSearchChars = 3;
    this.normalizedLeafLabel = /* @__PURE__ */ new Map();
    this.normalizedQuery = "";
    this.observers = /* @__PURE__ */ new Set();
    this.parentMap = /* @__PURE__ */ new Map();
    this.searchActive = false;
    this.searchEpoch = 0;
    // bumps on every query change
    this.searchQuery = "";
    this.selectionVersion = 0;
    this.stateCache = /* @__PURE__ */ new Map();
    // full tree cache
    this.stateCacheFiltered = /* @__PURE__ */ new Map();
    // filtered-view cache
    this.version = 0;
    this.visibleChildrenMap = /* @__PURE__ */ new Map();
    this.visibleSet = /* @__PURE__ */ new Set();
    var _a, _b, _c;
    this.rootId = (_a = opts == null ? void 0 : opts.rootId) != null ? _a : "__root__";
    if (opts == null ? void 0 : opts.minSearchChars) this.minSearchChars = opts.minSearchChars;
    for (const [id, item] of Object.entries(data)) {
      const children = item.children || [];
      this.childrenMap.set(id, children);
      this.labelMap.set(id, (_b = item.label) != null ? _b : id);
      if (children.length > 0) {
        this.folderSet.add(id);
      } else {
        this.leafIds.push(id);
      }
      for (const child of children) {
        this.parentMap.set(child, id);
      }
    }
    if (!this.parentMap.has(this.rootId)) this.parentMap.set(this.rootId, null);
    if (opts == null ? void 0 : opts.initialExpanded)
      opts.initialExpanded.forEach((id) => this.expanded.add(id));
    if (this.folderSet.has(this.rootId)) this.expanded.add(this.rootId);
    for (const leafId of this.leafIds) {
      const raw = (_c = this.labelMap.get(leafId)) != null ? _c : leafId;
      this.normalizedLeafLabel.set(leafId, _Engine.normalize(raw));
    }
  }
  /**
   * Normalizes text by removing diacritics and converting to lowercase.
   * Used for consistent search matching across different character sets.
   */
  static normalize(s) {
    return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }
  /**
   * Collapses all folders except the root.
   * Useful for resetting the tree to a minimal view.
   */
  collapseAll() {
    this.expanded.clear();
    if (this.folderSet.has(this.rootId)) this.expanded.add(this.rootId);
    this.bumpNoRecompute();
  }
  /**
   * Expands all folders in the tree.
   * Useful for showing the complete tree structure at once.
   */
  expandAll() {
    for (const id of this.folderSet) this.expanded.add(id);
    this.bumpNoRecompute();
  }
  getAllChecked() {
    if (this.allCheckedCacheVersion === this.selectionVersion)
      return this.allCheckedCache;
    const result = [];
    for (const [id] of this.childrenMap) {
      if (!this.folderSet.has(id) && this.getStateBase(id) === "checked" /* Checked */) {
        result.push(id);
      }
    }
    this.allCheckedCache = result;
    this.allCheckedCacheVersion = this.selectionVersion;
    return this.allCheckedCache;
  }
  /**
   * Returns all currently expanded folder IDs.
   * Expanded folders show their children in the tree view.
   *
   * @returns Array of folder IDs that are expanded
   */
  getExpanded() {
    return Array.from(this.expanded);
  }
  getExpandVersion() {
    return this.expandVersion;
  }
  /**
   * Gets the display label for a node.
   * Falls back to the node ID if no label is defined.
   *
   * @param id - The node ID
   * @returns The display label for the node
   */
  getLabel(id) {
    var _a;
    return (_a = this.labelMap.get(id)) != null ? _a : id;
  }
  /**
   * Gets the current search query string.
   *
   * @returns The active search query
   */
  getSearchQuery() {
    return this.searchQuery;
  }
  getSelectionVersion() {
    return this.selectionVersion;
  }
  /**
   * Gets the checkbox state for a node, accounting for current view mode.
   * In search mode, only considers visible children when computing folder states.
   * In normal mode, considers all children for folder state computation.
   *
   * @param id - The node ID
   * @returns CheckedState (Checked, Unchecked, or Indeterminate)
   */
  getViewState(id) {
    return this.searchActive ? this.getStateFiltered(id) : this.getStateBase(id);
  }
  /**
   * Returns the flattened list of visible items for rendering.
   * Handles both normal tree view and search-filtered view.
   * Results are cached for performance and only recomputed when needed.
   *
   * @returns Array of items that should be visible in the current view
   */
  getVisibleItems() {
    const cacheKey = this.version << 8 ^ this.searchEpoch;
    if (this.flatCacheVersion === cacheKey) return this.flatVisibleItems;
    const out = [];
    this.indexById.clear();
    const visit = (id, level) => {
      const c = this.searchActive ? this.visibleChildrenMap.get(id) || [] : this.childrenMap.get(id) || [];
      if (id !== this.rootId) {
        const isFolder = this.folderSet.has(id);
        const hasVisibleChildren = c.length > 0;
        const effectiveFolder = this.searchActive ? hasVisibleChildren : isFolder;
        const isExpanded = effectiveFolder && this.expanded.has(id);
        const v = {
          id,
          isExpanded,
          isFolder: effectiveFolder,
          level
        };
        this.indexById.set(id, out.length);
        out.push(v);
        if (!effectiveFolder || !isExpanded) return;
      }
      for (const child of c) {
        visit(child, id === this.rootId ? 0 : level + 1);
      }
    };
    visit(this.rootId, -1);
    this.flatVisibleItems = out;
    this.flatCacheVersion = cacheKey;
    return out;
  }
  /**
   * Gets the index position of a node in the flattened visible items list.
   * Used for virtual scrolling and finding specific items in the rendered view.
   *
   * @param id - The node ID
   * @returns The index position, or -1 if not found
   */
  indexOf(id) {
    var _a;
    this.getVisibleItems();
    return (_a = this.indexById.get(id)) != null ? _a : -1;
  }
  /**
   * Checks if a folder is currently expanded.
   *
   * @param id - The folder ID
   * @returns True if the folder is expanded
   */
  isExpanded(id) {
    return this.expanded.has(id);
  }
  /**
   * Checks if search filtering is currently active.
   * Search is active when the query length meets the minimum character threshold.
   *
   * @returns True if search filtering is active
   */
  isSearchActive() {
    return this.searchActive;
  }
  /**
   * Sets which leaf nodes should be checked (controlled state).
   * Automatically filters out non-leaf nodes and updates the UI.
   * Only triggers re-render if the selection actually changed.
   *
   * @param input - Array of node IDs that should be checked
   */
  setChecked(input, silent = false) {
    const n = /* @__PURE__ */ new Set();
    for (const id of input) if (!this.folderSet.has(id)) n.add(id);
    const o = new Set(this.getAllChecked());
    if (this.setsEqual(n, o)) return;
    this.assignments.clear();
    for (const id of n) this.assignments.set(id, true);
    this.notify(silent);
  }
  /**
   * Sets which folders should be expanded (controlled state).
   * Root folder is always kept expanded to maintain tree structure.
   * Only triggers re-render if the expansion state actually changed.
   *
   * @param ids - Array of folder IDs that should be expanded
   */
  setExpanded(ids) {
    const next = new Set(ids);
    if (this.setsEqual(next, this.expanded)) return;
    this.expanded = next;
    if (this.folderSet.has(this.rootId)) this.expanded.add(this.rootId);
    this.bumpNoRecompute();
  }
  /**
   * Sets the minimum number of characters required to activate search.
   * Prevents performance issues from very short search queries.
   *
   * @param n - Minimum character count (must be at least 1)
   */
  setMinSearchChars(n) {
    if (n < 1) n = 1;
    if (this.minSearchChars === n) return;
    this.minSearchChars = n;
    this.setSearchQuery(this.searchQuery);
  }
  setSearchQuery(query) {
    var _a;
    const raw = query != null ? query : "";
    const q = _Engine.normalize(raw);
    if (q === this.normalizedQuery) {
      this.searchQuery = raw;
      return;
    }
    const wasActive = this.searchActive;
    this.searchQuery = raw;
    this.normalizedQuery = q;
    this.searchActive = q.length >= this.minSearchChars;
    this.visibleSet.clear();
    this.visibleChildrenMap.clear();
    this.stateCacheFiltered.clear();
    if (this.searchActive) {
      const matches = [];
      for (let i = 0; i < this.leafIds.length; i++) {
        const id = this.leafIds[i];
        if (((_a = this.normalizedLeafLabel.get(id)) != null ? _a : "").includes(q))
          matches.push(id);
      }
      for (const leaf of matches) {
        this.visibleSet.add(leaf);
        let p = this.parentMap.get(leaf);
        while (p) {
          this.visibleSet.add(p);
          p = this.parentMap.get(p);
        }
      }
      this.visibleSet.add(this.rootId);
      for (const id of this.visibleSet) {
        const origChildren = this.childrenMap.get(id) || [];
        const restricted = origChildren.filter((c) => this.visibleSet.has(c));
        if (restricted.length > 0) this.visibleChildrenMap.set(id, restricted);
      }
      this.expanded.clear();
      this.expanded.add(this.rootId);
      for (const id of this.visibleSet)
        if (this.folderSet.has(id)) this.expanded.add(id);
    } else {
      if (wasActive) {
        this.expanded.clear();
        this.expanded.add(this.rootId);
      }
    }
    this.searchEpoch++;
    this.version++;
    this.expandVersion++;
    this.flatCacheVersion = -1;
    for (const ob of this.observers) ob();
  }
  /**
   * Subscribes to engine state changes.
   * Callback is fired whenever the tree state changes and UI should re-render.
   *
   * @param cb - Function to call when state changes
   * @returns Cleanup function to remove the subscription
   */
  subscribe(cb) {
    this.observers.add(cb);
    return () => void this.observers.delete(cb);
  }
  /**
   * Toggles the checked state of a node.
   * Behavior depends on current view mode:
   * - Normal mode: affects the node and all its descendants
   * - Search mode: affects only visible descendants (filtered by search)
   *
   * @param id - The node ID to toggle
   * @param checked - True to check, false to uncheck
   */
  toggle(id, checked) {
    if (this.searchActive) {
      this.toggleVisibleOnly(id, checked);
    } else {
      this.toggleFull(id, checked);
    }
  }
  /**
   * Toggles the expanded/collapsed state of a folder.
   * Only works on folder nodes; leaf nodes cannot be expanded.
   * Root folder is always kept expanded.
   *
   * @param id - The folder ID to toggle
   */
  toggleExpanded(id) {
    if (!this.folderSet.has(id)) return;
    if (this.expanded.has(id)) this.expanded.delete(id);
    else this.expanded.add(id);
    if (id === this.rootId && !this.expanded.has(this.rootId))
      this.expanded.add(this.rootId);
    this.bumpNoRecompute();
  }
  bumpNoRecompute() {
    this.version++;
    this.expandVersion++;
    this.flatCacheVersion = -1;
    for (const ob of this.observers) ob();
  }
  /**
   * Recursively clears all checkbox assignments in a subtree.
   * Used when setting a parent checkbox to avoid conflicting child states.
   */
  clearSubtreeAssignments(id) {
    const children = this.childrenMap.get(id) || [];
    for (const child of children) {
      this.assignments.delete(child);
      this.clearSubtreeAssignments(child);
    }
  }
  /**
   * Finds the nearest explicit checkbox assignment by walking up the parent chain.
   * Used to determine effective checkbox state when no direct assignment exists.
   *
   * @param id - Starting node ID
   * @returns The nearest boolean assignment, or undefined if none found
   */
  findNearestAssignment(id) {
    let current = id;
    while (current) {
      if (this.assignments.has(current)) return this.assignments.get(current);
      current = this.parentMap.get(current) || null;
    }
    return void 0;
  }
  /**
   * Computes checkbox state using the full tree structure.
   * Considers all children when determining folder states.
   * Results are cached for performance.
   *
   * @param id - The node ID
   * @returns The computed checkbox state
   */
  getStateBase(id) {
    if (this.stateCache.has(id)) return this.stateCache.get(id);
    const children = this.childrenMap.get(id) || [];
    if (children.length === 0) {
      const forced = this.findNearestAssignment(id);
      const state2 = forced === true ? "checked" /* Checked */ : "unchecked" /* Unchecked */;
      this.stateCache.set(id, state2);
      return state2;
    }
    let checkedCount = 0;
    for (const c of children) {
      const st = this.getStateBase(c);
      if (st === "indeterminate" /* Indeterminate */) {
        this.stateCache.set(id, "indeterminate" /* Indeterminate */);
        return "indeterminate" /* Indeterminate */;
      }
      if (st === "checked" /* Checked */) checkedCount++;
    }
    const state = checkedCount === 0 ? "unchecked" /* Unchecked */ : checkedCount === children.length ? "checked" /* Checked */ : "indeterminate" /* Indeterminate */;
    this.stateCache.set(id, state);
    return state;
  }
  /**
   * Computes checkbox state using only visible items in search mode.
   * Only considers visible children when determining folder states.
   * Used to show accurate checkbox states during search filtering.
   *
   * @param id - The node ID
   * @returns The computed checkbox state for filtered view
   */
  getStateFiltered(id) {
    if (this.stateCacheFiltered.has(id))
      return this.stateCacheFiltered.get(id);
    const children = this.searchActive ? this.visibleChildrenMap.get(id) || [] : this.childrenMap.get(id) || [];
    if (children.length === 0) {
      const forced = this.findNearestAssignment(id);
      const state2 = forced === true ? "checked" /* Checked */ : "unchecked" /* Unchecked */;
      this.stateCacheFiltered.set(id, state2);
      return state2;
    }
    let checkedCount = 0;
    for (const c of children) {
      const st = this.getStateFiltered(c);
      if (st === "indeterminate" /* Indeterminate */) {
        this.stateCacheFiltered.set(id, "indeterminate" /* Indeterminate */);
        return "indeterminate" /* Indeterminate */;
      }
      if (st === "checked" /* Checked */) checkedCount++;
    }
    const state = checkedCount === 0 ? "unchecked" /* Unchecked */ : checkedCount === children.length ? "checked" /* Checked */ : "indeterminate" /* Indeterminate */;
    this.stateCacheFiltered.set(id, state);
    return state;
  }
  /**
   * Notifies all observers that the tree state has changed.
   * Clears caches and increments version for change detection.
   * Triggers UI re-render.
   */
  notify(silent = false) {
    if (!silent) {
      this.selectionVersion++;
    }
    this.version++;
    this.stateCache.clear();
    this.stateCacheFiltered.clear();
    this.flatCacheVersion = -1;
    this.allCheckedCacheVersion = -1;
    for (const ob of this.observers) ob();
  }
  /**
   * Checks if two sets contain the same elements.
   * Used for efficient equality comparisons without object serialization.
   *
   * @param a - First set
   * @param b - Second set
   * @returns True if sets contain identical elements
   */
  setsEqual(a, b) {
    if (a.size !== b.size) return false;
    for (const v of a) if (!b.has(v)) return false;
    return true;
  }
  /**
   * Toggles checkbox state using full tree semantics.
   * Sets the target node and clears all descendant assignments.
   * This ensures consistent parent-child checkbox relationships.
   *
   * @param id - The node ID to toggle
   * @param checked - True to check, false to uncheck
   */
  toggleFull(id, checked) {
    this.assignments.set(id, checked);
    this.clearSubtreeAssignments(id);
    this.notify();
  }
  /**
   * Toggles checkbox state for only visible items during search.
   * Affects only leaf nodes that are currently visible in the filtered view.
   * Preserves hidden items' states while updating search results.
   *
   * @param id - The node ID to toggle
   * @param checked - True to check, false to uncheck
   */
  toggleVisibleOnly(id, checked) {
    const forEachVisibleLeafUnder = (start, fn) => {
      const stack = [start];
      while (stack.length) {
        const cur = stack.pop();
        const children = this.visibleChildrenMap.get(cur) || [];
        if (children.length === 0) {
          if (!this.folderSet.has(cur)) fn(cur);
        } else {
          for (let i = 0; i < children.length; i++) stack.push(children[i]);
        }
      }
    };
    if (!this.folderSet.has(id)) {
      this.assignments.set(id, checked);
      this.notify();
      return;
    }
    forEachVisibleLeafUnder(id, (leaf) => {
      this.assignments.set(leaf, checked);
    });
    this.notify();
  }
};
var Tree = React.forwardRef(
  ({
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
    searchQuery
  }, ref) => {
    const engine = React.useMemo(
      () => new Engine(data, { minSearchChars }),
      [data, minSearchChars]
    );
    const [, force] = React.useReducer((x) => x + 1, 0);
    React.useEffect(() => engine.subscribe(force), [engine]);
    React.useEffect(() => {
      let prevSelVer = engine.getSelectionVersion();
      let prevExpVer = engine.getExpandVersion();
      return engine.subscribe(() => {
        const selVer = engine.getSelectionVersion();
        const expVer = engine.getExpandVersion();
        if (selVer !== prevSelVer) {
          prevSelVer = selVer;
          onCheck == null ? void 0 : onCheck(engine.getAllChecked());
        }
        if (expVer !== prevExpVer) {
          prevExpVer = expVer;
          onExpand == null ? void 0 : onExpand(engine.getExpanded());
        }
        force();
      });
    }, [engine, onCheck, onExpand]);
    React.useEffect(() => {
      if (!checkedItems) return;
      engine.setChecked(checkedItems, true);
    }, [checkedItems, engine]);
    React.useEffect(() => {
      if (expandedItems) engine.setExpanded(expandedItems);
    }, [expandedItems, engine]);
    React.useEffect(() => {
      engine.setSearchQuery(searchQuery != null ? searchQuery : "");
    }, [engine, searchQuery]);
    const items = engine.getVisibleItems();
    const pRef = React.useRef(null);
    const virtualizer = reactVirtual.useVirtualizer({
      count: items.length,
      estimateSize: () => 32,
      getItemKey: (i) => {
        var _a;
        return (_a = items[i]) == null ? void 0 : _a.id;
      },
      getScrollElement: () => pRef.current,
      overscan: 5
    });
    React.useLayoutEffect(() => {
      virtualizer.measure();
    }, [virtualizer, height]);
    React.useImperativeHandle(
      ref,
      () => ({
        collapseAll: () => engine.collapseAll(),
        expandAll: () => engine.expandAll(),
        scrollToId: (id) => {
          const i = engine.indexOf(id);
          if (i >= 0) virtualizer.scrollToIndex(i);
        }
      }),
      [engine, virtualizer]
    );
    const handleCheckboxChange = React.useCallback(
      (id, checked) => {
        engine.toggle(id, checked);
      },
      [engine]
    );
    return /* @__PURE__ */ jsxRuntime.jsx(
      "div",
      {
        className,
        ref: pRef,
        style: {
          height: height != null ? height : "100%",
          overflow: "auto",
          position: "relative"
        },
        children: /* @__PURE__ */ jsxRuntime.jsx(
          "div",
          {
            className: "relative min-w-full",
            style: {
              height: `${virtualizer.getTotalSize()}px`
            },
            children: virtualizer.getVirtualItems().map((vi) => {
              const row = items[vi.index];
              if (!row) return null;
              const { id, isFolder } = row;
              const isExpanded = row.isExpanded;
              const level = row.level >= 0 ? row.level : 0;
              const checkedState = engine.getViewState(id);
              return /* @__PURE__ */ jsxRuntime.jsx(
                TreeRow,
                {
                  checkedState,
                  id,
                  isExpanded,
                  isFocused: false,
                  isFolder,
                  item: data[id],
                  level,
                  onCheckboxChange: handleCheckboxChange,
                  onToggleExpand: () => engine.toggleExpanded(id),
                  renderCheckbox,
                  renderExpander,
                  renderItem,
                  virtualItem: vi
                },
                id
              );
            })
          }
        )
      }
    );
  }
);
Tree.displayName = "Tree";
var TreeRow = React__default.default.memo(
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
    virtualItem
  }) => {
    const handleRowClick = React.useCallback(() => {
      if (isFolder) onToggleExpand();
    }, [isFolder, onToggleExpand]);
    const handleCheckboxClick = React.useCallback(
      (checked) => {
        const nextChecked = checked === "indeterminate" ? true : checked;
        onCheckboxChange(id, nextChecked);
      },
      [id, onCheckboxChange]
    );
    const DefaultExpander = ({
      isExpanded: isExpanded2,
      onToggle
    }) => /* @__PURE__ */ jsxRuntime.jsx(
      "button",
      {
        type: "button",
        "aria-label": isExpanded2 ? "Collapse" : "Expand",
        onClick: (e) => {
          e.stopPropagation();
          onToggle();
        },
        style: {
          marginRight: 4,
          width: 16,
          height: 16,
          fontSize: 10,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center"
        },
        children: isExpanded2 ? "-" : "+"
      }
    );
    const DefaultCheckbox = ({
      checkedState: checkedState2,
      onChange
    }) => {
      const t = radixChecked(checkedState2);
      return /* @__PURE__ */ jsxRuntime.jsx(
        "input",
        {
          type: "checkbox",
          checked: t === true,
          ref: (el) => {
            if (el) el.indeterminate = t === "indeterminate";
          },
          onClick: (e) => e.stopPropagation(),
          onChange: (e) => onChange(e.target.checked),
          style: { marginRight: 6 }
        }
      );
    };
    const ExpanderComp = renderExpander != null ? renderExpander : DefaultExpander;
    const CheckboxComp = renderCheckbox != null ? renderCheckbox : DefaultCheckbox;
    const rs = {
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
      cursor: isFolder ? "pointer" : "default"
    };
    return /* @__PURE__ */ jsxRuntime.jsxs(
      "div",
      {
        "aria-expanded": isFolder ? isExpanded : void 0,
        "aria-selected": checkedState === "checked" /* Checked */,
        className: "rt-tree-row",
        onClick: handleRowClick,
        role: "treeitem",
        style: rs,
        children: [
          isFolder && /* @__PURE__ */ jsxRuntime.jsx(
            ExpanderComp,
            {
              id,
              isFolder,
              isExpanded,
              level,
              item,
              onToggle: onToggleExpand
            }
          ),
          /* @__PURE__ */ jsxRuntime.jsx(
            CheckboxComp,
            {
              id,
              checkedState,
              isFolder,
              isExpanded,
              isFocused,
              level,
              item,
              onChange: handleCheckboxClick
            }
          ),
          /* @__PURE__ */ jsxRuntime.jsx("div", { className: "rt-tree-label", children: renderItem ? renderItem(item) : item.label })
        ]
      }
    );
  },
  (a, b) => a.id === b.id && a.isFolder === b.isFolder && a.checkedState === b.checkedState && a.isExpanded === b.isExpanded && a.isFocused === b.isFocused && a.level === b.level && a.item === b.item && a.renderItem === b.renderItem && a.renderCheckbox === b.renderCheckbox && a.renderExpander === b.renderExpander && a.virtualItem.start === b.virtualItem.start && a.virtualItem.size === b.virtualItem.size
);
TreeRow.displayName = "TreeRow";
var radixChecked = (state) => {
  if (state === "checked" /* Checked */) return true;
  if (state === "indeterminate" /* Indeterminate */) return "indeterminate";
  return false;
};

exports.CheckedState = CheckedState;
exports.Engine = Engine;
exports.Tree = Tree;
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map