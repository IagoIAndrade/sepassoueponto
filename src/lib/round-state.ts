import { addDays, setDay, parseISO, format } from "date-fns";
import { toZonedTime } from "date-fns-tz";

export type RoundPhase = "scheduled" | "priority" | "general" | "closed";

export interface RoundState {
  openAt: Date;
  priorityEndsAt: Date;
  closeAt: Date | null;
  phase: RoundPhase;
  countdown?: string;
  isPending?: boolean;
}

const TIMEZONE = "America/Sao_Paulo";

/**
 * Calcula a data de abertura real baseada na configuração da turma e data da rodada.
 */
export function calculateOpenAt(eventDateIso: string, openWeekday: number, openTime: string): Date {
  const [y, m, d] = eventDateIso.split("-").map(Number);
  const baseDate = new Date(Date.UTC(y, m - 1, d, 15, 0, 0)); // 15h UTC = 12h SP (mesmo dia Brasil e Europa)
  const eventDow = baseDate.getUTCDay();
  const diff = (eventDow - openWeekday + 7) % 7;
  const openDate = new Date(baseDate.getTime() - diff * 86400000);
  
  const yyyy = openDate.getUTCFullYear();
  const mm = String(openDate.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(openDate.getUTCDate()).padStart(2, '0');
  const [hh, min] = openTime.split(':');
  
  return new Date(`${yyyy}-${mm}-${dd}T${hh}:${min}:00-03:00`);
}

export function getRoundRegistrationState(
  event: { event_date: string; status: string; opens_at?: string },
  settings: { open_weekday: number; open_time: string; priority_minutes: number | null; close_weekday?: number; close_time?: string },
  now: number = Date.now()
): RoundState {
  const openAt = event.opens_at ? new Date(event.opens_at) : calculateOpenAt(event.event_date, settings.open_weekday, settings.open_time);
  const priorityMinutes = settings.priority_minutes ?? 0;
  const priorityEndsAt = new Date(openAt.getTime() + priorityMinutes * 60_000);
  
  let closeAt: Date | null = null;
  if (settings.close_weekday !== undefined && settings.close_time) {
    closeAt = calculateOpenAt(event.event_date, settings.close_weekday, settings.close_time);
  }

  let phase: RoundPhase = "scheduled";
  let isPending = false;
  
      if (event.status === "closed" || event.status === "completed" || event.status === "cancelled") {
        phase = "closed";
      } else if (now < openAt.getTime()) {
        phase = "scheduled";
      } else if (event.status === "open") {
        if (now >= priorityEndsAt.getTime()) {
          phase = "general";
        } else {
          phase = "priority";
        }
      } else {
        phase = "scheduled";
        if (now >= openAt.getTime()) {
          isPending = true;
        }
      }

  const target = phase === "scheduled" ? openAt : priorityEndsAt;

  const totalMs = Math.max(0, target.getTime() - now);
  const hours = Math.floor(totalMs / 3_600_000);
  const mins = Math.floor((totalMs % 3_600_000) / 60_000);
  const secs = Math.floor((totalMs % 60_000) / 1000);
  const countdown = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

  return { openAt, priorityEndsAt, closeAt, phase, countdown, isPending };
}

/**
 * Formata um objeto Date para o formato ISO local (YYYY-MM-DDTHH:mm:ss) sem timezone
 */
export function formatLocalIso(date: Date): string {
  return format(date, "yyyy-MM-dd'T'HH:mm:ss");
}
