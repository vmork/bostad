import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type HTMLAttributes,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import { ChevronLeftIcon } from "lucide-react";
import { cn } from "../../lib/utils";

import { usePositioning, type Side } from "../../hooks/usePositioning";

type DropdownTriggerMode = "click" | "hover";

type RootContextValue = {
  rootId: string;
  open: boolean;
  setOpen: (nextOpen: boolean) => void;
  closeAll: () => void;
  triggerRef: React.MutableRefObject<HTMLElement | null>;
  contentRef: React.MutableRefObject<HTMLDivElement | null>;
  preferredSide: Side;
  triggerMode: DropdownTriggerMode;
  portal: boolean;
  isMobile: boolean;
  closeOnSelect: boolean;
  gap: number;
  viewportPadding: number;
  closeDelay: number;
  scheduleClose: () => void;
  cancelClose: () => void;
};

type SubmenuContextValue = {
  open: boolean;
  setOpen: (nextOpen: boolean) => void;
  close: () => void;
  title?: string;
  preferredSide: Side;
  triggerRef: React.MutableRefObject<HTMLElement | null>;
  contentRef: React.MutableRefObject<HTMLDivElement | null>;
  scheduleClose: () => void;
  cancelClose: () => void;
};

type DropdownRootProps = {
  children: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  preferredSide?: Side;
  triggerMode?: DropdownTriggerMode;
  portal?: boolean;
  mobileBreakpoint?: number;
  closeOnSelect?: boolean;
  gap?: number;
  viewportPadding?: number;
  closeDelay?: number;
};

type DropdownTriggerProps = {
  children: ReactNode;
  className?: string;
  asChild?: boolean;
};

type DropdownContentProps = {
  children: ReactNode;
  className?: string;
  preferredSide?: Side;
};

type DropdownItemProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  keepOpen?: boolean;
  inset?: boolean;
};

type DropdownSeparatorProps = {
  className?: string;
};

type DropdownSubmenuProps = {
  children: ReactNode;
  title?: string;
  preferredSide?: Side;
};

const RootContext = createContext<RootContextValue | null>(null);
const SubmenuContext = createContext<SubmenuContextValue | null>(null);

// ----- Utilities -----

// Merge refs so positioning logic can anchor to the real trigger node even when a custom child is used.
function composeRefs<T>(...refs: Array<Ref<T> | undefined>) {
  return (node: T | null) => {
    refs.forEach((ref) => {
      if (!ref) {
        return;
      }
      if (typeof ref === "function") {
        ref(node);
        return;
      }
      (ref as React.MutableRefObject<T | null>).current = node;
    });
  };
}

// Preserve existing child handlers while still allowing the dropdown to control lifecycle events.
function composeEventHandlers<EventType extends { defaultPrevented?: boolean }>(
  theirHandler: ((event: EventType) => void) | undefined,
  ourHandler: ((event: EventType) => void) | undefined,
) {
  return (event: EventType) => {
    theirHandler?.(event);
    if (!event.defaultPrevented) {
      ourHandler?.(event);
    }
  };
}

function requireSingleElement(children: ReactNode) {
  const child = Children.only(children);
  if (!isValidElement(child)) {
    throw new Error("Dropdown requires a single React element child when asChild is enabled.");
  }
  return child as ReactElement<Record<string, unknown>> & {
    ref?: Ref<HTMLElement>;
  };
}

// Keep dropdown state usable as controlled or uncontrolled without splitting the API surface.
function useControllableOpenState({
  controlledOpen,
  defaultOpen,
  onOpenChange,
}: {
  controlledOpen?: boolean;
  defaultOpen: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  const setOpen = (nextOpen: boolean) => {
    if (!isControlled) {
      setUncontrolledOpen(nextOpen);
    }
    onOpenChange?.(nextOpen);
  };

  return [open, setOpen] as const;
}

// Small-screen mode changes submenu behavior from fly-out overlays into in-panel navigation.
function useIsBelowBreakpoint(breakpoint: number) {
  const [isBelowBreakpoint, setIsBelowBreakpoint] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.innerWidth < breakpoint;
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const mediaQuery = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const updateMatches = () => {
      setIsBelowBreakpoint(mediaQuery.matches);
    };

    updateMatches();
    mediaQuery.addEventListener("change", updateMatches);

    return () => {
      mediaQuery.removeEventListener("change", updateMatches);
    };
  }, [breakpoint]);

  return isBelowBreakpoint;
}

