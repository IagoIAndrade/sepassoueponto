import { useEffect, type ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { registerUnsaved } from "@/lib/unsaved-guard";

/** Registra a seção no guarda global de alterações não salvas. */
export function useUnsavedSection(label: string, isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return;
    return registerUnsaved(label, () => true);
  }, [label, isDirty]);
}

export function UnsavedBadge({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className="shrink-0 rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
      Não salvo
    </span>
  );
}

export function ScopeBadge({ scope }: { scope: string }) {
  return (
    <span className="shrink-0 rounded-full border border-brand-border bg-muted/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      {scope}
    </span>
  );
}

export function ConfigSection({
  title,
  description,
  scope,
  dirty,
  actions,
  children,
}: {
  title: string;
  description?: ReactNode;
  scope?: string;
  dirty?: boolean;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="space-y-3 p-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
        <div className="min-w-0">
          <h3 className="font-display text-sm font-bold uppercase tracking-wider text-brand-white">
            {title}
          </h3>
          {description && (
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{description}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {scope && <ScopeBadge scope={scope} />}
          <UnsavedBadge show={!!dirty} />
        </div>
      </div>

      <div className="space-y-3">{children}</div>

      {actions && (
        <div className="flex flex-wrap justify-end gap-2 border-t border-border/40 pt-3">
          {actions}
        </div>
      )}
    </Card>
  );
}
