-- pgcrypto provides crypt() / gen_salt() for hashing + verifying room passwords
-- inside Postgres (never client-side, never in the Socket.IO server).
create extension if not exists pgcrypto with schema extensions;
