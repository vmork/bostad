import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/utils";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Extra classes on the content container */
  className?: string;
};

/**
 * Generic modal dialog rendered via portal.
 * Handles backdrop click-to-close, Escape key, and body scroll lock.
 */
export function Modal({ open, onClose, children, className }: ModalProps) {
  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop — behind content, closes on click */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      {/* Content — isolated stacking context so backdrop doesn't intercept children */}
      <div
        className={cn(
          "relative z-10 isolate overflow-hidden rounded-md border border-gs-2 bg-gs-0",
          "shadow-[0_24px_60px_rgba(15,23,42,0.18)]",
          className,
        )}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
