-- Core schema for oPeN VTT (issue #3).
-- Global identity (auth.users); everything game-specific is scoped by room_id.

create table public.rooms (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  password_hash text not null,
  room_code     text not null unique,
  created_by    uuid not null references auth.users (id) on delete cascade,
  created_at    timestamptz not null default now()
);

-- Many-to-many join: one user can belong to many rooms, with a per-room role.
-- Role lives here (not on the user) so the same person can DM one room and
-- play in another. UNIQUE(room_id, user_id) => a user joins a room at most once.
create table public.room_members (
  id        uuid primary key default gen_random_uuid(),
  room_id   uuid not null references public.rooms (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  role      text not null check (role in ('dm', 'player')),
  joined_at timestamptz not null default now(),
  unique (room_id, user_id)
);

-- Tokens carry their own authoritative x/y (the board is reconstructed by
-- querying these rows; ephemeral drag updates go over Socket.IO).
create table public.tokens (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.rooms (id) on delete cascade,
  name        text not null,
  color       text not null,
  x           double precision not null default 0,
  y           double precision not null default 0,
  assigned_to uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

-- A character is scoped to (room, user). Players get exactly one (enforced by a
-- trigger in a later migration); DMs may own many (NPC/monster stat cards).
create table public.characters (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.rooms (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null,
  hp         integer not null default 0,
  max_hp     integer not null default 0,
  ac         integer not null default 10,
  notes      text not null default '',
  created_at timestamptz not null default now()
);

create index idx_room_members_user on public.room_members (user_id);
create index idx_room_members_room on public.room_members (room_id);
create index idx_tokens_room on public.tokens (room_id);
create index idx_tokens_assigned on public.tokens (assigned_to);
create index idx_characters_room on public.characters (room_id);
create index idx_characters_user on public.characters (user_id);
