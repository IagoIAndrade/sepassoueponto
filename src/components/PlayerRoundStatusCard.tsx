import React, { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlayerEventStatus as StatusType } from "@/lib/players-signup.types";
import {
  Lock,
  Unlock,
  Calendar,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock,
  LogOut,
  UserPlus,
  Loader2,
  ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export interface PlayerRoundStatusCardProps {
  status: StatusType | "starter" | "reserve";
  position?: number;
  event: any;
  settings: any;
  mainCount?: number;
  waitlistCount?: number;
  priorityBlocksMe?: boolean;
  priorityEndAt?: Date | null;
  hasPriority?: boolean;
  roundState?: any;
  guestEnabled?: boolean;
  guestReleaseAt?: Date | null;
  onJoin?: () => void;
  canJoin?: boolean;
  joinLoading?: boolean;
  joinBlockedReason?: string | null;
  onLeave?: () => void;
  canLeave?: boolean;
  leaveLoading?: boolean;
  isLoggedIn?: boolean;
  onLogin?: () => void;
  onAddGuest?: () => void;
  canAddGuest?: boolean;
}

function formatTimeRemaining(diffMs: number) {
  if (diffMs <= 0) return null;
  const totalSeconds = Math.floor(diffMs / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  const parts = [];
  if (h > 0) parts.push(`${String(h).padStart(2, "0")}h`);
  if (m > 0 || h > 0) parts.push(`${String(m).padStart(2, "0")}min`);
  parts.push(`${String(s).padStart(2, "0")}s`);

  return parts.join(" ");
}

function formatDateTime(date: Date) {
  return format(date, "dd/MM 'às' HH'h'mm", { locale: ptBR });
}

function formatTimeStr(t: string | null | undefined): string {
  if (!t) return "";
  return t.slice(0, 5).replace(":", "h");
}

export function PlayerRoundStatusCard({
  status,
  position,
  event,
  settings,
  mainCount = 0,
  waitlistCount = 0,
  priorityBlocksMe,
  priorityEndAt,
  hasPriority,
  roundState,
  guestEnabled,
  guestReleaseAt,
  onJoin,
  canJoin = true,
  joinLoading = false,
  joinBlockedReason,
  onLeave,
  canLeave = false,
  leaveLoading = false,
  isLoggedIn = true,
  onLogin,
  onAddGuest,
  canAddGuest = false,
}: PlayerRoundStatusCardProps) {
  const [now, setNow] = useState(Date.now());
  const [rulesOpen, setRulesOpen] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [event?.id]);

  if (!event) {
    return (
      <Card className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4 text-center text-[var(--text-muted)]">
        <p className="text-[11px] font-black uppercase tracking-widest Oswald">Nenhuma rodada ativa para esta turma.</p>
      </Card>
    );
  }

  const openAt = roundState?.openAt;
  const actualStatus = event?.status;
  const isPending = roundState?.isPending;

  const isWindowZero =
    openAt && priorityEndAt && Math.abs(openAt.getTime() - priorityEndAt.getTime()) < 60000;

  const blocks: { title: string; date: Date; isPast: boolean }[] = [];

  if (isWindowZero) {
    if (openAt) {
      blocks.push({
        title: "Abertura geral",
        date: openAt,
        isPast: now >= openAt.getTime(),
      });
    }
  } else {
    if (openAt) {
      blocks.push({
        title: "Abertura prioritária",
        date: openAt,
        isPast: now >= openAt.getTime(),
      });
    }
    if (priorityEndAt) {
      blocks.push({
        title: "Liberação geral",
        date: priorityEndAt,
        isPast: now >= priorityEndAt.getTime(),
      });
    }
  }

  if (guestEnabled && guestReleaseAt) {
    blocks.push({
      title: "Convidados",
      date: guestReleaseAt,
      isPast: now >= guestReleaseAt.getTime(),
    });
  }

  const nextFutureBlock = blocks.find((b) => !b.isPast);

  // Status da rodada
  const roundStatusConfig = (() => {
    if (roundState?.phase === "scheduled" || actualStatus === "scheduled") {
      return {
        label: isPending ? "Verificando..." : "Aguardando",
        badgeCls: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40",
        dotCls: "bg-amber-400 shadow-[0_0_8px_#f59e0b]",
      };
    }
    if (
      roundState?.phase === "closed" ||
      actualStatus === "closed" ||
      actualStatus === "completed" ||
      actualStatus === "cancelled"
    ) {
      return {
        label: "Encerrada",
        badgeCls: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/40",
        dotCls: "bg-red-400 shadow-[0_0_8px_#ef4444]",
      };
    }
    return {
      label: "Aberta",
      badgeCls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40",
      dotCls: "bg-emerald-400 shadow-[0_0_8px_#10b981]",
    };
  })();

  // Dia e data formatados
  const eventDateObj = event?.event_date ? new Date(event.event_date + "T12:00:00") : null;
  const weekdayLabel = eventDateObj
    ? new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(eventDateObj)
    : "";
  const dateFormatted = eventDateObj
    ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(eventDateObj)
    : "—";
  const timeRange =
    event?.start_time && event?.end_time
      ? `${formatTimeStr(event.start_time)} - ${formatTimeStr(event.end_time)}`
      : event?.start_time
      ? `${formatTimeStr(event.start_time)}`
      : "";

  const mainLimit = settings?.main_limit || 18;
  const isStarter = status === "starter" || (status as string) === "MAIN_LIST";
  const isReserve = status === "reserve" || (status as string) === "WAITLIST";
  const isRegistered = isStarter || isReserve;

  return (
    <div className="space-y-2.5">
      {/* CARD PRINCIPAL (Grafite Neon) */}
      <Card className="relative overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4 text-[var(--text)] shadow-[0_8px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.5)]">
        {/* Linha 1: Data, Hora e Badge de Status */}
        <div className="flex items-center justify-between gap-2 border-b border-[var(--card-border)] pb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-black uppercase tracking-wider text-[var(--text)] Oswald">
                {weekdayLabel ? weekdayLabel.toUpperCase() : "RODADA"} • {dateFormatted}
              </span>
              {timeRange && (
                <span className="text-[11px] font-bold text-[var(--text-muted)] Oswald">• {timeRange}</span>
              )}
            </div>
          </div>

          <div
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest Oswald",
              roundStatusConfig.badgeCls
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full animate-pulse", roundStatusConfig.dotCls)} />
            {roundStatusConfig.label}
          </div>
        </div>

        {/* Linha 2: Ocupação Titulares e Reservas */}
        <div className="grid grid-cols-2 gap-2.5 py-3">
          <div className="rounded-xl border border-[var(--card-border)] bg-[color-mix(in_srgb,var(--card-bg)_92%,var(--text)_8%)] p-3 transition-colors ring-1 ring-white/5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] Oswald">
                Titulares
              </span>
              <span className="text-[9px] font-black text-[var(--accent-neon)] uppercase Oswald px-1.5 py-0.5 rounded bg-[var(--accent-neon)]/10 border border-[var(--accent-neon)]/20">
                Max {mainLimit}
              </span>
            </div>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className="text-3xl font-black text-[var(--text)] Oswald tracking-tight tabular-nums">
                {mainCount}
              </span>
              <span className="text-xs font-bold text-[var(--text-muted)] Oswald tabular-nums">/ {mainLimit}</span>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--card-border)] bg-[color-mix(in_srgb,var(--card-bg)_92%,var(--text)_8%)] p-3 transition-colors ring-1 ring-white/5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] Oswald">
                Reservas
              </span>
              <span className="text-[9px] font-black text-amber-400 uppercase Oswald px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                Fila
              </span>
            </div>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className="text-3xl font-black text-[var(--text)] Oswald tracking-tight tabular-nums">
                {waitlistCount}
              </span>
              <span className="text-xs font-bold text-[var(--text-muted)] Oswald">na espera</span>
            </div>
          </div>
        </div>

        {/* Linha 3: Situação Pessoal do Jogador */}
        <div className="border-t border-[var(--card-border)] pt-3">
          {isRegistered ? (
            <div className="flex flex-col gap-2.5">
              <div
                className={cn(
                  "flex items-center justify-between rounded-xl border p-2.5",
                  isStarter
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                )}
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <div className="flex flex-col leading-tight">
                    <span className="text-[11px] font-black uppercase tracking-wider Oswald">
                      {isStarter ? "VOCÊ ESTÁ INSCRITO" : "VOCÊ ESTÁ NA ESPERA"}
                    </span>
                    <span className="text-[9px] font-bold uppercase opacity-80 Oswald">
                      {isStarter
                        ? `Posição #${position ?? "—"} na Lista Principal`
                        : `Posição #${position ?? "—"} na Fila de Espera`}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                {canAddGuest && onAddGuest && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onAddGuest}
                    className="h-10 flex-1 rounded-xl border-[var(--card-border)] bg-[color-mix(in_srgb,var(--card-bg)_92%,var(--text)_8%)] text-xs font-black uppercase tracking-wider text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--card-bg)_86%,var(--text)_14%)] Oswald"
                  >
                    <UserPlus className="mr-1.5 h-3.5 w-3.5 text-[var(--accent-neon)]" />
                    + Convidado
                  </Button>
                )}

                {canLeave && onLeave && (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={onLeave}
                    disabled={leaveLoading}
                    className="h-10 flex-1 rounded-xl border border-red-600 bg-red-600 text-xs font-black uppercase tracking-wider text-white hover:bg-red-700 active:scale-[0.98] Oswald shadow-sm"
                  >
                    {leaveLoading ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <LogOut className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    RETIRAR MEU NOME
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {!isLoggedIn ? (
                <Button
                  type="button"
                  onClick={onLogin}
                  className="h-11 w-full rounded-xl bg-[var(--accent-neon)] text-sm font-black uppercase tracking-wider text-white shadow-[0_0_20px_rgba(255,0,153,0.35)] hover:bg-[var(--accent-neon)]/90 active:scale-[0.98] Oswald"
                >
                  ENTRAR NA LISTA
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={onJoin}
                  disabled={!canJoin || joinLoading}
                  className="h-11 w-full rounded-xl bg-[var(--accent-neon)] text-sm font-black uppercase tracking-wider text-white shadow-[0_0_20px_rgba(255,0,153,0.35)] hover:bg-[var(--accent-neon)]/90 disabled:opacity-50 active:scale-[0.98] Oswald"
                >
                  {joinLoading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      ENTRANDO...
                    </span>
                  ) : joinBlockedReason ? (
                    joinBlockedReason
                  ) : (
                    "ENTRAR NA LISTA"
                  )}
                </Button>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* SEÇÃO EXPANSÍVEL: HORÁRIOS E REGRAS */}
      <div className="overflow-hidden rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)]">
        <button
          type="button"
          onClick={() => setRulesOpen((prev) => !prev)}
          className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
        >
          <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest Oswald text-[var(--text-muted)]">
            <Clock className="h-3.5 w-3.5 text-[var(--accent-neon)]" />
            HORÁRIOS E REGRAS
          </span>
          <div className="flex items-center gap-1.5">
            {nextFutureBlock && (
              <span className="rounded bg-[color-mix(in_srgb,var(--accent-neon)_15%,transparent)] px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-[var(--accent-neon)] Oswald">
                Próximo: {nextFutureBlock.title}
              </span>
            )}
            {rulesOpen ? (
              <ChevronUp className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            )}
          </div>
        </button>

        {rulesOpen && (
          <div className="border-t border-[var(--card-border)] bg-[color-mix(in_srgb,var(--card-bg)_94%,var(--text)_6%)] p-3 space-y-2 text-left animate-in fade-in duration-200">
            {blocks.length > 0 ? (
              <div className="space-y-1.5">
                {blocks.map((b, i) => {
                  const isNext = b === nextFutureBlock;
                  const diff = b.date ? b.date.getTime() - now : 0;
                  return (
                    <div
                      key={i}
                      className={cn(
                        "flex items-center justify-between rounded-lg border p-2 text-xs",
                        isNext
                          ? "border-[var(--accent-neon)]/40 bg-[color-mix(in_srgb,var(--accent-neon)_10%,transparent)]"
                          : "border-[var(--card-border)] bg-[color-mix(in_srgb,var(--card-bg)_94%,var(--text)_6%)] opacity-80"
                      )}
                    >
                      <div className="min-w-0">
                        <p
                          className={cn(
                            "text-[10px] font-black uppercase Oswald tracking-wide",
                            isNext ? "text-[var(--accent-neon)]" : "text-[var(--text)]"
                          )}
                        >
                          {b.title}
                        </p>
                        <p className="text-[9px] text-[var(--text-muted)] font-medium">
                          {formatDateTime(b.date)}
                        </p>
                      </div>

                      <div>
                        {b.isPast ? (
                          <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-emerald-400 Oswald">
                            Liberado
                          </span>
                        ) : isNext && isPending && diff <= 0 ? (
                          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-amber-400 Oswald">
                            Verificando...
                          </span>
                        ) : isNext && diff > 0 ? (
                          <span className="rounded border border-[color-mix(in_srgb,var(--accent-neon)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent-neon)_10%,transparent)] px-1.5 py-0.5 text-[8px] font-black text-[var(--accent-neon)] tabular-nums Oswald">
                            {formatTimeRemaining(diff)}
                          </span>
                        ) : (
                          <span className="text-[8px] font-bold text-[var(--text-muted)] uppercase Oswald">
                            Em breve
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-[10px] text-[var(--text-muted)] uppercase Oswald">
                Nenhum horário programado para esta rodada.
              </p>
            )}

            <div className="mt-2 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-2 text-[9px] text-[var(--text-muted)] leading-relaxed Oswald uppercase font-bold">
              <p className="text-[var(--accent-neon)] font-black mb-0.5">Importante:</p>
              Saídas após o prazo limite geram ocorrência administrativa automática. Mantenha seu status atualizado.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