function useRootContext(componentName: string) {
  const context = useContext(RootContext);
  if (!context) {
    throw new Error(`${componentName} must be used inside Dropdown.Root.`);
  }
  return context;
}

function useSubmenuContext(componentName: string) {
  const context = useContext(SubmenuContext);
  if (!context) {
    throw new Error(`${componentName} must be used inside Dropdown.Submenu.`);
  }
  return context;
}

function createCloseController(onClose: () => void, delay: number) {
  const timeoutRef = { current: 0 };

  return {
    cancel: () => {
      window.clearTimeout(timeoutRef.current);
    },
    schedule: () => {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(onClose, delay);
    },
  };
}

// ----- Root -----

function DropdownRoot({
  children,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  preferredSide = "bottom",
  triggerMode = "click",
  portal = true,
  mobileBreakpoint = 768,
  closeOnSelect = false,
  gap = 5,
  viewportPadding = 6,
  closeDelay = 50,
}: DropdownRootProps) {
  const rootId = useId();
  const [open, setOpen] = useControllableOpenState({
    controlledOpen,
    defaultOpen,
    onOpenChange,
  });
  const triggerRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const isMobile = useIsBelowBreakpoint(mobileBreakpoint);
  const closeControllerRef = useRef<ReturnType<typeof createCloseController> | null>(null);

  if (typeof window !== "undefined" && !closeControllerRef.current) {
    closeControllerRef.current = createCloseController(() => setOpen(false), closeDelay);
  }

  const cancelClose = () => {
    closeControllerRef.current?.cancel();
  };

  const scheduleClose = () => {
    if (triggerMode !== "hover" || isMobile) {
      return;
    }
    closeControllerRef.current?.schedule();
  };

  const closeAll = () => {
    cancelClose();
    setOpen(false);
  };

  useEffect(() => {
    if (!open) {
      cancelClose();
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      if (target.closest(`[data-dropdown-root="${rootId}"]`)) {
        return;
      }
      closeAll();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeAll();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, rootId]);

  return (
    <RootContext.Provider
      value={{
        rootId,
        open,
        setOpen,
        closeAll,
        triggerRef,
        contentRef,
        preferredSide,
        triggerMode,
        portal,
        isMobile,
        closeOnSelect,
        gap,
        viewportPadding,
        closeDelay,
        scheduleClose,
        cancelClose,
      }}
    >
      {children}
    </RootContext.Provider>
  );
}

// ----- Trigger and content -----

function DropdownTrigger({ children, className, asChild = false }: DropdownTriggerProps) {
  const root = useRootContext("Dropdown.Trigger");

  const handleClick = (event: MouseEvent<HTMLElement>) => {
    if (!root.isMobile && root.triggerMode !== "click") {
      return;
    }
    if (event.button !== 0) {
      return;
    }
    root.cancelClose();
    root.setOpen(!root.open);
  };

  const handleMouseEnter = () => {
    if (root.triggerMode !== "hover" || root.isMobile) {
      return;
    }
    root.cancelClose();
    root.setOpen(true);
  };

  const handleMouseLeave = () => {
    root.scheduleClose();
  };

  if (asChild) {
    const child = requireSingleElement(children);
    const childProps = child.props as HTMLAttributes<HTMLElement> & {
      className?: string;
    };

    return cloneElement(child, {
      ...childProps,
      ref: composeRefs(child.ref, root.triggerRef),
      "data-dropdown-root": root.rootId,
      "aria-expanded": root.open,
      className: cn(childProps.className, className),
      onClick: composeEventHandlers(childProps.onClick, handleClick),
      onMouseEnter: composeEventHandlers(childProps.onMouseEnter, handleMouseEnter),
      onMouseLeave: composeEventHandlers(childProps.onMouseLeave, handleMouseLeave),
    });
  }

  return (
    <div
      ref={root.triggerRef as Ref<HTMLDivElement>}
      data-dropdown-root={root.rootId}
      aria-expanded={root.open}
      className={className}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
    </div>
  );
}

function DropdownContent({ children, className, preferredSide }: DropdownContentProps) {
  const root = useRootContext("Dropdown.Content");
  const position = usePositioning({
    open: root.open,
    anchorRef: root.triggerRef,
    contentRef: root.contentRef,
    preferredSide: preferredSide ?? root.preferredSide,
    gap: root.gap,
    viewportPadding: root.viewportPadding,
  });

  if (!root.open) {
    return null;
  }

  const contentNode = (
    <div
      ref={root.contentRef}
      data-dropdown-root={root.rootId}
      className={cn(
        "relative z-50 min-w-64 max-w-[min(24rem,calc(100vw-1.5rem))] overflow-hidden rounded-md border border-gs-2 bg-gs-0 shadow-[0_24px_60px_rgba(15,23,42,0.18)]",
        "max-h-[min(40rem,calc(100vh-1.5rem))] overflow-y-auto",
        className,
      )}
      style={{
        position: "fixed",
        left: position?.left ?? -9999,
        top: position?.top ?? -9999,
        visibility: position ? "visible" : "hidden",
      }}
      onMouseEnter={root.cancelClose}
      onMouseLeave={root.scheduleClose}
    >
      {children}
    </div>
  );

  if (!root.portal || typeof document === "undefined") {
    return contentNode;
  }

  return createPortal(contentNode, document.body);
}

// ----- Menu helpers -----

function DropdownItem({
  children,
  className,
  keepOpen = false,
  onClick,
  type = "button",
  ...props
}: DropdownItemProps) {
  const root = useRootContext("Dropdown.Item");

  return (
    <button
      type={type}
      data-dropdown-root={root.rootId}
      className={cn("flex w-full items-center px-2 py-2 text-left text-sm text-dark", className)}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented && root.closeOnSelect && !keepOpen) {
          root.closeAll();
        }
      }}
      {...props}
    >
      {children}
    </button>
  );
}

