import { RegistrationResult } from "./players-signup.types";
import { normalizePhone } from "./utils";

type SignupInput = {
  firstName: string;
  lastName: string;
  phone: string;
  pin: string;
  groupIds: string[];
  photo: File;
  remember: boolean;
};

const SIGNUP_VERSION = "signup-route-v4-20260806";

export async function processPlayerSignup(formData: FormData): Promise<RegistrationResult> {
  const photoValue = formData.get("photo");
  const phoneRaw = formData.get("phone")?.toString() || "";
  const firstName = formData.get("firstName")?.toString()?.trim() || "";
  const lastName = formData.get("lastName")?.toString()?.trim() || "";
  const pin = formData.get("pin")?.toString() || "";
  const remember = formData.get("remember") === "true";
  
  // No frontend, groupIds é enviado como string JSON ou múltiplos appends. 
  // Na nossa nova implementação de fetch, enviaremos múltiplos appends.
  const groupIds = formData.getAll("groupIds").map(String).filter(Boolean);

  const input: SignupInput = {
    firstName,
    lastName,
    phone: normalizePhone(phoneRaw),
    pin,
    groupIds,
    photo: photoValue as File,
    remember
  };

  // STAGE 1: Validation
  if (!input.firstName || input.firstName.length < 2) {
    return { success: false, stage: "validation", userMessage: "Nome inválido (mínimo 2 letras)." };
  }
  if (input.phone.length !== 11) {
    return { 
      success: false, 
      stage: "validation", 
      code: "INVALID_PHONE",
      userMessage: "WhatsApp inválido. Informe exatamente 11 dígitos (DDD + número)." 
    };
  }
  if (!/^\d{4}$/.test(input.pin)) {
    return { success: false, stage: "validation", userMessage: "O PIN deve ter exatamente 4 números." };
  }
  if (input.groupIds.length === 0) {
    return { success: false, stage: "validation", userMessage: "Selecione pelo menos uma turma." };
  }
  
  if (!(input.photo instanceof File) || input.photo.size <= 0) {
    return { success: false, stage: "validation", code: "PHOTO_REQUIRED", userMessage: "A foto é obrigatória e deve ser um arquivo válido." };
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(input.photo.type)) {
    return { success: false, stage: "validation", userMessage: "Formato de imagem não suportado. Use JPG, PNG ou WEBP." };
  }

  if (input.photo.size > 5 * 1024 * 1024) { // 5MB
    return { success: false, stage: "validation", userMessage: "A foto deve ter no máximo 5MB." };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { writeSessionCookie, getRequestIp, getRequestUserAgent } = await import("./player-session.server");

  // STAGE 2: Duplicate Check & Player Creation/Retrieval
  let playerId: string;
  let tokenPlain: string | null = null;

  try {
    const ip = getRequestIp();
    const userAgent = getRequestUserAgent();

    // 1. Verificar duplicidade (idempotência)
    const { data: existingPlayer, error: fetchError } = await (supabaseAdmin as any)
      .from('players')
      .select('id, avatar_path, avatar_status')
      .eq('phone_normalized', input.phone)
      .maybeSingle();

    if (fetchError) {
      console.error(`[${SIGNUP_VERSION}] player_lookup_failed`, fetchError);
      return {
        success: false,
        version: SIGNUP_VERSION,
        stage: "player_lookup",
        code: fetchError.code,
        userMessage: "Erro ao verificar cadastro existente.",
        technicalMessage: fetchError.message
      };
    }

    if (existingPlayer) {
      // Se já tem foto aprovada ou pendente, bloqueia duplicado
      if (existingPlayer.avatar_path && existingPlayer.avatar_status !== 'rejected') {
        return {
          success: false,
          version: SIGNUP_VERSION,
          stage: "duplicate_check",
          code: "ALREADY_REGISTERED",
          userMessage: "Este WhatsApp já possui cadastro concluído. Acesse pela opção 'Já sou cadastrado'."
        };
      }
      playerId = existingPlayer.id;
      console.log(`[${SIGNUP_VERSION}] reusing partial player`, { playerId });
    } else {
      // 2. Criar jogador via SQL Direto para evitar erro 42883 de search_path na RPC
      // Usamos extensões explicitamente via RPC auxiliar ou SQL direto
      const fullName = input.lastName ? `${input.firstName} ${input.lastName}`.trim() : input.firstName.trim();
      
      // Como o erro 42883 ocorre porque gen_salt não é encontrado no search_path da RPC,
      // usaremos um insert direto e deixaremos o banco lidar com o hash se houver trigger, 
      // OU chamaremos a função de hash se ela for acessível.
      // A função public.hash_pin(text) existe!
      
      const { data: hashedPinData, error: hashError } = await (supabaseAdmin as any)
        .rpc('hash_pin', { p_pin: input.pin });
        
      if (hashError) {
         console.error(`[${SIGNUP_VERSION}] hash_pin_failed`, hashError);
         return {
           success: false,
           version: SIGNUP_VERSION,
           stage: "player_creation",
           code: hashError.code,
           userMessage: "Erro ao processar segurança do PIN.",
           technicalMessage: hashError.message
         };
      }

      const pinHash = hashedPinData;

      const { data: newPlayer, error: createError } = await (supabaseAdmin as any)
        .from('players')
        .insert({
          name: fullName,
          first_name: input.firstName,
          last_name: input.lastName,
          phone: input.phone,
          phone_normalized: input.phone,
          pin_hash: pinHash,
          avatar_status: 'pending',
          active: true
        })
        .select('id')
        .single();

      if (createError) {
        console.error(`[${SIGNUP_VERSION}] player_insert_failed`, createError);
        return {
          success: false,
          version: SIGNUP_VERSION,
          stage: "player_creation",
          code: createError.code,
          userMessage: "Não foi possível criar seu cadastro.",
          technicalMessage: createError.message
        };
      }

      playerId = newPlayer.id;
      console.log(`[${SIGNUP_VERSION}] player created`, { playerId });
    }

    // 3. Gerar Sessão (Login Automático)
    // Usamos a RPC internal_login_player que já funciona e sabe criar tokens
    const { data: loginData, error: loginError } = await (supabaseAdmin as any)
      .rpc('internal_login_player', {
        p_phone: input.phone,
        p_pin: input.pin,
        p_ip: ip,
        p_user_agent: userAgent,
        p_remember: input.remember
      });

    if (!loginError && loginData) {
      const row = Array.isArray(loginData) ? loginData[0] : loginData;
      tokenPlain = row.token_plain;
    } else {
      console.warn(`[${SIGNUP_VERSION}] auto_login_failed_after_signup`, loginError);
    }

  } catch (e: any) {
    console.error(`[${SIGNUP_VERSION}] player_creation_exception`, e);
    return {
      success: false,
      version: SIGNUP_VERSION,
      stage: "player_creation",
      userMessage: "Erro inesperado ao processar o cadastro.",
      technicalMessage: e.message
    };
  }

  // STAGE 3: Photo Upload
  const fileExt = input.photo.type.split('/')[1] || 'webp';
  const filePath = `avatars/${playerId}/profile.${fileExt}`;
  
  try {
    const arrayBuffer = await input.photo.arrayBuffer();
    const { error: uploadError } = await (supabaseAdmin as any).storage
      .from('player-avatars')
      .upload(filePath, arrayBuffer, {
        contentType: input.photo.type,
        upsert: true
      });

    if (uploadError) {
      return {
        success: false,
        stage: "photo_upload",
        code: "STORAGE_ERROR",
        playerId,
        userMessage: "Falha ao enviar arquivo de imagem.",
        technicalMessage: uploadError.message
      };
    }
  } catch (e: any) {
    return {
      success: false,
      stage: "photo_upload",
      playerId,
      userMessage: "Erro ao processar dados binários da foto.",
      technicalMessage: e.message
    };
  }

  // STAGE 4: Update Player Record
  try {
    const { error: updateError } = await (supabaseAdmin as any)
      .from('players')
      .update({ 
        avatar_path: filePath,
        avatar_status: 'pending'
      })
      .eq('id', playerId);

    if (updateError) {
      return {
        success: false,
        stage: "player_update",
        code: "UPDATE_ERROR",
        playerId,
        userMessage: "Erro ao atualizar dados do perfil com a nova foto.",
        technicalMessage: updateError.message
      };
    }
  } catch (e: any) {
    return {
      success: false,
      stage: "player_update",
      playerId,
      userMessage: "Erro inesperado ao salvar caminho da foto.",
      technicalMessage: e.message
    };
  }

  // STAGE 5: Ensure Group Requests - Apenas turmas expressamente selecionadas
  try {
    const targetGroupIds = Array.from(new Set(input.groupIds.filter(gid => gid && gid !== "undefined" && gid !== "00000000-0000-0000-0000-000000000000")));
    for (const gid of targetGroupIds) {
      const { error: groupError } = await (supabaseAdmin as any)
        .from('player_groups')
        .upsert({
          player_id: playerId,
          group_id: gid,
          status: 'pending'
        }, { onConflict: 'player_id,group_id' });
        
      if (groupError) {
        console.error(`[${SIGNUP_VERSION}] group_request_failed`, { gid, error: groupError });
      }
    }
  } catch (e: any) {
    console.error("[processPlayerSignup] Group requests fallback error", e);
  }

  // Login automático se for criação nova (token_plain disponível)
  if (tokenPlain) {
    writeSessionCookie(tokenPlain, input.remember);
  }

  return {
    success: true,
    stage: "verification",
    playerId,
    groups: input.groupIds,
    userMessage: "Cadastro realizado com sucesso!"
  };
}
