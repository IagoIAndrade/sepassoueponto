import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

// Helper to get supabase admin client
async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

// Helper to get the current player ID from the custom session cookie
async function getSessionPlayerId() {
  const { readSessionCookie } = await import("./player-session.server");
  const token = readSessionCookie();
  if (!token) {
    console.log("[AVATAR SERVER] No session cookie found");
    return null;
  }
  const sb = await admin();
  const { data: pid, error } = await sb.rpc("internal_validate_session", {
    p_token: token,
  });
  if (error) {
    console.error("[AVATAR SERVER] internal_validate_session error:", error);
    return null;
  }
  if (!pid) {
    console.log("[AVATAR SERVER] Session token invalid/expired");
    return null;
  }
  return pid as string;
}

// Optional Supabase Auth context
async function getSupabaseUser() {
  const request = getRequest();
  const authHeader = request?.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  
  const token = authHeader.replace('Bearer ', '');
  if (token.split('.').length !== 3) return null;

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) return null;

  const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

// Helper to assert admin role (works for Supabase Auth users)
async function assertAdmin(userId: string | undefined) {
  if (!userId) throw new Error("not_authenticated");
  const sb = await admin();
  const { data, error } = await sb.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("not_authorized");
  return userId;
}

export const get_avatar_signed_url = createServerFn({ method: "POST" })
  .validator((r: unknown) => z.object({ path: z.string() }).parse(r))
  .handler(async ({ data }): Promise<{ url: string | null }> => {
    // 1. Identify viewer
    const supabaseAuthUserId = await getSupabaseUser(); // Defined for admins
    const playerSessionId = await getSessionPlayerId(); // Defined for players

    const viewerId = supabaseAuthUserId || playerSessionId;

    const cleanPath = data.path.replace(/^player-avatars\//, '').replace(/^avatars\//, '');
    const sb = await admin();

    // Visitantes sem sessão: bucket é público, resolve publicUrl sem travar exibição
    if (!viewerId) {
      const { data: pubData } = sb.storage.from('player-avatars').getPublicUrl(cleanPath);
      return { url: pubData?.publicUrl || null };
    }

    // 2. Identify target from path: {player_id}/{filename}
    const pathParts = cleanPath.split('/');
    const targetPlayerId = pathParts[0];

    if (!targetPlayerId) {
      const { data: pubData } = sb.storage.from('player-avatars').getPublicUrl(cleanPath);
      return { url: pubData?.publicUrl || null };
    }

    // 3. Permission logic
    if (supabaseAuthUserId) {
      const { data: isAdmin } = await sb.rpc("has_role", { _user_id: supabaseAuthUserId, _role: "admin" });
      if (isAdmin) {
        const { data: signed, error } = await sb.storage
          .from('player-avatars')
          .createSignedUrl(data.path, 3600);
        if (error) return { url: null };
        return { url: signed.signedUrl };
      }
    }

    if (viewerId !== targetPlayerId) {
      const { data: hasAccess } = await sb.rpc("internal_check_avatar_access", {
        p_viewer_id: viewerId,
        p_target_id: targetPlayerId
      });

      if (!hasAccess) {
        // Fallback público para bucket player-avatars caso não haja autorização privada
        const { data: pubData } = sb.storage.from('player-avatars').getPublicUrl(cleanPath);
        return { url: pubData?.publicUrl || null };
      }
    }

    // Success or own avatar
    const { data: signed, error } = await sb.storage
      .from('player-avatars')
      .createSignedUrl(data.path, 3600);

    if (error) {
      console.error("[AVATAR SERVER] Storage sign error:", error);
      return { url: null };
    }
    return { url: signed.signedUrl };
  });

export const get_avatar_upload_url = createServerFn({ method: "POST" })
  .validator((r: unknown) => z.object({ 
    fileType: z.string(),
    fileSize: z.number().max(10 * 1024 * 1024) // Allow up to 10MB
  }).parse(r))
  .handler(async ({ data }) => {
    const playerId = await getSessionPlayerId();
    if (!playerId) throw new Error("not_authenticated");

    const sb = await admin();
    
    // Generate a versioned filename
    const ext = data.fileType.split('/')[1] || 'jpg';
    const filename = `avatar-${Date.now()}.${ext}`;
    const objectPath = `${playerId}/${filename}`;

    const { data: uploadData, error } = await sb.storage
      .from('player-avatars')
      .createSignedUploadUrl(objectPath);

    if (error) {
      console.error("[AVATAR SERVER] Failed to create signed upload URL:", error);
      throw new Error(error.message);
    }

    return {
      signedUrl: uploadData.signedUrl,
      token: uploadData.token,
      path: objectPath
    };
  });

export const confirm_avatar_upload = createServerFn({ method: "POST" })
  .validator((r: unknown) => z.object({ path: z.string() }).parse(r))
  .handler(async ({ data }) => {
    const playerId = await getSessionPlayerId();
    if (!playerId) throw new Error("not_authenticated");

    // Ensure path belongs to player
    if (!data.path.startsWith(`${playerId}/`)) throw new Error("invalid_path");

    const sb = await admin();
    
    // Verify file exists
    const filename = data.path.split('/')[1];
    const { data: files, error: listError } = await sb.storage
      .from('player-avatars')
      .list(playerId, { search: filename });

    if (listError || !files || files.length === 0) {
      console.error("[AVATAR SERVER] Confirmation failed - file not found:", data.path);
      throw new Error("file_not_found");
    }

    // 1. Get old path to delete later
    const { data: oldPlayer } = await sb
      .from('players')
      .select('avatar_path')
      .eq('id', playerId)
      .single();

    // 2. Update player profile
    const { error: dbError } = await sb
      .from('players')
      .update({
        avatar_path: data.path,
        avatar_status: 'pending',
        avatar_uploaded_at: new Date().toISOString(),
        avatar_updated_at: new Date().toISOString(),
        avatar_rejection_reason: null
      })
      .eq('id', playerId);

    if (dbError) {
      console.error("[AVATAR SERVER] Database update failed:", dbError);
      throw new Error("Falha ao salvar a referência da foto no banco.");
    }

    // 3. Cleanup old files (best effort)
    if (oldPlayer?.avatar_path && oldPlayer.avatar_path !== data.path) {
      try {
        await sb.storage
          .from('player-avatars')
          .remove([oldPlayer.avatar_path]);
      } catch (e) {
        console.warn("[AVATAR SERVER] Best-effort cleanup failed:", e);
      }
    }

    return { ok: true };
  });

export const player_remove_avatar = createServerFn({ method: "POST" })
  .handler(async () => {
    const playerId = await getSessionPlayerId();
    if (!playerId) throw new Error("not_authenticated");

    const sb = await admin();

    // 1. Get current path for deletion
    const { data: player } = await sb
      .from('players')
      .select('avatar_path')
      .eq('id', playerId)
      .single();

    // 2. Clear from DB
    const { error: dbError } = await sb
      .from('players')
      .update({
        avatar_path: null,
        avatar_status: null,
        avatar_uploaded_at: null,
        avatar_updated_at: new Date().toISOString(),
        avatar_rejection_reason: null
      })
      .eq('id', playerId);

    if (dbError) throw new Error(dbError.message);

    // 3. Try to delete from storage if existed
    if (player?.avatar_path) {
      await sb.storage
        .from('player-avatars')
        .remove([player.avatar_path]);
    }

    return { ok: true };
  });

export const admin_reject_avatar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => z.object({ 
    player_id: z.string().uuid(),
    reason: z.string().optional()
  }).parse(r))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const sb = await admin();
    const { error } = await sb
      .from('players')
      .update({
        avatar_status: 'rejected',
        avatar_rejection_reason: data.reason || null,
        avatar_updated_at: new Date().toISOString()
      })
      .eq('id', data.player_id);
    
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const admin_approve_avatar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => z.object({ 
    player_id: z.string().uuid()
  }).parse(r))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const sb = await admin();
    const { error } = await sb
      .from('players')
      .update({
        avatar_status: 'approved',
        avatar_rejection_reason: null,
        avatar_updated_at: new Date().toISOString()
      })
      .eq('id', data.player_id);
    
    if (error) throw new Error(error.message);
    return { ok: true };
  });

