-- Membership/role helpers used by RLS policies.
-- SECURITY DEFINER (owned by postgres, which has BYPASSRLS) so that a policy on
-- room_members can call these without self-recursing through room_members' own RLS.

create or replace function public.is_room_member(p_room_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.room_members
    where room_id = p_room_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.is_room_dm(p_room_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.room_members
    where room_id = p_room_id
      and user_id = auth.uid()
      and role = 'dm'
  );
$$;

revoke all on function public.is_room_member(uuid) from public;
revoke all on function public.is_room_dm(uuid) from public;
grant execute on function public.is_room_member(uuid) to authenticated;
grant execute on function public.is_room_dm(uuid) to authenticated;
