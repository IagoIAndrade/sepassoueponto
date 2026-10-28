import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SKILL_KEYS, overallLevel } from "./skills";
import { normalizePhone } from "./utils";

const selfRatingSchema = z.object({
  reception_score: z.number().min(0).max(5),
  setting_score: z.number().min(0).max(5),
  attack_score: z.number().min(0).max(5),
  serve_score: z.number().min(0).max(5),
  block_score: z.number().min(0).max(5),
  defense_score: z.number().min(0).max(5),
  movement_score: z.number().min(0).max(5),
  positioning_score: z.number().min(0).max(5),
  primary_position: z.string(),
  height_cm: z.number().nullable(),
});

export const player_upsert_self_rating = createServerFn({ method: "POST" })
  .validator((r: unknown) => selfRatingSchema.parse(r))
  .handler(async ({ data }) => {
    console.log("[SELF_RATING][START]");
    
    const { readSessionCookie } = await import("./player-session.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    
    const token = readSessionCookie();
    if (!token) {
      console.error("[SELF_RATING][NO_TOKEN]");
      throw new Error("unauthorized");
    }

    const { data: player_id, error: sErr } = await supabaseAdmin.rpc("internal_validate_session", {
      p_token: token,
    });

    if (sErr || !player_id) {
      console.error("[SELF_RATING][INVALID_SESSION]", sErr);
      throw new Error("invalid_session");
    }
    
    console.log("[SELF_RATING][PLAYER_ID]", player_id);

    // No vôlei, 0 é uma nota válida (ex: um jogador que não sabe sacar).
    // O overallLevel deve tratar 0-5.
    const overall = overallLevel({
      player_id,
      ...data,
      primary_position: data.primary_position,
      height_cm: data.height_cm,
      notes: null,
      updated_at: null,
      updated_by: null,
    } as any);

    console.log("[SELF_RATING][PAYLOAD_VALIDATED]", { ...data, overall_level: overall });

    // Salvar no histórico/tabela de autoavaliação usando internal_upsert_self_rating
    // ou supabaseAdmin direto se a RPC não existir. 
    // Como a RPC costuma ser mais segura, vou tentar o internal_upsert_self_rating
    // Mas antes, vamos garantir que estamos usando o player_id correto.
    // UPSERT usando supabaseAdmin para ignorar RLS e garantir escrita.
    // Como a tabela não tem UNIQUE(player_id) formal, o onConflict: 'player_id'
    // pode falhar silenciosamente ou inserir duplicatas se houver mais de um.
    // Vamos garantir que limpamos antes ou usamos uma lógica que funcione sem constraint.
    // Como não posso criar constraint, vou deletar o antigo antes de inserir para simular o upsert único.
    
    const { error: dErr } = await supabaseAdmin
      .from("player_self_ratings")
      .delete()
      .eq("player_id", player_id);

    if (dErr) console.warn("[SELF_RATING][DELETE_OLD_WARNING]", dErr);

    const { error } = await supabaseAdmin.from("player_self_ratings").insert({
      player_id,
      ...data,
      overall_level: overall,
      updated_at: new Date().toISOString()
    });

    if (error) {
      console.error("[SELF_RATING][DB_ERROR]", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      });
      throw new Error(error.message);
    }
    
    console.log("[SELF_RATING][SUCCESS]");
    return { ok: true, overall };
  });

