import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription 
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, History, Trash2, CheckCircle2, XCircle, Clock, MapPin, X, AlertCircle, RefreshCw } from "lucide-react";
import { get_my_history } from "@/lib/player-history.functions";
import { leave_registration } from "@/lib/public.functions";
import { getRegistrationSituation } from "@/lib/registration-classification";
import { toast } from "sonner";
import { friendlyError } from "@/lib/error-messages";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { cn } from "@/lib/utils";

function formatDatePtBr(iso: string): string {
  const [y, m, d] = (iso || "").split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  const weekday = date.toLocaleDateString("pt-BR", { weekday: "long" });
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  
  const capitalizedWeekday = (weekday || "").split("-")[0];
  const formattedWeekday = capitalizedWeekday.charAt(0).toUpperCase() + capitalizedWeekday.slice(1);
  return `${formattedWeekday}, ${day}/${month}/${y}`;
}

export function MyHistoryDialog({
  open,
  onOpenChange,
  onChanged,
  player,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChanged: () => void | Promise<void>;
  player: any;
}) {
  const qc = useQueryClient();
  const getHistory = useServerFn(get_my_history);
  const leaveFn = useServerFn(leave_registration);

  const q = useQuery({
    queryKey: ["my-history", player?.id ?? null],
    queryFn: () => getHistory({ data: { limit: 30 } }),
    enabled: open && !!player?.id,
    retry: 1,
  });

  const [busyId, setBusyId] = useState<string | null>(null);

  const history = (q.data?.registrations ?? []) as any[];
  const today = new Date().toISOString().slice(0, 10);
  
  const currentRegs = history.filter(r => {
    if (r.cancelled_at) return false;
    if (r.event_status === 'scheduled' || r.event_status === 'open' || r.event_status === 'closed') return true;
    return r.event_date === today && r.event_status !== 'completed' && r.event_status !== 'cancelled';
  });
  const nextReg = currentRegs[0] ?? null;
  const recentHistory = history.filter(r => r.id !== nextReg?.id);
  const nextSituation = nextReg ? getRegistrationSituation([nextReg], nextReg.main_limit, player?.id ?? (q.data as any)?.player_id ?? null) : null;

  const doLeave = async (id: string) => {
    if (busyId) return;
    setBusyId(id);
    const loadingToast = toast.loading("Processando retirada...");
    try {
      await leaveFn({ data: { registration_id: id } });
      toast.success("Inscrição retirada.", { id: loadingToast });
      await onChanged();
      await qc.invalidateQueries({ queryKey: ["my-history"] });
      await qc.invalidateQueries({ queryKey: ["my-regs"] });
      await qc.invalidateQueries({ queryKey: ["event-full"] });
      q.refetch();
    } catch (e) {
      toast.error(friendlyError(e), { id: loadingToast });
    } finally {
      setBusyId(null);
    }
  };

  const getPositionLabel = (r: any) => {
    const situation = getRegistrationSituation([r], r.main_limit, player?.id ?? (q.data as any)?.player_id ?? null);
    if (situation.isStarter) return "LISTA PRINCIPAL";
    if (situation.isReserve) return "RESERVA";
    return "SEM POSIÇÃO";
  };

  const getHistoryStatus = (r: any) => {
    if (r.cancelled_at) return { label: "Retirou", color: "text-red-600 dark:text-red-400 bg-red-500/10" };
    if (r.event_status === 'cancelled') return { label: "Cancelada", color: "text-zinc-600 dark:text-zinc-400 bg-zinc-500/10" };
    return { label: "Inscrito", color: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10" };
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--text)] max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] sm:max-w-lg rounded-2xl p-0 flex flex-col shadow-2xl overflow-hidden [&>button]:hidden transition-colors"
        aria-describedby="history-description"
      >
        <DialogHeader className="px-5 py-4 border-b border-[var(--card-border)] bg-[color-mix(in_srgb,var(--card-bg)_92%,transparent)] flex flex-row items-center justify-between shrink-0 space-y-0">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-[var(--accent-neon)]" />
            <DialogTitle className="text-base font-black Oswald uppercase tracking-wider text-[var(--text)]">
              MINHAS INSCRIÇÕES
            </DialogTitle>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Fechar"
            className="h-9 w-9 text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-lg -mr-1"
            onClick={() => onOpenChange(false)}
          >
            <X className="w-5 h-5" />
          </Button>
          <DialogDescription id="history-description" className="sr-only">Histórico de participações e próxima inscrição</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* PRÓXIMO JOGO */}
          <section className="space-y-2">
            <h3 className="text-[11px] Oswald uppercase font-black text-[var(--text-muted)] tracking-wider">Próxima Inscrição</h3>
            {q.isLoading || q.isFetching ? (
              <Skeleton className="h-28 w-full bg-[color-mix(in_srgb,var(--card-bg)_90%,var(--text)_10%)] border border-[var(--card-border)] rounded-xl" />
            ) : q.isError ? (
              <div className="p-6 rounded-xl bg-red-500/10 border border-red-500/20 text-center space-y-3">
                <AlertCircle className="w-6 h-6 text-red-400 mx-auto" />
                <p className="text-xs Oswald uppercase font-bold text-red-300">Falha ao carregar suas inscrições.</p>
                <Button onClick={() => q.refetch()} className="h-8 px-3 bg-[var(--accent-neon)] text-white Oswald uppercase text-[10px] font-black">
                  <RefreshCw className="w-3 h-3 mr-1.5" /> Tentar novamente
                </Button>
              </div>
            ) : nextReg ? (
              <div className="p-4 rounded-xl bg-[color-mix(in_srgb,var(--card-bg)_90%,var(--text)_10%)] border border-[var(--card-border)] hover:border-[var(--accent-neon)]/40 transition-all space-y-3">
                <div className="flex justify-between items-start gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-[var(--accent-neon)]">
                      <Calendar size={12} />
                      <p className="text-[10px] Oswald font-bold uppercase tracking-wider">
                        {formatDatePtBr(nextReg.event_date)}
                      </p>
                    </div>
                    <h4 className="text-base font-black Oswald text-[var(--text)] uppercase leading-tight">
                      {nextReg.group_name}
                    </h4>
                  </div>
                  <Badge className="bg-[var(--accent-neon)]/15 text-[var(--accent-neon)] border-[var(--accent-neon)]/30 Oswald uppercase text-[9px] font-black tracking-wider px-2 py-0.5">
                    {getPositionLabel(nextReg)}
                  </Badge>
                </div>
                
                <div className="flex items-center justify-between pt-3 border-t border-[var(--card-border)]">
                  <div className="flex flex-col">
                    <span className="text-[9px] text-[var(--text-muted)] uppercase font-bold Oswald">Posição na lista</span>
                    <span className="text-xs font-black Oswald text-[var(--text)] uppercase">
                      {nextSituation?.position ? `${nextSituation.position}ª POSIÇÃO` : "A DEFINIR"}
                    </span>
                    <span className="text-[9px] text-[var(--text-muted)] uppercase font-medium">
                      {nextReg.event_time ? `Horário: ${String(nextReg.event_time).slice(0, 5).replace(":", "h")}` : "Horário a confirmar"}
                    </span>
                  </div>
                  
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-9 px-3 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-500/10 Oswald uppercase text-[10px] font-black border border-red-500/30 rounded-lg"
                    onClick={() => doLeave(nextReg.id)}
                    disabled={busyId === nextReg.id}
                  >
                    {busyId === nextReg.id ? "AGUARDE..." : "RETIRAR"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="p-6 rounded-xl bg-[color-mix(in_srgb,var(--card-bg)_85%,transparent)] border border-dashed border-[var(--card-border)] text-center">
                <p className="text-xs Oswald uppercase font-bold text-[var(--text-muted)]">Nenhuma inscrição ativa no momento.</p>
              </div>
            )}
          </section>

          {/* HISTÓRICO RECENTE */}
          <section className="space-y-2">
            <h3 className="text-[11px] Oswald uppercase font-black text-[var(--text-muted)] tracking-wider">Rodadas Anteriores</h3>
            {q.isLoading || q.isFetching ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full bg-[color-mix(in_srgb,var(--card-bg)_90%,var(--text)_10%)] border border-[var(--card-border)] rounded-lg" />
                <Skeleton className="h-12 w-full bg-[color-mix(in_srgb,var(--card-bg)_90%,var(--text)_10%)] border border-[var(--card-border)] rounded-lg" />
              </div>
            ) : q.isError ? (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-center">
                <p className="text-xs Oswald uppercase font-bold text-red-300">Não foi possível carregar o histórico.</p>
              </div>
            ) : recentHistory.length > 0 ? (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {recentHistory.map((r) => {
                  const status = getHistoryStatus(r);
                  return (
                    <div key={r.id} className="p-3 rounded-lg bg-[color-mix(in_srgb,var(--card-bg)_90%,var(--text)_10%)] border border-[var(--card-border)] flex items-center justify-between">
                      <div className="space-y-0.5">
                        <p className="text-[10px] Oswald font-bold text-[var(--text-muted)] uppercase">
                          {formatDatePtBr(r.event_date).split(',')[0]} · {r.event_date.split('-').reverse().slice(0,2).join('/')}
                        </p>
                        <p className="text-xs Oswald font-bold text-[var(--text)] uppercase">{r.group_name}</p>
                      </div>
                      <Badge variant="outline" className={cn("border-none Oswald uppercase text-[8px] font-black px-2 py-0.5 rounded", status.color)}>
                        {status.label}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-6 text-center space-y-2 border border-dashed border-[var(--card-border)] rounded-xl">
                <History size={24} className="mx-auto text-[var(--text-muted)]" />
                <p className="text-xs Oswald uppercase font-bold text-[var(--text-muted)]">
                  Você ainda não participou de rodadas anteriores.
                </p>
              </div>
            )}
          </section>
        </div>

        <div className="p-4 border-t border-[var(--card-border)] bg-[color-mix(in_srgb,var(--card-bg)_92%,transparent)] shrink-0">
          <Button 
            className="w-full h-11 rounded-xl bg-[color-mix(in_srgb,var(--card-bg)_90%,var(--text)_10%)] hover:bg-[color-mix(in_srgb,var(--card-bg)_82%,var(--text)_18%)] border border-[var(--card-border)] text-[var(--text-muted)] Oswald font-black uppercase text-xs tracking-wider transition-all"
            onClick={() => onOpenChange(false)}
          >
            VOLTAR
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
