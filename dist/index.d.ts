import React, { ReactNode } from 'react';

declare enum CheckedState {
    Checked = "checked",
    Indeterminate = "indeterminate",
    Unchecked = "unchecked"
}

type TreeDefinition = Record<string, TreeItem>;
type TreeItem = {
    children?: string[];
    data?: Record<string, any>;
    label: string;
    id: number | string;
};

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
declare class Engine {
    private allCheckedCache;
    private allCheckedCacheVersion;
    private assignments;
    private childrenMap;
    private expanded;
    private expandVersion;
    private flatCacheVersion;
    private flatVisibleItems;
    private folderSet;
    private indexById;
    private labelMap;
    private leafIds;
    private minSearchChars;
    private normalizedLeafLabel;
    private normalizedQuery;
    private observers;
    private parentMap;
    private rootId;
    private searchActive;
    private searchEpoch;
    private searchQuery;
    private selectionVersion;
    private stateCache;
    private stateCacheFiltered;
    private version;
    private visibleChildrenMap;
    private visibleSet;
    /**
     * Creates a new tree engine from hierarchical data.
     *
     * @param data - Tree structure where each key is a node ID and value contains children and label
     * @param opts - Configuration options for root ID, initial expansion, and search behavior
     */
    constructor(data: TreeDefinition, opts?: {
        initialExpanded?: string[];
        minSearchChars?: number;
        rootId?: string;
    });
    /**
     * Normalizes text by removing diacritics and converting to lowercase.
     * Used for consistent search matching across different character sets.
     */
    private static normalize;
    /**
     * Collapses all folders except the root.
     * Useful for resetting the tree to a minimal view.
     */
    collapseAll(): void;
    /**
     * Expands all folders in the tree.
     * Useful for showing the complete tree structure at once.
     */
    expandAll(): void;
    getAllChecked(): string[];
    /**
     * Returns all currently expanded folder IDs.
     * Expanded folders show their children in the tree view.
     *
     * @returns Array of folder IDs that are expanded
     */
    getExpanded(): string[];
    getExpandVersion(): number;
    /**
     * Gets the display label for a node.
     * Falls back to the node ID if no label is defined.
     *
     * @param id - The node ID
     * @returns The display label for the node
     */
    getLabel(id: string): string;
    /**
     * Gets the current search query string.
     *
     * @returns The active search query
     */
    getSearchQuery(): string;
    getSelectionVersion(): number;
    /**
     * Gets the checkbox state for a node, accounting for current view mode.
     * In search mode, only considers visible children when computing folder states.
     * In normal mode, considers all children for folder state computation.
     *
     * @param id - The node ID
     * @returns CheckedState (Checked, Unchecked, or Indeterminate)
     */
    getViewState(id: string): CheckedState;
    /**
     * Returns the flattened list of visible items for rendering.
     * Handles both normal tree view and search-filtered view.
     * Results are cached for performance and only recomputed when needed.
     *
     * @returns Array of items that should be visible in the current view
     */
    getVisibleItems(): VisibleItem[];
    /**
     * Gets the index position of a node in the flattened visible items list.
     * Used for virtual scrolling and finding specific items in the rendered view.
     *
     * @param id - The node ID
     * @returns The index position, or -1 if not found
     */
    indexOf(id: string): number;
    /**
     * Checks if a folder is currently expanded.
     *
     * @param id - The folder ID
     * @returns True if the folder is expanded
     */
    isExpanded(id: string): boolean;
    /**
     * Checks if search filtering is currently active.
     * Search is active when the query length meets the minimum character threshold.
     *
     * @returns True if search filtering is active
     */
    isSearchActive(): boolean;
    /**
     * Sets which leaf nodes should be checked (controlled state).
     * Automatically filters out non-leaf nodes and updates the UI.
     * Only triggers re-render if the selection actually changed.
     *
     * @param input - Array of node IDs that should be checked
     */
    setChecked(input: string[], silent?: boolean): void;
    /**
     * Sets which folders should be expanded (controlled state).
     * Root folder is always kept expanded to maintain tree structure.
     * Only triggers re-render if the expansion state actually changed.
     *
     * @param ids - Array of folder IDs that should be expanded
     */
    setExpanded(ids: string[]): void;
    /**
     * Sets the minimum number of characters required to activate search.
     * Prevents performance issues from very short search queries.
     *
     * @param n - Minimum character count (must be at least 1)
     */
    setMinSearchChars(n: number): void;
    setSearchQuery(query: string): void;
    /**
     * Subscribes to engine state changes.
     * Callback is fired whenever the tree state changes and UI should re-render.
     *
     * @param cb - Function to call when state changes
     * @returns Cleanup function to remove the subscription
     */
    subscribe(cb: () => void): () => undefined;
    /**
     * Toggles the checked state of a node.
     * Behavior depends on current view mode:
     * - Normal mode: affects the node and all its descendants
     * - Search mode: affects only visible descendants (filtered by search)
     *
     * @param id - The node ID to toggle
     * @param checked - True to check, false to uncheck
     */
    toggle(id: string, checked: boolean): void;
    /**
     * Toggles the expanded/collapsed state of a folder.
     * Only works on folder nodes; leaf nodes cannot be expanded.
     * Root folder is always kept expanded.
     *
     * @param id - The folder ID to toggle
     */
    toggleExpanded(id: string): void;
    private bumpNoRecompute;
    /**
     * Recursively clears all checkbox assignments in a subtree.
     * Used when setting a parent checkbox to avoid conflicting child states.
     */
    private clearSubtreeAssignments;
    /**
     * Finds the nearest explicit checkbox assignment by walking up the parent chain.
     * Used to determine effective checkbox state when no direct assignment exists.
     *
     * @param id - Starting node ID
     * @returns The nearest boolean assignment, or undefined if none found
     */
    private findNearestAssignment;
    /**
     * Computes checkbox state using the full tree structure.
     * Considers all children when determining folder states.
     * Results are cached for performance.
     *
     * @param id - The node ID
     * @returns The computed checkbox state
     */
    private getStateBase;
    /**
     * Computes checkbox state using only visible items in search mode.
     * Only considers visible children when determining folder states.
     * Used to show accurate checkbox states during search filtering.
     *
     * @param id - The node ID
     * @returns The computed checkbox state for filtered view
     */
    private getStateFiltered;
    /**
     * Notifies all observers that the tree state has changed.
     * Clears caches and increments version for change detection.
     * Triggers UI re-render.
     */
    private notify;
    /**
     * Checks if two sets contain the same elements.
     * Used for efficient equality comparisons without object serialization.
     *
     * @param a - First set
     * @param b - Second set
     * @returns True if sets contain identical elements
     */
    private setsEqual;
    /**
     * Toggles checkbox state using full tree semantics.
     * Sets the target node and clears all descendant assignments.
     * This ensures consistent parent-child checkbox relationships.
     *
     * @param id - The node ID to toggle
     * @param checked - True to check, false to uncheck
     */
    private toggleFull;
    /**
     * Toggles checkbox state for only visible items during search.
     * Affects only leaf nodes that are currently visible in the filtered view.
     * Preserves hidden items' states while updating search results.
     *
     * @param id - The node ID to toggle
     * @param checked - True to check, false to uncheck
     */
    private toggleVisibleOnly;
}

type TreeCheckboxRenderProps = {
    id: string;
    checkedState: CheckedState;
    isFolder: boolean;
    isExpanded: boolean;
    isFocused: boolean;
    level: number;
    item: TreeItem;
    onChange: (nextChecked: boolean) => void;
};
type TreeExpanderRenderProps = {
    id: string;
    isFolder: boolean;
    isExpanded: boolean;
    level: number;
    item: TreeItem;
    onToggle: () => void;
};
type TreeProps = {
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
type TreeRef = {
    collapseAll: () => void;
    expandAll: () => void;
    scrollToId?: (id: string) => void;
};
declare const Tree: React.ForwardRefExoticComponent<TreeProps & React.RefAttributes<TreeRef>>;

export { CheckedState, Engine, Tree, type TreeCheckboxRenderProps, type TreeDefinition, type TreeExpanderRenderProps, type TreeItem, type TreeProps, type TreeRef };
