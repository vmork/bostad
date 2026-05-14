import { Pill } from "./Pill";

// Generic multi-select shown as toggleable pills with select-all / clear controls
export function MultiSelect<T>({
  allItems,
  included,
  setIncluded,
  keyFn,
  displayFn,
}: {
  allItems: T[];
  included: T[] | null;
  setIncluded: (items: T[] | null) => void;
  keyFn: (item: T) => string | number;
  displayFn: (item: T) => string;
}) {
  const toggleItem = (item: T) => {
    if (included?.some((x) => keyFn(x) === keyFn(item))) {
      setIncluded(included.filter((x) => keyFn(x) !== keyFn(item)));
    } else {
      setIncluded([...(included ?? []), item]);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      {/* Header: select all / clear */}
      <div className="hidden items-center justify-between text-xs text-gs-3 md:flex">
        <button
          type="button"
          className="hover:text-dark cursor-pointer"
          onClick={() => setIncluded([...allItems])}
        >
          Select all
        </button>
        {(included?.length ?? 0) > 0 && (
          <button
            type="button"
            className="hover:text-dark cursor-pointer"
            onClick={() => setIncluded([])}
          >
            Clear
          </button>
        )}
      </div>
      <div className="hidden h-px bg-gs-2 md:block" />
      {/* Options grid */}
      <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
        {allItems.map((item) => {
          const selected = included?.some((x) => keyFn(x) === keyFn(item)) ?? false;
          return (
            <button key={keyFn(item)} type="button" onClick={() => toggleItem(item)}>
              <Pill
                type={selected ? "primary" : "default"}
                className="cursor-pointer text-xs text-gs-3 p-1"
              >
                {displayFn(item)}
              </Pill>
            </button>
          );
        })}
      </div>
    </div>
  );
}