export const player_get_my_self_rating = createServerFn({ method: "GET" })
  .handler(async () => {
    const { readSessionCookie } = await import("./player-session.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    
    const token = readSessionCookie();
    if (!token) return { rating: null, admin_rating: null };

    const { data: pid, error: sErr } = await supabaseAdmin.rpc("internal_validate_session", {
      p_token: token,
    });
    if (sErr || !pid) return { rating: null, admin_rating: null };

    const { data, error } = await supabaseAdmin
      .from("player_self_ratings")
      .select("*")
      .eq("player_id", pid)
      .maybeSingle();

    if (error) throw new Error(error.message);

    const { data: adminData } = await supabaseAdmin
      .from("player_skills")
      .select("*")
      .eq("player_id", pid)
      .maybeSingle();

    return { rating: data || null, admin_rating: adminData || null };
  });

// Payload types kept explicit to avoid leaking DB rows.
const signupSchema = z.object({
  firstName: z.string().min(2).max(40).optional(),
  lastName: z.string().max(40).optional(),
  name: z.string().min(2).max(100).optional(),
  first_name: z.string().min(2).max(40).optional(),
  last_name: z.string().max(40).optional(),
  phone: z.string().min(8).max(20),
  pin: z.string().regex(/^[0-9]{4,8}$/, "pin must be 4-8 digits"),
  groupIds: z.array(z.string().uuid()).optional(),
  group_ids: z.array(z.string().uuid()).optional(),
  remember: z.boolean().optional().default(false),
}).transform((raw) => {
  const nameParts = (raw.name ?? "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const first = raw.firstName ?? raw.first_name ?? nameParts[0] ?? "";
  const last = raw.lastName ?? raw.last_name ?? nameParts.slice(1).join(" ");
  const groups = raw.groupIds ?? raw.group_ids ?? [];
  if (first.length < 2) throw new Error("invalid_name");
  if (groups.length === 0) throw new Error("Selecione pelo menos uma turma");
  return { ...raw, firstName: first, lastName: last, groupIds: groups };
});
const loginSchema = z.object({
  phone: z.string().min(8).max(20),
  pin: z.string().regex(/^[0-9]{4,8}$/),
  remember: z.boolean().optional().default(false),
});
const joinSelfSchema = z.object({ event_id: z.string().uuid() });
const myRegsSchema = z.object({ event_id: z.string().uuid() });
const revokeAllSchema = z.object({ p_target_player_id: z.string().uuid() });
const updateNameSchema = z.object({ name: z.string().trim().min(2) });

export const player_signup = createServerFn({ method: "POST" })
  .validator((raw: unknown) => {
    try {
      return signupSchema.parse(raw);
    } catch (e: any) {
      if (e instanceof z.ZodError) {
        const first = e.errors[0];
        if (first) throw new Error(`${first.message}`);
      }
      throw e;
    }
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const {
      readSessionCookie,
      writeSessionCookie,
      clearSessionCookie,
      getRequestIp,
      getRequestUserAgent,
    } = await import("./player-session.server");
    // Se houver cookie, valida no banco. Sessão órfã (perfil excluído) é
    // limpa silenciosamente para permitir novo cadastro no mesmo aparelho.
    const existingToken = readSessionCookie();
    if (existingToken) {
      const { data: pid } = await supabaseAdmin.rpc("internal_validate_session", {
        p_token: existingToken,
      });
      if (pid) throw new Error("already_authenticated");
      clearSessionCookie();
    }

    const phoneNorm = normalizePhone(data.phone);
    if (phoneNorm.length < 10 || phoneNorm.length > 11) {
      throw new Error("invalid_phone");
    }

    // Check duplicate phone before calling RPC to give specific error
    const { data: existingPlayer, error: lookupErr } = await supabaseAdmin
      .from("players")
      .select("id")
      .eq("phone_normalized", phoneNorm)
      .maybeSingle();

    if (lookupErr) {
      console.error("[PLAYER_SIGNUP][LOOKUP_ERROR]", lookupErr.message);
      // Continue — RPC will catch duplicates too
    }
    if (existingPlayer) {
      throw new Error("phone_already_registered");
    }

    const { data: rows, error } = await supabaseAdmin.rpc("internal_signup_player_v2", {
      p_first_name: data.firstName,
      p_last_name: data.lastName ?? "",
      p_phone: phoneNorm,
      p_pin: data.pin,
      p_group_ids: data.groupIds,
      p_ip: (getRequestIp() ?? null) as unknown as string,
      p_user_agent: getRequestUserAgent() ?? "",
      p_remember: data.remember,
    });
    if (error) {
      console.error("[PLAYER_SIGNUP][RPC_ERROR]", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      // Map known RPC error patterns to user-friendly codes
      const msg = error.message ?? "";
      if (/23505|phone_already|unique.*phone|duplicate/i.test(msg)) {
        throw new Error("phone_already_registered");
      }
      if (/gen_salt|pgcrypto|hash/i.test(msg)) {
        throw new Error("signup_failed");
      }
      throw new Error(error.message);
    }
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row?.token_plain) throw new Error("signup_failed");
    writeSessionCookie(row.token_plain, data.remember);
    return { player_id: row.player_id, ok: true };
  });

export const player_login = createServerFn({ method: "POST" })
  .validator((raw: unknown) => {
    try {
      return loginSchema.parse(raw);
    } catch (e: any) {
      if (e instanceof z.ZodError) {
        const first = e.errors[0];
        if (first) throw new Error(`${first.message}`);
      }
      throw e;
    }
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { writeSessionCookie, getRequestIp, getRequestUserAgent } =
      await import("./player-session.server");
    
    const phone_norm = normalizePhone(data.phone);

    const { data: rows, error } = await supabaseAdmin.rpc("internal_login_player", {
      p_phone: phone_norm,
      p_pin: data.pin,
      p_ip: (getRequestIp() ?? null) as unknown as string,
      p_user_agent: getRequestUserAgent() ?? "",
      p_remember: data.remember,
    });
    
    if (error) {
      if (error.message?.includes("pin_reset_required")) {
        throw new Error("pin_reset_required");
      }
      throw new Error(error.message);
    }
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (row?.requires_reset) {
      return { player_id: row.player_id, requires_reset: true, ok: true };
    }
    if (!row?.token_plain) throw new Error("invalid_credentials");
    
    writeSessionCookie(row.token_plain, data.remember);
    return { player_id: row.player_id, ok: true };
  });

export const get_current_player = createServerFn({ method: "GET" }).handler(async () => {
  const { readSessionCookie, clearSessionCookie } = await import("./player-session.server");
  const token = readSessionCookie();
  if (!token) return { player: null, session_expired: false };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: pid, error } = await supabaseAdmin.rpc("internal_validate_session", {
    p_token: token,
  });
  if (error || !pid) {
    console.error("[AUTH SERVER] internal_validate_session falhou para o token fornecido.", { error });
    // clearSessionCookie(); // Comentado temporariamente para auditoria: não matar a sessão no primeiro erro
    return { player: null, session_expired: true };
  }
  const { data: needsPhoto } = await supabaseAdmin.rpc("player_needs_photo", { p_player_id: pid });
  const { data: rows } = await supabaseAdmin.rpc("internal_get_player", { p_player_id: pid });
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row) {
    console.error("[AUTH SERVER] Jogador não encontrado após validação de sessão.", { pid });
    // clearSessionCookie();
    return { player: null, session_expired: true };
  }
  return { 
    player: { ...row, has_valid_photo: !needsPhoto }, 
    session_expired: false 
  };
});

