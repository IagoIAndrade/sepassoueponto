// Sorteio automático dos times quando a lista principal chega ao limite (18).
// Usa o mesmo algoritmo do botão "Equilibrar" do admin (distributePlayers), agora
// priorizando a mesma quantidade de mulheres por time. O resultado é enviado aos
// organizadores (webhook "times_organizadores") para validação e NÃO é gravado nos
// times da rodada: gravar publicaria os times para todos os jogadores no app antes
// da aprovação. Roda uma única vez por rodada.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { DEFAULT_WEIGHTS, distributePlayers, type DistributionPlayer, type SkillWeights } from "./skills";
import { sendTeams } from "./n8n-webhooks.server";

const TEAM_COUNT = 3;
const TEAM_SIZE = 6;

type Starter = { id: string; player_id: string; player_name: string | null };

export async function autoDrawTeams(eventId: string, starters: Starter[], mainLimit: number) {
  if (!process.env.N8N_WEBHOOK_TIMES_ORGANIZADORES_URL) return;
  if (mainLimit !== TEAM_COUNT * TEAM_SIZE || starters.length !== mainLimit) return;

  const dispatches = () => (supabaseAdmin as any).from("n8n_webhook_dispatches");
  const key = { event_id: eventId, kind: "sorteio_auto" };

  // Reserva o sorteio (uma vez por rodada). Se já existe, outro request cuidou dele.
  const { error: claimError } = await dispatches().insert({ ...key, signature: "claimed" });
  if (claimError) return;

  try {
    // Se o admin já montou times manualmente, não sobrescreve nem reenvia.
    const { data: existing } = await supabaseAdmin
      .from("teams")
      .select("id, team_members(id)")
      .eq("event_id", eventId);
    if ((existing ?? []).some((t: any) => (t.team_members ?? []).length > 0)) return;

    const playerIds = starters.map((s) => s.player_id);
    const [{ data: skills }, { data: genders }, { data: w }] = await Promise.all([
      (supabaseAdmin as any).from("player_skills").select("*").in("player_id", playerIds),
      supabaseAdmin.from("players").select("id, gender").in("id", playerIds),
      (supabaseAdmin as any).from("skill_weights").select("*").eq("id", true).maybeSingle(),
    ]);
    const skillsMap = new Map<string, any>((skills ?? []).map((s: any) => [s.player_id, s]));
    const genderMap = new Map<string, string | null>((genders ?? []).map((g: any) => [g.id, g.gender]));
    const weights: SkillWeights =
      w && typeof w.reception_score === "number" ? ({ ...DEFAULT_WEIGHTS, ...w } as SkillWeights) : DEFAULT_WEIGHTS;

    const players: DistributionPlayer[] = starters.map((s) => ({
      id: s.id,
      player_id: s.player_id,
      name: (s.player_name || "Sem nome").trim(),
      skills: skillsMap.get(s.player_id) ?? null,
      gender: genderMap.get(s.player_id) ?? null,
    }));

    const result = distributePlayers(players, { mode: "balanced", teamCount: TEAM_COUNT, weights });

    const teams = Array.from({ length: TEAM_COUNT }, (_, i) => ({
      numero: i + 1,
      jogadores: players.filter((p) => result.assign[p.id] === i + 1).map((p) => ({ nome: p.name })),
    }));

    await sendTeams({ target: "organizadores", eventId, teams });

    // Guarda a proposta enviada (registro do que foi sugerido aos organizadores).
    await dispatches()
      .update({ signature: "sent", snapshot: { assign: result.assign, avisos: result.warnings } })
      .match(key);
  } catch (e) {
    // Libera a reserva para a próxima atualização da lista tentar de novo.
    await dispatches().delete().match(key);
    console.error("[N8N] Falha no sorteio automático dos times:", { event_id: eventId, error: String(e) });
  }
}