function DropdownSeparator({ className }: DropdownSeparatorProps) {
  const root = useRootContext("Dropdown.Separator");

  return (
    <div
      data-dropdown-root={root.rootId}
      className={cn("mx-3 my-1 h-px bg-gs-2", className)}
      aria-hidden="true"
    />
  );
}

// ----- Nested submenus -----

function DropdownSubmenu({ children, title, preferredSide = "right" }: DropdownSubmenuProps) {
  const root = useRootContext("Dropdown.Submenu");
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const closeControllerRef = useRef<ReturnType<typeof createCloseController> | null>(null);

  if (typeof window !== "undefined" && !closeControllerRef.current) {
    closeControllerRef.current = createCloseController(() => setOpen(false), root.closeDelay);
  }

  const cancelClose = () => {
    closeControllerRef.current?.cancel();
  };

  const scheduleClose = () => {
    if (root.triggerMode !== "hover" || root.isMobile) {
      return;
    }
    closeControllerRef.current?.schedule();
  };

  useEffect(() => {
    if (!root.open) {
      setOpen(false);
      cancelClose();
    }
  }, [root.open]);

  return (
    <SubmenuContext.Provider
      value={{
        open,
        setOpen,
        close: () => setOpen(false),
        title,
        preferredSide,
        triggerRef,
        contentRef,
        cancelClose,
        scheduleClose,
      }}
    >
      {children}
    </SubmenuContext.Provider>
  );
}

