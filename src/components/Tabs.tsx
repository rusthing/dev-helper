export interface TabItem<T extends string> {
  id: T;
  label: string;
}

/**
 * 菜单内部的一级 Tab。
 *
 * 只负责切换，不卸载面板：调用方把所有面板都渲染出来，用 `hidden`
 * 控制显隐，这样每个 Tab 的输入、输出和选项在切换时都不会丢。
 */
export function Tabs<T extends string>({
  value,
  items,
  onChange,
}: {
  value: T;
  items: TabItem<T>[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          role="tab"
          aria-selected={it.id === value}
          className={`tab ${it.id === value ? "on" : ""}`}
          onClick={() => onChange(it.id)}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
