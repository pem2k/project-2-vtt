-- set_active_map: the DM's guarded write path to rooms.active_map_id.
-- rooms has no UPDATE policy (switching columns like password_hash/name must not
-- be a direct client write), so changing the active map goes through this
-- SECURITY DEFINER RPC, which verifies DM role and that the map belongs to the room.
create or replace function public.set_active_map(
  p_room_id uuid,
  p_map_id  uuid
)
returns public.rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_room public.rooms;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  if public.is_room_dm(p_room_id) is not true then
    raise exception 'not allowed to set the active map';
  end if;

  if not exists (
    select 1 from public.maps where id = p_map_id and room_id = p_room_id
  ) then
    raise exception 'map does not belong to this room';
  end if;

  update public.rooms
  set active_map_id = p_map_id
  where id = p_room_id
  returning * into v_room;

  return v_room;
end;
$$;

revoke all on function public.set_active_map(uuid, uuid) from public;
grant execute on function public.set_active_map(uuid, uuid) to authenticated;
