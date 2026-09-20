import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { IconButton } from "./IconButton.jsx";
import { createContext, useContext } from "react";
import useBackHandler from "../useBackHandler.js";

const DialogDepth = createContext(0);

export function Dialog({ open, onOpenChange, children, ...props }) {
  const depth = useContext(DialogDepth);
  useBackHandler(open, () => onOpenChange?.(false), 10 + depth);
  return (
    <DialogDepth.Provider value={depth + 1}>
      <DialogPrimitive.Root {...props} open={open} onOpenChange={onOpenChange}>
        {children}
      </DialogPrimitive.Root>
    </DialogDepth.Provider>
  );
}

export function DialogContent({ className = "", children, forceBackdrop = false, ...props }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop
        forceRender={forceBackdrop}
        data-slot="dialog-overlay"
        className="fixed inset-0 isolate z-50 bg-black/10 supports-backdrop-filter:backdrop-blur-xs"
      />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={`fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 outline-none sm:max-w-sm ${className}`}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          data-slot="dialog-close"
          aria-label="关闭弹窗"
          render={<IconButton className="absolute top-2 right-2" />}
        >
          <X />
        </DialogPrimitive.Close>
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

export function DialogTitle({ className = "", ...props }) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={`font-heading text-base leading-none font-medium ${className}`}
      {...props}
    />
  );
}

export function DialogDescription({ className = "", ...props }) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={`text-sm text-muted-foreground ${className}`}
      {...props}
    />
  );
}
