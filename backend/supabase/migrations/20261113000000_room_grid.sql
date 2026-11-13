alter table public.rooms
  add column grid_visible boolean not null default true,
  add column grid_cell_size integer not null default 50
    check (grid_cell_size between 20 and 150 and grid_cell_size % 5 = 0);

-- Keep rooms' other fields protected: only this guarded RPC can change the grid.
create function public.set_room_grid(
  p_room_id uuid,
  p_grid_visible boolean,
  p_grid_cell_size integer
)
returns table (id uuid, grid_visible boolean, grid_cell_size integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if public.is_room_dm(p_room_id) is not true then
    raise exception 'only the room DM can update the grid';
  end if;

  return query
  update public.rooms r
  set grid_visible = p_grid_visible, grid_cell_size = p_grid_cell_size
  where r.id = p_room_id
  returning r.id, r.grid_visible, r.grid_cell_size;
end;
$$;

revoke all on function public.set_room_grid(uuid, boolean, integer) from public;
grant execute on function public.set_room_grid(uuid, boolean, integer) to authenticated;
