import { CheckedState } from "./constants";
import { TreeDefinition } from "./types";

/**
 * Represents an item that should be visible in the tree view.
 * Used by the rendering system to display the flattened tree structure.
 */
type VisibleItem = {
  id: string;
  isExpanded: boolean;
  isFolder: boolean;
  level: number;
};

/**
 * High-performance tree engine that manages checkbox states, expansion, and search filtering.
 *
 * This engine provides:
 * - Fast checkbox state computation with proper parent/child relationships
 * - Efficient search filtering that shows only matching items and their ancestors
 * - Optimized rendering through caching and minimal re-computation
 * - Dual-mode operation: full tree view vs search-filtered view
 */
export class Engine {
  private allCheckedCache: string[] = [];
  private allCheckedCacheVersion = -1;
  private assignments = new Map<string, boolean>();
  private childrenMap = new Map<string, string[]>();
  private expanded = new Set<string>();
  private expandVersion = 0;
  private flatCacheVersion = -1;
  private flatVisibleItems: VisibleItem[] = [];
  private folderSet = new Set<string>();
  private indexById: Map<string, number> = new Map();
  private labelMap = new Map<string, string>();
  private leafIds: string[] = [];
  private minSearchChars = 3;
  private normalizedLeafLabel = new Map<string, string>();
  private normalizedQuery = "";
  private observers = new Set<() => void>();
  private parentMap = new Map<string, null | string>();
  private rootId: string;
  private searchActive = false;
  private searchEpoch = 0; // bumps on every query change
  private searchQuery = "";
  private selectionVersion = 0;
  private stateCache = new Map<string, CheckedState>(); // full tree cache
  private stateCacheFiltered = new Map<string, CheckedState>(); // filtered-view cache
  private version = 0;
  private visibleChildrenMap = new Map<string, string[]>();
  private visibleSet = new Set<string>();