export const player_logout = createServerFn({ method: "POST" }).handler(async () => {
  const { readSessionCookie, clearSessionCookie } = await import("./player-session.server");
  const token = readSessionCookie();
  if (token) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.rpc("internal_revoke_session", { p_token: token });
  }
  clearSessionCookie();
  return { ok: true };
});

// join_self: derives responsible_player_id from the server session cookie,
// NEVER from client input. Registers the authenticated player for himself.
export const join_self = createServerFn({ method: "POST" })
  .validator((raw: unknown) => joinSelfSchema.parse(raw))
  .handler(async ({ data }) => {
    const { readSessionCookie } = await import("./player-session.server");
    const token = readSessionCookie();
    if (!token) throw new Error("not_authenticated");
    
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pid, error: sErr } = await supabaseAdmin.rpc("internal_validate_session", {
      p_token: token,
    });
    
    if (sErr || !pid) throw new Error("invalid_session");
    
    console.log("[JOIN_SELF] Verificado jogador autorizado pela sessão:", { player_id: pid, event_id: data.event_id });

    // Chamada exata validada na migration 20260810153000_fix_internal_join_event_column.sql
    const { data: rows, error } = await supabaseAdmin.rpc("internal_join_event", {
      p_event_id: data.event_id,
      p_target_player_id: pid,
      p_responsible_player_id: pid,
      p_force_override: false,
    });

    if (error) {
      console.error("[JOIN_SELF ERROR_DETAILS]", error);
      throw new Error(error.message);
    }
    
    const row = Array.isArray(rows) ? rows[0] : rows;
    console.log("[JOIN_SELF] Confirmação real:", row);
    return { ok: true, registration: row };
  });