function DropdownSubmenuTrigger({ children, className, asChild = false }: DropdownTriggerProps) {
  const root = useRootContext("Dropdown.SubmenuTrigger");
  const submenu = useSubmenuContext("Dropdown.SubmenuTrigger");

  const handleClick = () => {
    if (!root.isMobile && root.triggerMode !== "click") {
      return;
    }
    submenu.cancelClose();
    submenu.setOpen(!submenu.open);
  };

  const handleMouseEnter = () => {
    if (root.triggerMode !== "hover" || root.isMobile) {
      return;
    }
    submenu.cancelClose();
    submenu.setOpen(true);
  };

  const handleMouseLeave = () => {
    submenu.scheduleClose();
  };

  if (asChild) {
    const child = requireSingleElement(children);
    const childProps = child.props as HTMLAttributes<HTMLElement> & {
      className?: string;
    };

    return cloneElement(child, {
      ...childProps,
      ref: composeRefs(child.ref, submenu.triggerRef),
      "data-dropdown-root": root.rootId,
      "aria-expanded": submenu.open,
      className: cn(childProps.className, className),
      onClick: composeEventHandlers(childProps.onClick, handleClick),
      onMouseEnter: composeEventHandlers(childProps.onMouseEnter, handleMouseEnter),
      onMouseLeave: composeEventHandlers(childProps.onMouseLeave, handleMouseLeave),
    });
  }

  return (
    <button
      type="button"
      ref={submenu.triggerRef as Ref<HTMLButtonElement>}
      data-dropdown-root={root.rootId}
      aria-expanded={submenu.open}
      className={className}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
    </button>
  );
}

function DropdownSubmenuContent({ children, className, preferredSide }: DropdownContentProps) {
  const root = useRootContext("Dropdown.SubmenuContent");
  const submenu = useSubmenuContext("Dropdown.SubmenuContent");
  const position = usePositioning({
    open: submenu.open && !root.isMobile,
    anchorRef: submenu.triggerRef,
    contentRef: submenu.contentRef,
    preferredSide: preferredSide ?? submenu.preferredSide,
    gap: root.gap,
    viewportPadding: root.viewportPadding,
  });

  if (!submenu.open) {
    return null;
  }

  if (root.isMobile) {
    return (
      <div
        ref={submenu.contentRef}
        data-dropdown-root={root.rootId}
        className={cn(
          "absolute inset-0 z-10 flex h-full flex-col bg-gs-0",
          "max-h-[min(28rem,calc(100vh-1.5rem))] overflow-hidden",
          className,
        )}
      >
        <div className="flex items-center gap-2 border-b border-gs-2 px-3 py-2">
          <button
            type="button"
            data-dropdown-root={root.rootId}
            aria-label={`Back to ${submenu.title ?? "previous menu"}`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-gs-2 text-dark transition-colors hover:bg-black/5"
            onClick={() => submenu.close()}
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <p className="text-[0.7rem] uppercase tracking-[0.2em] text-gs-3">Back</p>
            <p className="truncate text-sm font-medium text-dark">{submenu.title ?? "Submenu"}</p>
          </div>
        </div>
        <div className="relative flex-1 overflow-y-auto">{children}</div>
      </div>
    );
  }

  const contentNode = (
    <div
      ref={submenu.contentRef}
      data-dropdown-root={root.rootId}
      className={cn(
        "relative z-50 min-w-60 max-w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-md border border-gs-3 bg-gs-0 shadow-[0_22px_48px_rgba(15,23,42,0.16)]",
        "max-h-[min(24rem,calc(100vh-1.5rem))] overflow-y-auto",
        className,
      )}
      style={{
        position: "fixed",
        left: position?.left ?? -9999,
        top: position?.top ?? -9999,
        visibility: position ? "visible" : "hidden",
      }}
      onMouseEnter={submenu.cancelClose}
      onMouseLeave={submenu.scheduleClose}
    >
      {children}
    </div>
  );

  if (!root.portal || typeof document === "undefined") {
    return contentNode;
  }

  return createPortal(contentNode, document.body);
}

export const Dropdown = {
  Root: DropdownRoot,
  Trigger: DropdownTrigger,
  Content: DropdownContent,
  Item: DropdownItem,
  Separator: DropdownSeparator,
  Submenu: DropdownSubmenu,
  SubmenuTrigger: DropdownSubmenuTrigger,
  SubmenuContent: DropdownSubmenuContent,
};
