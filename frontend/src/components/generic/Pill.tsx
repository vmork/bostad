import { cn } from "../../lib/utils";
import { type ClassValue } from "clsx";

export function Pill({
  children,
  type,
  className,
}: {
  children: React.ReactNode;
  type?: "highlight-yellow" | "highlight-green" | "highlight-red" | "primary" | "default";
  className?: ClassValue;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-w-fit items-center rounded-md bg-gs-1 px-2 py-0.5 text-sm font-medium text-gray-600 border-[0.5px] border-gs-3",
        className,
        type === "highlight-yellow" && "border border-orange-1",
        type === "highlight-green" && "border border-green-1",
        type === "highlight-red" && "border border-red-1",
        type === "primary" && "border-primary bg-primary/10 text-primary",
      )}
    >
      {children}
    </span>
  );
}
