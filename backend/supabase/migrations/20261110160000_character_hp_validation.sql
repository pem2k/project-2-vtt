-- Character HP validation and room membership enforcement (issue #14).
-- Ensures HP stays between 0 and max_hp, callers must be active room members,
-- players edit only their own character, and DM edits any card in their room.

alter table public.characters
  add constraint characters_hp_range check (hp >= 0 and hp <= max_hp);

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

  if not public.is_room_member(v_char.room_id) then
    raise exception 'not a member of room';
  end if;

  if v_char.user_id <> v_uid then
    raise exception 'not allowed to edit this character';
  end if;

  if p_hp is not null and (p_hp < 0 or p_hp > v_char.max_hp) then
    raise exception 'hp must be between 0 and max_hp';
  end if;

  update public.characters
  set hp    = coalesce(p_hp, hp),
      notes = coalesce(p_notes, notes)
  where id = p_character_id
  returning * into v_char;

  return v_char;
end;
$$;

revoke all on function public.update_character(uuid, integer, text) from public;
grant execute on function public.update_character(uuid, integer, text) to authenticated;

