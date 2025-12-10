## 💬 Description

Headless, virtualized checkbox tree for React 18+.

- Virtualized rows with stable item keys
- Checkbox semantics with tri-state support (checked / unchecked / indeterminate)
- Search overlay that auto-expands matches and limits toggles to visible leaves
- Controlled or uncontrolled checked, expanded, and search states
- Pluggable renderers for expander, checkbox, and row content
- Imperative helpers to expand, collapse, or scroll to an item
- Lightweight: only depends on `@tanstack/react-virtual`

## 📦 Installation

```sh
npm install react-virtual-checkbox-tree
# or
yarn add react-virtual-checkbox-tree
# or
pnpm add react-virtual-checkbox-tree
```

Peer deps: `react@>=18`, `react-dom@>=18`.

## 🚀 Quick start

Minimal uncontrolled render:

```tsx
import { Tree, type TreeDefinition } from "react-virtual-checkbox-tree";

const data: TreeDefinition = {
  __root__: { id: "__root__", label: "root", children: ["a", "b"] },
  a: { id: "a", label: "Alpha" },
  b: { id: "b", label: "Beta" },
};

export default function App() {
  return <Tree data={data} height={240} />;
}
```

Controlled with search:

```tsx
import { Tree, type TreeDefinition } from "react-virtual-checkbox-tree";
import { useMemo, useRef, useState } from "react";

const data = useMemo<TreeDefinition>(
  () => ({
    __root__: { id: "__root__", label: "root", children: ["docs", "src"] },
    docs: { id: "docs", label: "Docs", children: ["readme"] },
    readme: { id: "readme", label: "README.md" },
    src: { id: "src", label: "src", children: ["engine", "tree"] },
    engine: { id: "engine", label: "engine.ts" },
    tree: { id: "tree", label: "tree.tsx" },
  }),
  []
);

export function FileTree() {
  const [checked, setChecked] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string[]>(["__root__", "docs"]);
  const [query, setQuery] = useState("");

  return (
    <div style={{ height: 320, border: "1px solid #e0e0e0" }}>
      <input
        placeholder="Search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ width: "100%", boxSizing: "border-box", marginBottom: 8 }}
      />

      <Tree
        data={data}
        checkedItems={checked}
        expandedItems={expanded}
        searchQuery={query}
        onCheck={setChecked}
        onExpand={setExpanded}
        height={280}
      />
    </div>
  );
}
```

Render customization example:

```tsx
<Tree
  data={data}
  renderExpander={({ isExpanded, onToggle }) => (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      {isExpanded ? "⬇️" : "➡️"}
    </button>
  )}
  renderCheckbox={({ checkedState, onChange }) => (
    <MyCheckbox
      checked={checkedState === "checked"}
      indeterminate={checkedState === "indeterminate"}
      onChange={onChange}
    />
  )}
  renderItem={(item) => <span style={{ display: "inline-flex", gap: 6 }}>{item.label}</span>}
  height={320}
/>
```

## 🗂️ Data model

| Field      | Type                  | Required | Description                                  |
| ---------- | --------------------- | -------- | -------------------------------------------- |
| `id`       | `string \| number`    | yes      | Stable identifier; should match the map key. |
| `label`    | `string`              | yes      | Text shown by default renderer.              |
| `children` | `string[]`            | no       | Child IDs; omit or empty array for leaves.   |
| `data`     | `Record<string, any>` | no       | Extra metadata passed through to renderers.  |

`TreeDefinition = Record<string, TreeItem>`; the key is the node ID. You must include a root entry (default expected ID is `"__root__"`) whose `children` array represents the top-level nodes.

## 🧩 Component API

