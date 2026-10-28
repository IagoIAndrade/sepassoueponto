import { CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  formatBRL,
  STATUS_LABEL,
  badgeLabelFor,
  isActiveFundParticipant,
  type PlayerFundView,
} from "@/lib/public-fund-status";

const formatPercent = (v: number | string | null | undefined): string => {
  const n = typeof v === "string" ? Number(v) : (v ?? 0);
  if (!Number.isFinite(n)) return "0%";
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
};

const formatCivilDate = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
};

export type PublicFundSummary = {
  fund_id: string;
  title: string | null;
  total_amount: number | string | null;
  due_date: string | null;
  total_collected: number | string | null;
  remaining_balance: number | string | null;
  surplus_amount: number | string | null;
  percent_collected: number | string | null;
};

export function FundPublicSummaryCard({ summary }: { summary: PublicFundSummary | null }) {
  if (!summary || !summary.fund_id) return null;

  const total = Number(summary.total_amount ?? 0);
  const collected = Number(summary.total_collected ?? 0);
  const remaining = Number(summary.remaining_balance ?? 0);
  const surplus = Number(summary.surplus_amount ?? 0);
  const percent = Number(summary.percent_collected ?? 0);
  const percentClamped = Math.min(100, Math.max(0, percent));
  const goalMet = collected >= total && total > 0;
  const due = formatCivilDate(summary.due_date);

  return (
    <Card className="mt-4 p-4 border-brand-gold/15 bg-brand-surface shadow-lg">
      <div className="mb-3 flex items-center justify-between gap-2 border-b border-brand-gold/10 pb-2">
        <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-gold Oswald">
          {summary.title?.trim() || "Rateio dos equipamentos"}
        </h2>
        {due && <span className="text-[9px] font-bold text-brand-silver/60 Oswald">Prazo: {due}</span>}
      </div>


      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</p>
          <p className="text-sm font-bold">{formatBRL(total)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Arrecadado</p>
          <p className="text-sm font-bold text-emerald-400">{formatBRL(collected)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {goalMet ? "Excedente" : "Falta"}
          </p>
          <p
            className={
              "text-sm font-bold " +
              (goalMet ? "text-emerald-400" : remaining > 0 ? "text-red-400" : "text-foreground")
            }
          >
            {formatBRL(goalMet ? surplus : remaining)}
          </p>
        </div>
      </div>

      <div className="mt-3">
        <Progress
          value={percentClamped}
          aria-label="Progresso do rateio"
          aria-valuenow={Math.round(percentClamped)}
          aria-valuemin={0}
          aria-valuemax={100}
        />
        <p className="mt-1 text-right text-sm font-bold text-foreground">
          {goalMet && percent > 100
            ? `${formatPercent(percent)} — Meta alcançada`
            : formatPercent(percent)}
        </p>

      </div>
    </Card>
  );
}

export function PlayerFundBadge({ view }: { view: PlayerFundView }) {
  const label = badgeLabelFor(view);
  const srLabel = STATUS_LABEL[view.status];
  if (!label) {
    // aparência neutra — apenas texto acessível para leitores de tela
    return <span className="sr-only">{srLabel}</span>;
  }
  const { has_paid } = view;
  const active = isActiveFundParticipant(view);
  // Paletas: verde (pago total), âmbar (parcial), vermelho (não pagou)
  const isFullPaid = has_paid && label === "Pago";
  const isPartial = has_paid && label === "Parcial";
  const isUnpaid = !has_paid && active;

  const cls = isFullPaid
    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
    : isPartial
      ? "border-amber-500/40 bg-amber-500/15 text-amber-300"
      : isUnpaid
        ? "border-red-500/40 bg-red-500/15 text-red-300"
        : "border-brand-gold/20 bg-brand-gold/5 text-brand-silver/60";


  const Icon = isUnpaid ? AlertTriangle : CheckCircle2;
  const prefix = isUnpaid ? "!" : "✓";

  return (
    <span
      title={srLabel}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold leading-none ${cls}`}
    >
      <Icon aria-hidden className="h-3 w-3" />
      <span aria-hidden>
        {prefix} {label}
      </span>
      <span className="sr-only">{srLabel}</span>
    </span>
  );
}


export type MyFundStatusView = {
  status: string;
  linked: boolean;
  agreed_amount: number | null;
  total_paid: number | string | null;
  outstanding: number | string | null;
  surplus: number | string | null;
};

export function MyFundStatusAlert({ me }: { me: MyFundStatusView | null }) {
  if (!me) return null;

  const outstanding = Number(me.outstanding ?? 0);
  const surplus = Number(me.surplus ?? 0);

  let tone: "emerald" | "red" | "amber" | "neutral" | "sky" = "neutral";
  let icon = <Info aria-hidden className="h-4 w-4" />;
  let text = "";
  let sub: string | null = null;

  switch (me.status) {
    case "in_full":
      tone = "emerald";
      icon = <CheckCircle2 aria-hidden className="h-4 w-4" />;
      text = "Você está em dia com o rateio dos equipamentos.";
      break;
    case "overpaid":
      tone = "emerald";
      icon = <CheckCircle2 aria-hidden className="h-4 w-4" />;
      text = "Você está em dia com o rateio dos equipamentos.";
      if (surplus > 0) sub = `Contribuição excedente: ${formatBRL(surplus)}.`;
      break;
    case "pending":
      tone = "red";
      icon = <AlertTriangle aria-hidden className="h-4 w-4" />;
      text = `Você possui um débito pendente de ${formatBRL(outstanding)} no rateio dos equipamentos (histórico e sem impacto na prioridade).`;
      break;
    case "partial":
      tone = "amber";
      icon = <AlertTriangle aria-hidden className="h-4 w-4" />;
      text = `Você realizou um pagamento parcial. Ainda faltam ${formatBRL(outstanding)}.`;
      break;
    case "payment_reported":
      tone = "sky";
      icon = <CheckCircle2 aria-hidden className="h-4 w-4" />;
      text = "Você informou pagamento — aguardando confirmação do administrador.";
      break;
    case "to_define":
      tone = "neutral";
      text = "Sua participação no rateio ainda está sendo definida.";
      break;
    case "exempt":
      tone = "sky";
      text = "Você está isento deste rateio.";
      break;
    case "not_participating":
      tone = "neutral";
      text = "Você não participa deste rateio.";
      break;
    default:
      if (!me.linked) {
        tone = "neutral";
        text = "Seu cadastro ainda não possui uma situação definida no rateio.";
      } else {
        // Código desconhecido: tratamento neutro, sem inventar significado.
        return null;
      }
  }

  const toneClass =
    tone === "emerald"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
      : tone === "red"
        ? "border-red-500/40 bg-red-500/10 text-red-200"
        : tone === "amber"
          ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
          : tone === "sky"
            ? "border-sky-500/40 bg-sky-500/10 text-sky-200"
            : "border-border bg-muted/40 text-muted-foreground";

  return (
    <div
      className={`mt-4 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs ${toneClass}`}
      role="status"
    >

      <span className="mt-0.5">{icon}</span>
      <div className="min-w-0">
        <p className="font-medium leading-snug">{text}</p>
        {sub && <p className="mt-0.5 text-xs opacity-90">{sub}</p>}
      </div>
    </div>
  );
}
