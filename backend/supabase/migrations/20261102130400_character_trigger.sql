-- One character per player per room; DMs may own many (NPC/monster cards).
-- The rule depends on the user's role (in room_members), which isn't on the
-- characters row, so a plain UNIQUE constraint can't express it — hence a trigger.
create or replace function public.enforce_one_character_per_player()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  select role into v_role
  from public.room_members
  where room_id = new.room_id
    and user_id = new.user_id;

  if v_role is null then
    raise exception 'user % is not a member of room %', new.user_id, new.room_id;
  end if;

  if v_role = 'player' and exists (
    select 1
    from public.characters
    where room_id = new.room_id
      and user_id = new.user_id
      and id <> new.id
  ) then
    raise exception 'player % already has a character in room %', new.user_id, new.room_id;
  end if;

  return new;
end;
$$;

create trigger trg_one_character_per_player
  before insert or update of room_id, user_id on public.characters
  for each row execute function public.enforce_one_character_per_player();