export const get_my_registrations = createServerFn({ method: "GET" })
  .validator((raw: unknown) => myRegsSchema.parse(raw))
  .handler(async ({ data }) => {
    const { readSessionCookie } = await import("./player-session.server");
    const token = readSessionCookie();
    if (!token) return { player_id: null, registrations: [] };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pid, error: sErr } = await supabaseAdmin.rpc("internal_validate_session", {
      p_token: token,
    });
    if (sErr || !pid) return { player_id: null, registrations: [] };
    const { data: rows, error } = await supabaseAdmin.rpc("internal_get_my_registrations", {
      p_event_id: data.event_id,
      p_player_id: pid,
    });
    if (error) throw new Error(error.message);
    return { player_id: pid, registrations: rows ?? [] };
  });

export const update_my_player_name = createServerFn({ method: "POST" })
  .validator((raw: unknown) => updateNameSchema.parse(raw))
  .handler(async ({ data }) => {
    const { readSessionCookie } = await import("./player-session.server");
    const token = readSessionCookie();
    if (!token) throw new Error("not_authenticated");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pid, error: sErr } = await supabaseAdmin.rpc("internal_validate_session", {
      p_token: token,
    });
    if (sErr || !pid) throw new Error("invalid_session");
    const { data: rows, error } = await (supabaseAdmin as any).rpc(
      "internal_update_player_name",
      { p_player_id: pid, p_new_name: data.name },
    );
    if (error) throw new Error(error.message);
    const row = Array.isArray(rows) ? rows[0] : rows;
    return { player_id: row?.player_id ?? pid, name: row?.name ?? data.name };
  });

const resetPinSchema = z.object({
  phone: z.string().min(8).max(20),
  current_pin: z.string().regex(/^[0-9]{4,8}$/),
  new_pin: z.string().regex(/^[0-9]{4,8}$/, "invalid_new_pin"),
  remember: z.boolean().optional().default(false),
});

export const player_reset_pin = createServerFn({ method: "POST" })
  .validator((raw: unknown) => {
    try {
      return resetPinSchema.parse(raw);
    } catch (e: any) {
      if (e instanceof z.ZodError) {
        const first = e.errors[0];
        if (first) throw new Error(`${first.message}`);
      }
      throw e;
    }
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { writeSessionCookie, getRequestIp, getRequestUserAgent } =
      await import("./player-session.server");
    
    // Forçar normalização do telefone no servidor para garantir match com o banco
    const phone_norm = normalizePhone(data.phone);

    const { data: rows, error } = await supabaseAdmin.rpc("internal_reset_pin", {
      p_phone: phone_norm,
      p_current_pin: data.current_pin,
      p_new_pin: data.new_pin,
      p_ip: (getRequestIp() ?? null) as unknown as string,
      p_user_agent: getRequestUserAgent() ?? "",
      p_remember: data.remember,
    });
    
    if (error) throw new Error(error.message);
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row?.token_plain) throw new Error("invalid_credentials");
    
    writeSessionCookie(row.token_plain, data.remember);
    return { player_id: row.player_id, ok: true };
  });