| Prop             | Type                                            | Default      | Description                                                                |
| ---------------- | ----------------------------------------------- | ------------ | -------------------------------------------------------------------------- |
| `data`           | `TreeDefinition`                                |              | Required tree map including the `__root__` node.                           |
| `height`         | `number \| string`                              | `"100%"`     | Height of the scroll container.                                            |
| `className`      | `string`                                        |              | Extra class for the scroll container.                                      |
| `checkedItems`   | `string[] \| null`                              |              | Controlled list of checked **leaf** IDs; pair with `onCheck`.              |
| `expandedItems`  | `string[] \| null`                              |              | Controlled list of expanded folder IDs; pair with `onExpand`.              |
| `searchQuery`    | `string`                                        | `""`         | Controlled search string; activates search when length ≥ `minSearchChars`. |
| `minSearchChars` | `number`                                        | `3`          | Minimum characters before search activates.                                |
| `onCheck`        | `(ids: string[]) => void`                       |              | Fired when checked leaf IDs change.                                        |
| `onExpand`       | `(ids: string[]) => void`                       |              | Fired when expanded folder IDs change.                                     |
| `renderItem`     | `(item: TreeItem) => ReactNode`                 | `item.label` | Custom row body (label/icon/etc).                                          |
| `renderCheckbox` | `(props: TreeCheckboxRenderProps) => ReactNode` |              | Custom checkbox renderer (supports indeterminate).                         |
| `renderExpander` | `(props: TreeExpanderRenderProps) => ReactNode` |              | Custom expander renderer, called only for folders.                         |

## 🎛️ Imperative ref

The forwarded ref exposes:

- `expandAll()` – expand every folder.
- `collapseAll()` – collapse all folders except the root.
- `scrollToId(id)` – virtualized scroll to an item by ID.

## 🔍 Search behavior

- Queries are normalized (lowercased, diacritics stripped).
- When search is active, only matching leaves and their ancestors are visible; folders containing matches are auto-expanded.
- Toggling a folder or leaf in search mode only affects **visible leaves**. Hidden leaves keep their previous state.

## ☑️ Checkbox semantics

- Only leaves are checkable; folder check state is derived from children (checked / indeterminate / unchecked).
- In normal mode, toggling a node cascades through its full subtree. In search mode, toggling only affects currently visible leaves.
- `onCheck` always returns the full list of checked **leaf** IDs (not folders).

## 💡 Tips and patterns

- Use stable string IDs; they are keys for virtualization, caching, and selection.
- Memoize `data` to avoid rebuilding the engine on every render.
- Keep `height` fixed (number or px) when possible for consistent virtualization.
- In controlled mode, update `checkedItems` and `expandedItems` in response to `onCheck`/`onExpand`.
- For larger row heights, fork `tree.tsx` or use the `Engine` directly to provide a custom `estimateSize`.

## 🛠️ Advanced: Engine only

You can build a fully custom UI using the exported `Engine`, `CheckedState`, and types. The engine handles structure, search, and tri-state logic.

```ts
import { Engine, CheckedState } from "react-virtual-checkbox-tree";

const engine = new Engine(data, { minSearchChars: 2 });
engine.subscribe(() => {
  const visible = engine.getVisibleItems();
  // render your own list; call engine.toggle / toggleExpanded as needed
});

engine.setSearchQuery("foo");
engine.toggle("some-id", true);
```

Engine highlights:

- `getVisibleItems()` returns the flattened, view-aware rows with level and expansion state.
- `toggle(id, checked)` cascades differently in normal vs search mode (full subtree vs visible leaves only).
- `toggleExpanded(id)` flips a folder; `expandAll` / `collapseAll` available on the class.
- `setChecked(ids)` lets you control the selection externally.

## ⚡️ Performance

- Renders only the visible rows via `@tanstack/react-virtual`; large trees stay smooth because DOM size stays small.
- Selection and expansion are cached; state recomputation is localized to touched branches.
- Search normalizes labels once (diacritics stripped, lowercased) and activates only after `minSearchChars`, avoiding noisy short queries.
- `scrollToId` uses the virtualizer index map to jump directly to an item.

## 📝 Notes

- Use stable string IDs; they are used as keys and lookups throughout the engine.
- Provide the root node in `data`; its `children` are the visible top-level items.
- The virtualizer estimates row height at 32px; if your rows are taller, pass a custom `estimateSize` by forking `tree.tsx` or use the `Engine` directly.

## 📄 License

Copyright © 2025 Jad Ghadry. Released under the MIT license.
