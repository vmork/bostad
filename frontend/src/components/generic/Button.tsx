import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";
import { type ButtonHTMLAttributes } from "react";

const buttonVariants = cva(
  "flex items-center rounded-xl border cursor-pointer hover:brightness-95 disabled:cursor-not-allowed disabled:hover:brightness-100",
  {
    variants: {
      variant: {
        default: "border-gs-3/50 bg-gs-0 text-dark",
        dark: "border-gs-3/50 bg-gs-1 text-gs-4",
        icon: "border-none bg-gs-0 p-0",
      },
      size: {
        default: "px-2 py-2",
        large: "h-10 px-2 py-2"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}