"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// A bottom sheet — an iOS-idiomatic overlay that slides up from the bottom edge.
// Built on Radix Dialog (same primitive as components/ui/dialog.tsx) but anchored
// to the bottom, full-width, with a rounded top and safe-area padding.

function Sheet(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger(props: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose(props: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="sheet-close" {...props} />;
}

// How far (px) the sheet must be dragged down before release dismisses it.
const SWIPE_DISMISS_THRESHOLD = 100;

function SheetContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean;
}) {
  // Swipe-to-dismiss. Radix Dialog has no drag gesture, so the grab handle would
  // otherwise be a lie. Handlers live only on the handle region, so dragging
  // never conflicts with scrolling the sheet body. On release past the
  // threshold we click a hidden Close so Radix runs its normal exit animation.
  const closeRef = React.useRef<HTMLButtonElement>(null);
  const dragStartY = React.useRef<number | null>(null);
  const [dragY, setDragY] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);

  const onTouchStart = (e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
    setDragging(true);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (dragStartY.current == null) return;
    const dy = e.touches[0].clientY - dragStartY.current;
    setDragY(dy > 0 ? dy : 0); // downward only
  };
  const onTouchEnd = () => {
    if (dragY > SWIPE_DISMISS_THRESHOLD) closeRef.current?.click();
    setDragY(0);
    setDragging(false);
    dragStartY.current = null;
  };

  return (
    <DialogPrimitive.Portal data-slot="sheet-portal">
      <DialogPrimitive.Overlay
        data-slot="sheet-overlay"
        className={cn(
          "fixed inset-0 z-50 bg-black/60",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        )}
      />
      <DialogPrimitive.Content
        data-slot="sheet-content"
        style={{
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          transition: dragging ? "none" : "transform 0.2s ease-out",
        }}
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-2xl",
          // dvh (dynamic viewport height) — NOT vh — so the sheet never extends
          // behind iOS Safari's top chrome, which would hide the grab handle +
          // close button. vh counts the area under the browser bars; dvh doesn't.
          "flex max-h-[92dvh] flex-col rounded-t-2xl border-t border-border bg-card shadow-lg outline-none",
          "pb-[max(1rem,env(safe-area-inset-bottom))]",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
          "data-[state=closed]:duration-200 data-[state=open]:duration-300",
          className
        )}
        {...props}
      >
        {/* Grab handle — draggable region (touch-action:none so it drags, not scrolls) */}
        <div
          className="mx-auto flex w-full shrink-0 cursor-grab justify-center pt-2 pb-1"
          style={{ touchAction: "none" }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          aria-hidden
        >
          <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
        </div>
        {children}
        {/* Always rendered (visually hidden when showCloseButton is false) so
            swipe-to-dismiss has a Close to trigger. */}
        <DialogPrimitive.Close
          ref={closeRef}
          data-slot="sheet-close"
          className={cn(
            "absolute right-4 top-3 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring [&_svg]:size-4",
            !showCloseButton && "sr-only"
          )}
        >
          <XIcon />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("shrink-0 px-4 pt-3 pb-2 border-b border-border", className)}
      {...props}
    />
  );
}

function SheetBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="sheet-body" className={cn("flex-1 overflow-y-auto px-4 py-4", className)} {...props} />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("shrink-0 flex items-center gap-2 px-4 pt-3 border-t border-border", className)}
      {...props}
    />
  );
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-base font-semibold leading-none", className)}
      {...props}
    />
  );
}

function SheetDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
