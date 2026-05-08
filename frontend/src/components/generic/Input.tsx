import type { InputHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

// Shared compact input styling for dropdown controls across filters and source options.
export function Input({
  active,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  active?: boolean;
}) {
  return (
    <input
      className={cn(
        "focus:border-primary no-spinner rounded-md border border-gs-3/50 pl-1.5 pr-1 py-1.5 text-xs text-gs-4",
        active && "border-primary",
        className,
      )}
      {...props}
    />
  );
}