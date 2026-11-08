-- Guarded operations the client calls via supabase.rpc(...). All SECURITY DEFINER
-- so they run server-side with a fixed, auditable set of steps.

-- create_room: hash the password (pgcrypto), insert the room, make the caller its
-- DM. Returns the new id + a generated unique room code.
create or replace function public.create_room(p_name text, p_password text)
returns table (id uuid, room_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_code    text;
  v_room_id uuid;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  -- Unambiguous 6-char code (no 0/O/1/I), retried on the rare collision.
  loop
    v_code := (
      select string_agg(
        substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', floor(random() * 30)::int + 1, 1),
        ''
      )
      from generate_series(1, 6)
    );
    exit when not exists (select 1 from public.rooms r where r.room_code = v_code);
  end loop;

  insert into public.rooms (name, password_hash, room_code, created_by)
  values (p_name, extensions.crypt(p_password, extensions.gen_salt('bf')), v_code, v_uid)
  returning rooms.id into v_room_id;

  insert into public.room_members (room_id, user_id, role)
  values (v_room_id, v_uid, 'dm');

  return query select v_room_id, v_code;
end;
$$;

-- join_room: look up by code, verify the password hash, add the caller as a
-- player. Idempotent (re-joining keeps the existing membership/role).
create or replace function public.join_room(p_room_code text, p_password text)
returns uuid
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

  select * into v_room from public.rooms where room_code = upper(p_room_code);
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

-- move_token: the player's ONLY write path to a token — changes x/y only, and
-- only for a token assigned to them (or any token, if they DM the room).
create or replace function public.move_token(
  p_token_id uuid,
  p_x        double precision,
  p_y        double precision
)
returns public.tokens
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_token      public.tokens;
  v_authorized boolean;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  select * into v_token from public.tokens where id = p_token_id;
  if not found then
    raise exception 'token not found';
  end if;

  v_authorized := public.is_room_dm(v_token.room_id)
    or (v_token.assigned_to is not null and v_token.assigned_to = v_uid);

  if v_authorized is not true then
    raise exception 'not allowed to move this token';
  end if;

  update public.tokens
  set x = p_x, y = p_y
  where id = p_token_id
  returning * into v_token;

  return v_token;
end;
$$;

-- update_character: the player's write path to their own card — hp/notes only
-- (nulls leave a field unchanged). DMs edit all fields via a direct UPDATE.
create or replace function public.update_character(
  p_character_id uuid,
  p_hp           integer default null,
  p_notes        text    default null
)
returns public.characters
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_char public.characters;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  select * into v_char from public.characters where id = p_character_id;
  if not found then
    raise exception 'character not found';
  end if;

  if v_char.user_id <> v_uid then
    raise exception 'not allowed to edit this character';
  end if;

  update public.characters
  set hp    = coalesce(p_hp, hp),
      notes = coalesce(p_notes, notes)
  where id = p_character_id
  returning * into v_char;

  return v_char;
end;
$$;

revoke all on function public.create_room(text, text) from public;
revoke all on function public.join_room(text, text) from public;
revoke all on function public.move_token(uuid, double precision, double precision) from public;
revoke all on function public.update_character(uuid, integer, text) from public;

grant execute on function public.create_room(text, text) to authenticated;
grant execute on function public.join_room(text, text) to authenticated;
grant execute on function public.move_token(uuid, double precision, double precision) to authenticated;
grant execute on function public.update_character(uuid, integer, text) to authenticated;
