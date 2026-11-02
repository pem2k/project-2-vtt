-- Table privileges (RLS still gates individual rows). Only authenticated users
-- touch these tables; anon has no grants and no policies.
grant select, insert, update, delete
  on public.rooms, public.room_members, public.tokens, public.characters
  to authenticated;

alter table public.rooms         enable row level security;
alter table public.room_members  enable row level security;
alter table public.tokens        enable row level security;
alter table public.characters    enable row level security;

-- ── rooms ───────────────────────────────────────────────────────────────────
-- Members-only read; no public lookup (that would leak password_hash + the room
-- list). Creation happens through create_room(); joining through join_room().
create policy rooms_select_members on public.rooms
  for select to authenticated
  using (public.is_room_member(id));

create policy rooms_delete_creator on public.rooms
  for delete to authenticated
  using (created_by = auth.uid());

-- ── room_members ────────────────────────────────────────────────────────────
create policy members_select_same_room on public.room_members
  for select to authenticated
  using (public.is_room_member(room_id));

-- Leave a room yourself, or be removed by the room's DM. Inserts go via RPC.
create policy members_delete_self_or_dm on public.room_members
  for delete to authenticated
  using (user_id = auth.uid() or public.is_room_dm(room_id));

-- ── tokens ──────────────────────────────────────────────────────────────────
-- DM manages tokens fully; players have NO direct write path and must use
-- move_token() (which only changes x/y of a token assigned to them).
create policy tokens_select_members on public.tokens
  for select to authenticated
  using (public.is_room_member(room_id));

create policy tokens_insert_dm on public.tokens
  for insert to authenticated
  with check (public.is_room_dm(room_id));

create policy tokens_update_dm on public.tokens
  for update to authenticated
  using (public.is_room_dm(room_id))
  with check (public.is_room_dm(room_id));

create policy tokens_delete_dm on public.tokens
  for delete to authenticated
  using (public.is_room_dm(room_id));

-- ── characters ──────────────────────────────────────────────────────────────
-- Any member reads all cards in the room. A member inserts a card they own
-- (trigger caps players at one; DMs may own many). Players have NO direct
-- update path — they edit hp/notes via update_character(); DM edits all fields.
create policy characters_select_members on public.characters
  for select to authenticated
  using (public.is_room_member(room_id));

create policy characters_insert_self on public.characters
  for insert to authenticated
  with check (public.is_room_member(room_id) and user_id = auth.uid());

create policy characters_update_dm on public.characters
  for update to authenticated
  using (public.is_room_dm(room_id))
  with check (public.is_room_dm(room_id));

create policy characters_delete_dm_or_owner on public.characters
  for delete to authenticated
  using (public.is_room_dm(room_id) or user_id = auth.uid());
