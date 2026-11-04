-- Replace room-code room access with trimmed, case-insensitive room names.
-- Abort rather than changing data if existing names conflict.
do $$
begin
  if exists (
    select 1
    from public.rooms
    group by lower(btrim(name))
    having count(*) > 1
  ) then
    raise exception
      'cannot enforce unique room names: duplicate trimmed, case-insensitive names exist; resolve them manually';
  end if;
end;
$$;

drop function if exists public.create_room(text, text);
drop function if exists public.join_room(text, text);

alter table public.rooms
  drop constraint rooms_room_code_key,
  drop column room_code;

create unique index rooms_name_ci_unique
  on public.rooms (lower(btrim(name)));

create or replace function public.create_room(p_name text, p_password text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room_id uuid;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  begin
    insert into public.rooms (name, password_hash, created_by)
    values (btrim(p_name), extensions.crypt(p_password, extensions.gen_salt('bf')), v_uid)
    returning id into v_room_id;
  exception
    when unique_violation then
      raise exception 'room name already taken';
  end;

  insert into public.room_members (room_id, user_id, role)
  values (v_room_id, v_uid, 'dm');

  return v_room_id;
end;
$$;

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

  if extensions.crypt(p_password, v_room.password_hash) <> v_room.password_hash then
    raise exception 'invalid password';
  end if;

  insert into public.room_members (room_id, user_id, role)
  values (v_room.id, v_uid, 'player')
  on conflict (room_id, user_id) do nothing;

  return v_room.id;
end;
$$;

revoke all on function public.create_room(text, text) from public;
revoke all on function public.join_room(text, text) from public;

grant execute on function public.create_room(text, text) to authenticated;
grant execute on function public.join_room(text, text) to authenticated;
