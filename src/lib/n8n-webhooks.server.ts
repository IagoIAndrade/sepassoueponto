// Disparo dos webhooks do n8n que enviam mensagens para o grupo do WhatsApp.
// URLs configuradas no .env; se a variável estiver vazia, o disparo é ignorado.
// Falhas nunca interrompem a ação do jogador/admin: apenas são registradas no log.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { classifyRegistrations } from "./registration-classification";

const WEBHOOK_TIMEOUT_MS = 5000;

type EventInfo = {
  id: string;
  group_id: string;
  event_date: string;
  start_time: string;
  end_time: string;
  location: string;
  main_limit: number;
  timezone: string;
  status: string;
};

async function postWebhook(url: string, event: string, payload: Record<string, unknown>) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (secret) headers["X-Webhook-Secret"] = secret;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ evento: event, enviado_em: new Date().toISOString(), ...payload }),
    signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function loadEvent(eventId: string) {
  const { data: event } = await supabaseAdmin
    .from("volleyball_events")
    .select("id, group_id, event_date, start_time, end_time, location, main_limit, timezone, status")
    .eq("id", eventId)
    .maybeSingle();
  if (!event) return null;

  const { data: group } = await supabaseAdmin
    .from("groups")
    .select("name")
    .eq("id", event.group_id)
    .maybeSingle();

  const { data: settings } = await supabaseAdmin.rpc("get_public_settings", {
    p_group_id: event.group_id,
  });
  const eventName = (Array.isArray(settings) ? settings[0] : settings)?.event_name ?? "";

  return { event: event as EventInfo, groupName: group?.name ?? "", eventName };
}

function roundPayload(event: EventInfo, groupName: string, eventName = "") {
  return {
    rodada: {
      id: event.id,
      nome_evento: eventName,
      status: event.status,
      turma: groupName,
      data: event.event_date,
      horario_inicio: event.start_time?.slice(0, 5),
      horario_fim: event.end_time?.slice(0, 5),
      local: event.location,
      limite_lista: event.main_limit || 18,
    },
  };
}

type SnapshotEntry = { id: string; nome: string };

// Avisa o grupo quando a lista principal atinge o limite (ex.: 18 pessoas) e,
// depois disso, sempre que a composição da lista cheia mudar (ex.: alguém saiu
// e o primeiro da espera subiu). Chamadas sem mudança na lista não reenviam.
export async function notifyMainListFull(eventId: string | null | undefined) {
  const url = process.env.N8N_WEBHOOK_LISTA_COMPLETA_URL;
  if (!url || !eventId) return;

  try {
    const loaded = await loadEvent(eventId);
    if (!loaded) return;
    const { event, groupName, eventName } = loaded;

    const { data: regs, error } = await supabaseAdmin.rpc("get_public_registrations", {
      p_event_id: eventId,
    });
    if (error) throw error;

    // Mesma regra de titulares/reservas usada nas telas do app (ordem de inscrição).
    const { starters: main, reserves, mainLimit } = classifyRegistrations(regs ?? [], event.main_limit);
    if (main.length < mainLimit) return;

    const name = (r: { player_name: string | null }) => (r.player_name || "Sem nome").trim();
    const snapshot: SnapshotEntry[] = main.map((r) => ({ id: r.id, nome: name(r) }));
    const signature = snapshot.map((s) => s.id).sort().join(",");

    const dispatches = () => (supabaseAdmin as any).from("n8n_webhook_dispatches");
    const key = { event_id: eventId, kind: "lista_completa" };

    const { data: prev } = await dispatches()
      .select("signature, snapshot")
      .match(key)
      .maybeSingle();
    if (prev?.signature === signature) return;

    // Reserva o disparo; se outro request mudou a linha antes, ele avisa o grupo.
    if (!prev) {
      const { error: claimError } = await dispatches().insert({ ...key, signature, snapshot });
      if (claimError) return;
    } else {
      let claim = dispatches()
        .update({ signature, snapshot, sent_at: new Date().toISOString() })
        .match(key);
      claim = prev.signature === null ? claim.is("signature", null) : claim.eq("signature", prev.signature);
      const { data: claimed } = await claim.select("event_id");
      if (!claimed?.length) return;
    }

    // Diferença em relação à última lista enviada.
    const prevSnapshot: SnapshotEntry[] = prev?.snapshot ?? [];
    const prevIds = new Set(prevSnapshot.map((s) => s.id));
    const currentIds = new Set(snapshot.map((s) => s.id));
    const isUpdate = !!prev;

    try {
      await postWebhook(url, "lista_completa", {
        ...roundPayload(event, groupName, eventName),
        atualizacao: isUpdate,
        total_lista: main.length,
        total_espera: reserves.length,
        sairam: prevSnapshot.filter((s) => !currentIds.has(s.id)).map((s) => s.nome),
        entraram: isUpdate ? snapshot.filter((s) => !prevIds.has(s.id)).map((s) => s.nome) : [],
        jogadores: main.map((r, i) => ({
          posicao: i + 1,
          nome: name(r),
          convidado: r.is_guest,
          novo: isUpdate && !prevIds.has(r.id),
        })),
        reservas: reserves.map((r, i) => ({
          posicao: i + 1,
          nome: name(r),
          convidado: r.is_guest,
        })),
      });
    } catch (sendError) {
      // Desfaz a reserva para que a próxima ação tente avisar de novo.
      if (prev) {
        await dispatches().update({ signature: prev.signature, snapshot: prev.snapshot }).match(key).eq("signature", signature);
      } else {
        await dispatches().delete().match(key).eq("signature", signature);
      }
      throw sendError;
    }
  } catch (e) {
    console.error("[N8N] Falha ao avisar lista completa:", { event_id: eventId, error: String(e) });
  }
}

