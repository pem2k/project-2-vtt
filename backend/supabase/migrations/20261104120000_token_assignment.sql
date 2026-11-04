-- Token assignment and room member display names (issue #10).

-- 1. get_room_members RPC
-- Returns members of a room with their role and display name (derived from username or email prefix).
-- Never exposes emails or other auth.users columns to client.
create or replace function public.get_room_members(p_room_id uuid)
returns table (
  user_id uuid,
  role text,
  display_name text
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_room_member(p_room_id) then
    raise exception 'not a member of this room';
  end if;

  return query
  select
    rm.user_id,
    rm.role,
    coalesce(nullif(btrim(u.raw_user_meta_data->>'username'), ''), split_part(u.email, '@', 1)) as display_name
  from public.room_members rm
  join auth.users u on u.id = rm.user_id
  where rm.room_id = p_room_id
  order by (case when rm.role = 'dm' then 0 else 1 end), display_name asc;
end;
$$;

revoke all on function public.get_room_members(uuid) from public;
grant execute on function public.get_room_members(uuid) to authenticated;

-- 2. Trigger to enforce token assignee is a member of the room
create or replace function public.enforce_token_assignee_is_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.assigned_to is not null and not exists (
    select 1
    from public.room_members
    where room_id = new.room_id
      and user_id = new.assigned_to
  ) then
    raise exception 'assignee must be a member of the room';
  end if;

  return new;
end;
$$;

create trigger trg_enforce_token_assignee_is_member
  before insert or update of assigned_to on public.tokens
  for each row execute function public.enforce_token_assignee_is_member();

