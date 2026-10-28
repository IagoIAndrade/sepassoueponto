/**
 * FONTE ÚNICA DE VERDADE para classificação de inscritos de uma rodada.
 *
 * REGRA: a ordem é exclusivamente cronológica (created_at ASC), com `id ASC`
 * apenas como desempate em caso de empate exato. Nunca por nome, posição,
 * position_number salvo, list_type salvo, flag de organizador ou inclusão manual.
 *
 * Titulares = primeiras `mainLimit` inscrições ativas. Reservas = o restante.
 * Convidados usam mesmo vetor cronológico, sem prioridade especial.
 */

export const DEFAULT_MAIN_LIMIT = 18;

export interface ClassifiedRegistrations<T> {
  all: T[];
  starters: T[];
  reserves: T[];
  mainLimit: number;
}

export type RegistrationSituation = "not_registered" | "starter" | "reserve";

export interface RegistrationSituationResult<T> {
  situation: RegistrationSituation;
  registration: T | null;
  position: number | null;
  officialPosition: string | null;
  label: string;
  isRegistered: boolean;
  isStarter: boolean;
  isReserve: boolean;
}

/** Ordena inscrições ativas por created_at ASC (desempate por id ASC). */
export function sortRegistrationsChronologically<T extends { id?: unknown; created_at?: unknown }>(
  registrations: readonly T[],
): T[] {
  return [...(registrations || [])].sort((a, b) => {
    const timeA = a?.created_at ? new Date(String(a.created_at)).getTime() : 0;
    const timeB = b?.created_at ? new Date(String(b.created_at)).getTime() : 0;
    if (timeA !== timeB) return timeA - timeB;
    return String(a?.id ?? "").localeCompare(String(b?.id ?? ""));
  });
}

/**
 * Classifica as inscrições de uma rodada.
 * Remove inscrições canceladas (sem inscrição ativa) antes de classificar,
 * garantindo promoção automática do primeiro reserva.
 */
export function classifyRegistrations<
  T extends { id?: unknown; created_at?: unknown; cancelled_at?: unknown },
>(registrations: readonly T[], mainLimit?: number | null): ClassifiedRegistrations<T> {
  const limit = mainLimit && mainLimit > 0 ? mainLimit : DEFAULT_MAIN_LIMIT;
  const active = (registrations || []).filter((r) => !r?.cancelled_at);
  const all = sortRegistrationsChronologically(active);
  return {
    all,
    starters: all.slice(0, limit),
    reserves: all.slice(limit),
    mainLimit: limit,
  };
}

export function getRegistrationSituation<
  T extends { id?: unknown; player_id?: unknown; is_self?: unknown; created_at?: unknown; cancelled_at?: unknown },
>(registrations: readonly T[], mainLimit?: number | null, playerId?: string | null): RegistrationSituationResult<T> {
  const classified = classifyRegistrations(registrations, mainLimit);
  const registration = classified.all.find((r) => {
    if (r.is_self) return true;
    return !!playerId && String(r.player_id ?? "") === playerId;
  }) ?? null;

  if (!registration) {
    return {
      situation: "not_registered",
      registration: null,
      position: null,
      officialPosition: null,
      label: "Não inscrito",
      isRegistered: false,
      isStarter: false,
      isReserve: false,
    };
  }

  const idx = classified.all.findIndex((r) => String(r.id ?? "") === String(registration.id ?? ""));
  if (idx < 0) {
    return {
      situation: "not_registered",
      registration: null,
      position: null,
      officialPosition: null,
      label: "Não inscrito",
      isRegistered: false,
      isStarter: false,
      isReserve: false,
    };
  }

  const isStarter = idx < classified.mainLimit;
  const position = isStarter ? idx + 1 : idx - classified.mainLimit + 1;
  return {
    situation: isStarter ? "starter" : "reserve",
    registration,
    position,
    officialPosition: displayNumber(idx, classified.mainLimit),
    label: isStarter ? "Vaga confirmada" : "Reserva confirmada",
    isRegistered: true,
    isStarter,
    isReserve: !isStarter,
  };
}

/** Numeração visual derivada da classificação: 01..18 para titulares, R01.. para reservas. */
export function displayNumber(index: number, mainLimit: number): string {
  return index >= mainLimit
    ? `R${(index - mainLimit + 1).toString().padStart(2, "0")}`
    : (index + 1).toString().padStart(2, "0");
}

/** Data e hora reais da inscrição no timezone do sistema (America/Sao_Paulo). */
export function formatRegistrationDateTime(createdAt: unknown): string | null {
  if (!createdAt) return null;
  const date = new Date(String(createdAt));
  if (Number.isNaN(date.getTime())) return null;
  const opts: Intl.DateTimeFormatOptions = { timeZone: "America/Sao_Paulo" };
  const d = date.toLocaleDateString("pt-BR", {
    ...opts,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const t = date.toLocaleTimeString("pt-BR", { ...opts, hour: "2-digit", minute: "2-digit" });
  return `${d} • ${t}`;
}