  /**
   * Creates a new tree engine from hierarchical data.
   *
   * @param data - Tree structure where each key is a node ID and value contains children and label
   * @param opts - Configuration options for root ID, initial expansion, and search behavior
   */
  constructor(
    data: TreeDefinition,
    opts?: {
      initialExpanded?: string[];
      minSearchChars?: number;
      rootId?: string;
    }
  ) {
    this.rootId = opts?.rootId ?? "__root__";
    if (opts?.minSearchChars) this.minSearchChars = opts.minSearchChars;

    // Build structure
    for (const [id, item] of Object.entries(data)) {
      const children = item.children || [];
      this.childrenMap.set(id, children);
      this.labelMap.set(id, (item as any).label ?? id);

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

    // Initial expanded
    if (opts?.initialExpanded)
      opts.initialExpanded.forEach((id) => this.expanded.add(id));
    if (this.folderSet.has(this.rootId)) this.expanded.add(this.rootId);

    // Pre-normalize leaf labels (diacritics + lowercase)
    for (const leafId of this.leafIds) {
      const raw = this.labelMap.get(leafId) ?? leafId;
      this.normalizedLeafLabel.set(leafId, Engine.normalize(raw));
    }
  }

  /**
   * Normalizes text by removing diacritics and converting to lowercase.
   * Used for consistent search matching across different character sets.
   */
  private static normalize(s: string): string {
    return s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
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

  getAllChecked(): string[] {
    if (this.allCheckedCacheVersion === this.selectionVersion)
      return this.allCheckedCache;

    const result: string[] = [];
    for (const [id] of this.childrenMap) {
      if (
        !this.folderSet.has(id) &&
        this.getStateBase(id) === CheckedState.Checked
      ) {
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
  getExpanded(): string[] {
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
  getLabel(id: string): string {
    return this.labelMap.get(id) ?? id;
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
  getViewState(id: string): CheckedState {
    return this.searchActive
      ? this.getStateFiltered(id)
      : this.getStateBase(id);
  }

  /**
   * Returns the flattened list of visible items for rendering.
   * Handles both normal tree view and search-filtered view.
   * Results are cached for performance and only recomputed when needed.
   *
   * @returns Array of items that should be visible in the current view
   */
  getVisibleItems(): VisibleItem[] {
    // invalidate when either content changes (version) or search overlay changes (searchEpoch)
    const cacheKey = (this.version << 8) ^ this.searchEpoch;
    if (this.flatCacheVersion === cacheKey) return this.flatVisibleItems;

    const out: VisibleItem[] = [];
    this.indexById.clear();

    const visit = (id: string, level: number) => {
      const c = this.searchActive
        ? this.visibleChildrenMap.get(id) || []
        : this.childrenMap.get(id) || [];
      if (id !== this.rootId) {
        const isFolder = this.folderSet.has(id);
        const hasVisibleChildren = c.length > 0;
        const effectiveFolder = this.searchActive
          ? hasVisibleChildren
          : isFolder;

        const isExpanded = effectiveFolder && this.expanded.has(id);
        const v: VisibleItem = {
          id,
          isExpanded,
          isFolder: effectiveFolder,
          level,
        };
        this.indexById.set(id, out.length);
        out.push(v);

        if (!effectiveFolder || !isExpanded) return;
      }

      for (const child of c) {
        visit(child, id === this.rootId ? 0 : level + 1);
      }
    };

    visit(this.rootId, -1); // root not rendered
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
  indexOf(id: string): number {
    this.getVisibleItems(); // Ensure index map is up-to-date
    return this.indexById.get(id) ?? -1;
  }
  /**
   * Checks if a folder is currently expanded.
   *
   * @param id - The folder ID
   * @returns True if the folder is expanded
   */
  isExpanded(id: string) {
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
  setChecked(input: string[], silent = false) {
    const n = new Set<string>();
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
  setExpanded(ids: string[]) {
    const next = new Set(ids);
    if (this.setsEqual(next, this.expanded)) return;
    this.expanded = next;
    if (this.folderSet.has(this.rootId)) this.expanded.add(this.rootId);
    this.bumpNoRecompute(); // only a layout change
  }

  /**
   * Sets the minimum number of characters required to activate search.
   * Prevents performance issues from very short search queries.
   *
   * @param n - Minimum character count (must be at least 1)
   */
  setMinSearchChars(n: number) {
    if (n < 1) n = 1;
    if (this.minSearchChars === n) return;
    this.minSearchChars = n;
    // reapply current query against new threshold
    this.setSearchQuery(this.searchQuery);
  }

  setSearchQuery(query: string) {
    const raw = query ?? "";
    const q = Engine.normalize(raw);

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
      const matches: string[] = [];
      for (let i = 0; i < this.leafIds.length; i++) {
        const id = this.leafIds[i];
        if ((this.normalizedLeafLabel.get(id) ?? "").includes(q))
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
    // layout-only bump
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
  subscribe(cb: () => void) {
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
  toggle(id: string, checked: boolean) {
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
  toggleExpanded(id: string) {
    if (!this.folderSet.has(id)) return;
    if (this.expanded.has(id)) this.expanded.delete(id);
    else this.expanded.add(id);
    if (id === this.rootId && !this.expanded.has(this.rootId))
      this.expanded.add(this.rootId);
    this.bumpNoRecompute();
  }

  private bumpNoRecompute() {
    this.version++;
    this.expandVersion++;
    this.flatCacheVersion = -1;
    for (const ob of this.observers) ob();
  }

  /**
   * Recursively clears all checkbox assignments in a subtree.
   * Used when setting a parent checkbox to avoid conflicting child states.
   */
  private clearSubtreeAssignments(id: string) {
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
  private findNearestAssignment(id: string): boolean | undefined {
    let current: null | string = id;
    while (current) {
      if (this.assignments.has(current)) return this.assignments.get(current);
      current = this.parentMap.get(current) || null;
    }
    return undefined;
  }

  /**
   * Computes checkbox state using the full tree structure.
   * Considers all children when determining folder states.
   * Results are cached for performance.
   *
   * @param id - The node ID
   * @returns The computed checkbox state
   */
  private getStateBase(id: string): CheckedState {
    if (this.stateCache.has(id)) return this.stateCache.get(id)!;

    const children = this.childrenMap.get(id) || [];

    // treat "no children" as leaf
    if (children.length === 0) {
      const forced = this.findNearestAssignment(id);
      const state =
        forced === true ? CheckedState.Checked : CheckedState.Unchecked;
      this.stateCache.set(id, state);
      return state;
    }

    // folder: summarize over *all* children
    let checkedCount = 0;
    for (const c of children) {
      const st = this.getStateBase(c);
      if (st === CheckedState.Indeterminate) {
        this.stateCache.set(id, CheckedState.Indeterminate);
        return CheckedState.Indeterminate;
      }
      if (st === CheckedState.Checked) checkedCount++;
    }
    const state =
      checkedCount === 0
        ? CheckedState.Unchecked
        : checkedCount === children.length
        ? CheckedState.Checked
        : CheckedState.Indeterminate;
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
  private getStateFiltered(id: string): CheckedState {
    if (this.stateCacheFiltered.has(id))
      return this.stateCacheFiltered.get(id)!;

    const children = this.searchActive
      ? this.visibleChildrenMap.get(id) || []
      : this.childrenMap.get(id) || [];

    // In filtered view, "leaf" == "no VISIBLE children"
    if (children.length === 0) {
      const forced = this.findNearestAssignment(id);
      const state =
        forced === true ? CheckedState.Checked : CheckedState.Unchecked;
      this.stateCacheFiltered.set(id, state);
      return state;
    }

    // folder: summarize *only visible* children
    let checkedCount = 0;
    for (const c of children) {
      const st = this.getStateFiltered(c);
      if (st === CheckedState.Indeterminate) {
        this.stateCacheFiltered.set(id, CheckedState.Indeterminate);
        return CheckedState.Indeterminate;
      }
      if (st === CheckedState.Checked) checkedCount++;
    }
    const state =
      checkedCount === 0
        ? CheckedState.Unchecked
        : checkedCount === children.length
        ? CheckedState.Checked
        : CheckedState.Indeterminate;
    this.stateCacheFiltered.set(id, state);
    return state;
  }

  /**
   * Notifies all observers that the tree state has changed.
   * Clears caches and increments version for change detection.
   * Triggers UI re-render.
   */
  private notify(silent: boolean = false) {
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
  private setsEqual(a: Set<string>, b: Set<string>) {
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
  private toggleFull(id: string, checked: boolean) {
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
  private toggleVisibleOnly(id: string, checked: boolean) {
    const forEachVisibleLeafUnder = (
      start: string,
      fn: (leaf: string) => void
    ) => {
      const stack = [start];
      while (stack.length) {
        const cur = stack.pop()!;
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
      this.notify(); // selection change
      return;
    }

    forEachVisibleLeafUnder(id, (leaf) => {
      this.assignments.set(leaf, checked);
    });
    this.notify(); // selection change
  }
}
