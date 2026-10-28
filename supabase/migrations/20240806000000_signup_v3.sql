create or replace function public.internal_signup_player_v3(
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_pin text,
  p_group_ids uuid[],
  p_avatar_path text default null,
  p_ip text default null,
  p_user_agent text default null,
  p_remember boolean default false
)
returns table (
  player_id uuid,
  token_plain text
)
language plpgsql
security definer
set search_path = public, auth
as \$\$
declare
  v_player_id uuid;
  v_token_hash text;
  v_token_plain text;
  v_gid uuid;
begin
  -- 1. Verificar duplicidade de telefone
  if exists (select 1 from public.players where phone_normalized = p_phone) then
    raise exception 'phone_already_exists';
  end if;

  -- 2. Criar jogador
  insert into public.players (
    name,
    first_name,
    last_name,
    phone,
    phone_normalized,
    pin_hash,
    avatar_path,
    avatar_status
  )
  values (
    trim(p_first_name || ' ' || p_last_name),
    p_first_name,
    p_last_name,
    p_phone,
    p_phone,
    crypt(p_pin, gen_salt('bf')),
    p_avatar_path,
    case when p_avatar_path is not null then 'pending' else null end
  )
  returning id into v_player_id;

  -- 3. Criar solicitações de turmas
  foreach v_gid in array p_group_ids
  loop
    insert into public.player_groups (player_id, group_id, status)
    values (v_player_id, v_gid, 'pending')
    on conflict (player_id, group_id) do nothing;
  end loop;

  -- 4. Criar sessão
  v_token_plain := encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(digest(v_token_plain, 'sha256'), 'hex');

  insert into public.player_sessions (
    player_id,
    token_hash,
    ip_address,
    user_agent,
    expires_at,
    absolute_expires_at
  )
  values (
    v_player_id,
    v_token_hash,
    p_ip,
    p_user_agent,
    case when p_remember then now() + interval '30 days' else now() + interval '2 hours' end,
    case when p_remember then now() + interval '90 days' else now() + interval '24 hours' end
  );

  return query select v_player_id, v_token_plain;
end;
\$\$;

grant execute on function public.internal_signup_player_v3 to service_role;
