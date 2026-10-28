import { supabaseAdmin } from "./src/integrations/supabase/client.server";

async function test() {
  const { data, error } = await supabaseAdmin
    .from("registrations")
    .select("id, player_id, players(name)")
    .is("cancelled_at", null)
    .limit(5);
  
  console.log(JSON.stringify({ data, error }, null, 2));
}

test();
