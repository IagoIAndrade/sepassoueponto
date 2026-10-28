/**
 * Vocabulário canônico de status do rateio (público + pessoal).
 * Deve permanecer sincronizado com as RPCs:
 *   - public.get_public_fund_player_statuses()
 *   - public.get_my_fund_status(text)
 *   - public.internal_fund_participant_status(...)
 *
 * `unlinked` é EXCLUSIVAMENTE um estado derivado no frontend
 * quando não existe entrada para o player_id no mapa retornado
 * pela RPC. Nenhuma RPC retorna "unlinked".
 */
export type PublicFundStatus =
  | "not_participating"
  | "exempt"
  | "to_define"
  | "pending"
  | "partial"
  | "in_full"
  | "overpaid"
  | "payment_reported"
  | "unlinked";

const KNOWN_STATUSES = new Set<PublicFundStatus>([
  "not_participating",
  "exempt",
  "to_define",
  "pending",
  "partial",
  "in_full",
  "overpaid",
  "payment_reported",
  "unlinked",
]);

/** Situação pública compacta de um jogador no rateio ativo. */
export type PlayerFundView = {
  status: PublicFundStatus;
  has_paid: boolean;
};

/**
 * Valida um valor de status vindo do backend.
 * Qualquer código fora da união conhecida é tratado como `unlinked`
 * (estado neutro) — nunca convertido silenciosamente para outro código.
 */
export function normalizePublicFundStatus(raw: unknown): PublicFundStatus {
  if (typeof raw !== "string") return "unlinked";
  return KNOWN_STATUSES.has(raw as PublicFundStatus) ? (raw as PublicFundStatus) : "unlinked";
}

export const STATUS_LABEL: Record<PublicFundStatus, string> = {
  in_full: "Em dia",
  overpaid: "Em dia",
  pending: "Pagamento pendente",
  partial: "Pagamento parcial",
  payment_reported: "Informou pagamento",
  to_define: "Participação a definir",
  exempt: "Isento",
  not_participating: "Não participa",
  unlinked: "Situação do rateio não definida",
};

/** Um jogador é considerado "ativo" no rateio se participa e não é isento. */
function isActiveInFund(status: PublicFundStatus): boolean {
  return (
    status === "pending" ||
    status === "partial" ||
    status === "in_full" ||
    status === "overpaid" ||
    status === "payment_reported" ||
    status === "to_define"
  );
}

/**
 * Cor do nome na lista pública. Considera o pagamento efetivo (`has_paid`)
 * para diferenciar quem já contribuiu mesmo com valor ainda a definir.
 */
export function nameClassFor(view: PlayerFundView): string {
  const { status, has_paid } = view;
  if (has_paid) return "text-emerald-400";
  if (status === "payment_reported") return "text-amber-300";
  if (isActiveInFund(status)) return "text-red-400";
  return "";
}

export function playerFundStatusFor(
  playerId: string | null | undefined,
  map: Map<string, PlayerFundView>,
): PlayerFundView {
  if (!playerId) return { status: "unlinked", has_paid: false };
  return map.get(playerId) ?? { status: "unlinked", has_paid: false };
}

export const formatBRL = (v: number | string | null | undefined): string => {
  const n = typeof v === "string" ? Number(v) : (v ?? 0);
  if (!Number.isFinite(n)) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(n);
};

/** Rótulo compacto do indicador ao lado do nome. */
export function badgeLabelFor(view: PlayerFundView): string | null {
  const { status, has_paid } = view;
  if (has_paid) {
    if (status === "in_full" || status === "overpaid" || status === "to_define") return "Pago";
    return "Parcial";
  }
  if (status === "payment_reported") return "Informou";
  if (isActiveInFund(status)) return "Não pagou";
  return null;
}

export function isActiveFundParticipant(view: PlayerFundView): boolean {
  return isActiveInFund(view.status);
}
