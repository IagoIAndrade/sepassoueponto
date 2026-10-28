import { supabaseAdmin } from "./integrations/supabase/client.server";

async function runTest() {
  // Vamos buscar um admin que REALMENTE esteja na tabela players
  const { data: adminPlayers } = await supabaseAdmin
    .from("players")
    .select("id, name")
    .in("id", (await supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin")).data?.map(a => a.user_id) || [])
    .limit(1);

  if (!adminPlayers || adminPlayers.length === 0) {
    console.error("ERRO: Nenhum administrador encontrado na tabela players! Tentando buscar o primeiro player qualquer para simular o ID de admin e testar a FK...");
    const { data: firstPlayer } = await supabaseAdmin.from("players").select("id").limit(1).single();
    if (!firstPlayer) return;
    var adminId = firstPlayer.id;
  } else {
    var adminId = adminPlayers[0].id;
    console.log("Admin validado em players:", adminPlayers[0].name, "(", adminId, ")");
  }

  const registrationId = '33df45b4-525b-40ce-ba13-1cd05d1236bb'; // Inscrição da Sara

  console.log("[ADMIN REMOVE START]");
  console.log("admin_id used:", adminId);
  console.log("registration_id:", registrationId);

  // 1. Status inicial
  const { data: initialReg } = await supabaseAdmin
    .from("registrations")
    .select("list_type, cancelled_at, event_id")
    .eq("id", registrationId)
    .single();
  
  if (!initialReg) {
    console.error("ERRO: Inscrição não encontrada!");
    return;
  }
  
  console.log("registration status before:", initialReg.list_type, "cancelled:", !!initialReg.cancelled_at);

  // 2. Tentar APENAS a RPC
  console.log("\n[RPC RESULT]");
  const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc("admin_remove_registration_v3", {
    p_registration_id: registrationId,
    p_admin_user_id: adminId,
  });

  if (rpcError) {
    console.log("data: null");
    console.log("error.code:", rpcError.code);
    console.log("error.message:", rpcError.message);
    console.log("error.details:", rpcError.details);
    console.log("error.hint:", rpcError.hint);
  } else {
    console.log("data:", rpcData);
    console.log("error: null");
  }

  // 3. Verificar se a remoção e promoção ocorreram
  const { data: finalRegs } = await supabaseAdmin
    .from("registrations")
    .select("id, player_id, list_type, position_number")
    .eq("event_id", initialReg.event_id)
    .is("cancelled_at", null)
    .order("position_number", { ascending: true });
    
  console.log("\nLista após remoção (Top 5):", finalRegs?.slice(0, 5));

  console.log("\n[ADMIN REMOVE END]");
}

runTest().catch(console.error);
