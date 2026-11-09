-- Fix null-password bypass in join_room by explicitly rejecting null passwords
-- and using null-safe comparison (IS DISTINCT FROM).

create or replace function public.join_room(p_name text, p_password text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  select *
    into v_room
    from public.rooms
   where lower(btrim(name)) = lower(btrim(p_name));

  if not found then
    raise exception 'room not found';
  end if;

  if p_password is null or extensions.crypt(p_password, v_room.password_hash) is distinct from v_room.password_hash then
    raise exception 'invalid password';
  end if;

  insert into public.room_members (room_id, user_id, role)
  values (v_room.id, v_uid, 'player')
  on conflict (room_id, user_id) do nothing;

  return v_room.id;
end;
$$;

revoke all on function public.join_room(text, text) from public;
grant execute on function public.join_room(text, text) to authenticated;
