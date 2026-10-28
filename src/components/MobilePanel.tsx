import { type ReactNode, useEffect } from "react";
import { X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function MobilePanel({
  open,
  onOpenChange,
  title,
  description,
  side = "bottom",
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  side?: "bottom" | "fullscreen";
  children: ReactNode;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "fixed z-[200] border-border bg-background/98 p-0 text-foreground shadow-2xl backdrop-blur-xl [&>button]:hidden",
          side === "fullscreen"
            ? "inset-0 h-dvh w-screen max-w-none rounded-none"
            : "inset-x-0 bottom-0 top-auto max-h-[85dvh] w-screen max-w-none rounded-t-3xl border-x-0 border-b-0",
          "flex flex-col overflow-hidden",
          className
        )}
        aria-describedby={description ? "mobile-panel-description" : undefined}
      >
        <DialogHeader className="shrink-0 border-b border-border bg-muted/50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="truncate text-sm font-black uppercase tracking-[0.15em] text-foreground Oswald">
                {title}
              </DialogTitle>
              {description && (
                <DialogDescription id="mobile-panel-description" className="mt-1 text-xs text-muted-foreground">
                  {description}
                </DialogDescription>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="min-h-11 min-w-11 shrink-0 rounded-xl text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              onClick={() => onOpenChange(false)}
              aria-label={`Fechar ${title}`}
            >
              <X className="h-6 w-6" />
            </Button>
          </div>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}
