-- Este script encontra inscrições ativas de jogadores que não possuam a devida aprovação (status = 'approved') na turma vinculada à rodada correspondente.

SELECT 
  r.id as registration_id,
  r.event_id,
  e.event_date,
  e.group_id,
  g.name as group_name,
  r.player_id,
  p.name as player_name,
  p.phone_normalized,
  r.list_type,
  r.created_at,
  COALESCE(pg.status, 'none') as player_group_status
FROM public.registrations r
JOIN public.volleyball_events e ON e.id = r.event_id
JOIN public.groups g ON g.id = e.group_id
JOIN public.players p ON p.id = r.player_id
LEFT JOIN public.player_groups pg ON pg.player_id = r.player_id AND pg.group_id = e.group_id
WHERE r.cancelled_at IS NULL
  AND r.registration_source NOT IN ('admin', 'admin_sync')
  AND COALESCE(p.is_guest, false) = false
  AND COALESCE(pg.status, 'none') <> 'approved'
ORDER BY e.event_date DESC, r.created_at DESC;