export async function notifyMainListFullForRegistration(registrationId: string) {
  if (!process.env.N8N_WEBHOOK_LISTA_COMPLETA_URL) return;
  const { data: reg } = await supabaseAdmin
    .from("registrations")
    .select("event_id")
    .eq("id", registrationId)
    .maybeSingle();
  await notifyMainListFull(reg?.event_id);
}

export type TeamsTarget = "organizadores" | "jogadores";

// Envia a formação de times para o n8n. "organizadores" abre a validação
// (o n8n pede aprovação e, se aprovado, repassa aos jogadores); "jogadores"
// envia direto para o grupo dos jogadores. Ao contrário dos avisos automáticos,
// aqui o erro é repassado para o admin ver na tela.
export async function sendTeams(params: {
  target: TeamsTarget;
  eventId: string;
  teams: { numero: number; jogadores: { nome: string }[] }[];
}) {
  const url =
    params.target === "organizadores"
      ? process.env.N8N_WEBHOOK_TIMES_ORGANIZADORES_URL
      : process.env.N8N_WEBHOOK_TIMES_JOGADORES_URL;
  if (!url) throw new Error("Envio para o WhatsApp não configurado no servidor.");

  const loaded = await loadEvent(params.eventId);
  if (!loaded) throw new Error("Rodada não encontrada.");

  await postWebhook(url, params.target === "organizadores" ? "times_organizadores" : "times_jogadores", {
    ...roundPayload(loaded.event, loaded.groupName, loaded.eventName),
    times: params.teams.filter((t) => t.jogadores.length > 0),
  });
}

// Avisa o grupo sempre que um nome sai da lista (pelo próprio jogador ou pelo
// admin, dentro ou fora do prazo). Usa o registro gravado pelo banco em
// registration_withdrawals no momento do cancelamento.
export async function notifyWithdrawal(registrationId: string | null | undefined) {
  const url = process.env.N8N_WEBHOOK_SAIDA_TARDIA_URL;
  if (!url || !registrationId) return;

  try {
    const { data: withdrawal } = await supabaseAdmin
      .from("registration_withdrawals")
      .select("event_id, player_id, player_name_snapshot, removed_at, removal_source, deadline_status, list_type_snapshot, withdrawal_note, metadata")
      .eq("registration_id", registrationId)
      .order("removed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!withdrawal) return;

    const loaded = await loadEvent(withdrawal.event_id);
    if (!loaded) return;

    const late = withdrawal.deadline_status === "late";

    // Penalidade registrada para esta saída (só existe quando foi fora do prazo).
    const { data: incident } = late
      ? await supabaseAdmin
          .from("player_incidents")
          .select("suggested_rounds")
          .match({ player_id: withdrawal.player_id, event_id: withdrawal.event_id, incident_type: "late_leave" })
          .order("occurred_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null };

    await postWebhook(url, "saida_lista", {
      ...roundPayload(loaded.event, loaded.groupName, loaded.eventName),
      jogador: withdrawal.player_name_snapshot,
      saiu_em: withdrawal.removed_at,
      fora_do_prazo: late,
      prazo: (withdrawal.metadata as any)?.deadline_at_snapshot ?? null,
      removido_por: withdrawal.removal_source === "admin" ? "admin" : "jogador",
      lista: withdrawal.list_type_snapshot === "main" ? "titular" : "reserva",
      justificativa: withdrawal.withdrawal_note ?? null,
      rodadas_bloqueio: incident?.suggested_rounds ?? 0,
    });
  } catch (e) {
    console.error("[N8N] Falha ao avisar saída da lista:", { registration_id: registrationId, error: String(e) });
  }
}
