-- Maps table and active_map_id support for rooms (issue #7).
-- Maps belong to a room. Only the room's DM may upload/delete maps.
-- Room members may view maps.

-- 1. Create maps table
create table public.maps (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.rooms (id) on delete cascade,
  name       text not null,
  url        text not null,
  created_at timestamptz not null default now()
);

create index idx_maps_room on public.maps (room_id);

-- 2. Add active_map_id foreign key on rooms
alter table public.rooms
  add column active_map_id uuid references public.maps (id) on delete set null;

-- 3. Trigger function to auto-set the first uploaded map as the room's active map
create or replace function public.set_first_active_map()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only update if the room does not currently have an active map
  update public.rooms
  set active_map_id = new.id
  where id = new.room_id
    and active_map_id is null;

  return new;
end;
$$;

create trigger tr_maps_first_active
  after insert on public.maps
  for each row
  execute function public.set_first_active_map();

-- 4. Enable RLS and define policies for public.maps
grant select, insert, delete, update on public.maps to authenticated;
alter table public.maps enable row level security;

-- Members of the room can select/view all maps in that room
create policy maps_select_members on public.maps
  for select to authenticated
  using (public.is_room_member(room_id));

-- Only the DM can upload/insert maps into their room
create policy maps_insert_dm on public.maps
  for insert to authenticated
  with check (public.is_room_dm(room_id));

-- Only the DM can update map details
create policy maps_update_dm on public.maps
  for update to authenticated
  using (public.is_room_dm(room_id))
  with check (public.is_room_dm(room_id));

-- Only the DM can delete maps from their room
create policy maps_delete_dm on public.maps
  for delete to authenticated
  using (public.is_room_dm(room_id));

-- 5. Storage bucket for maps & policies
-- Create bucket if not exists
insert into storage.buckets (id, name, public)
values ('maps', 'maps', true)
on conflict (id) do nothing;

-- Storage RLS policies on storage.objects for 'maps' bucket
-- Room members can read objects stored under maps/<room_id>/...
create policy "maps_storage_select_members" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'maps' and
    public.is_room_member((storage.foldername(name))[1]::uuid)
  );

-- Only DM can upload objects into maps/<room_id>/...
create policy "maps_storage_insert_dm" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'maps' and
    public.is_room_dm((storage.foldername(name))[1]::uuid)
  );

-- Only DM can delete objects from maps/<room_id>/...
create policy "maps_storage_delete_dm" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'maps' and
    public.is_room_dm((storage.foldername(name))[1]::uuid)
  );

