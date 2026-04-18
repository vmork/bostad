import { CheckIcon } from "lucide-react";
import { cn } from "../../lib/utils";

export function Checkbox({
  checked,
  indeterminate,
  onChange,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={cn(
        "w-4 h-4 rounded border flex items-center justify-center cursor-pointer shrink-0 transition-colors",
        checked || indeterminate
          ? "bg-primary border-primary text-white"
          : "border-gs-3/50 bg-gs-0 hover:border-gs-3",
      )}
    >
      {checked && <CheckIcon className="w-3 h-3" strokeWidth={3} />}
      {indeterminate && !checked && <span className="block w-2 h-0.5 bg-white rounded-full" />}
    </button>
  );
}