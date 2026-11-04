-- Seed data for local dev + integration tests. Runs on every `supabase db reset`.
-- Three test users (password: password123 for all). Dev-only — never pushed to prod.
--
--   dm@test.dev       11111111-1111-1111-1111-111111111111  (DM of the test room)
--   player1@test.dev  22222222-2222-2222-2222-222222222222  (player in the test room)
--   player2@test.dev  33333333-3333-3333-3333-333333333333  (NOT a member — negative tests)
--
-- Test room: The Sunless Citadel  (password: roompass)

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  raw_app_meta_data, raw_user_meta_data
)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'dm@test.dev',
   extensions.crypt('password123', extensions.gen_salt('bf')),
   now(), now(), now(), '', '', '', '',
   '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'player1@test.dev',
   extensions.crypt('password123', extensions.gen_salt('bf')),
   now(), now(), now(), '', '', '', '',
   '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333',
   'authenticated', 'authenticated', 'player2@test.dev',
   extensions.crypt('password123', extensions.gen_salt('bf')),
   now(), now(), now(), '', '', '', '',
   '{"provider":"email","providers":["email"]}', '{}');

insert into auth.identities (
  provider_id, user_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
values
  ('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111',
   '{"sub":"11111111-1111-1111-1111-111111111111","email":"dm@test.dev"}', 'email',
   now(), now(), now()),
  ('22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222',
   '{"sub":"22222222-2222-2222-2222-222222222222","email":"player1@test.dev"}', 'email',
   now(), now(), now()),
  ('33333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333',
   '{"sub":"33333333-3333-3333-3333-333333333333","email":"player2@test.dev"}', 'email',
   now(), now(), now());

-- Test room (password: roompass). Fixed id for predictable tests.
insert into public.rooms (id, name, password_hash, created_by)
values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'The Sunless Citadel',
  extensions.crypt('roompass', extensions.gen_salt('bf')),
  '11111111-1111-1111-1111-111111111111'
);

insert into public.room_members (room_id, user_id, role)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'dm'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'player');

insert into public.tokens (room_id, name, color, x, y, assigned_to)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Goblin Scout', '#b23b3b', 2, 3,
   '11111111-1111-1111-1111-111111111111'),   -- NPC, controlled by the DM
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Aria', '#3b6db2', 5, 5,
   '22222222-2222-2222-2222-222222222222');   -- player1's token

insert into public.characters (room_id, user_id, name, hp, max_hp, ac, notes)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222',
   'Aria the Rogue', 18, 22, 14, 'Prefers the shadows.'),       -- player1's one PC
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111',
   'Goblin Boss', 12, 12, 15, 'NPC stat card owned by the DM.'); -- DM NPC card
