create or replace function create_trip(
  p_actor_id uuid,
  p_route_id uuid,
  p_vehicle_id uuid,
  p_departure_at timestamptz,
  p_fare_kobo bigint,
  p_departure_point text
) returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_capacity integer;
  v_trip trips%rowtype;
begin
  if not exists (select 1 from routes where id = p_route_id and is_active) then
    raise exception 'route_not_available';
  end if;

  select passenger_capacity into v_capacity from vehicles where id = p_vehicle_id and is_active;
  if v_capacity is null then raise exception 'vehicle_not_available'; end if;

  if p_departure_at <= now() then raise exception 'departure_in_past'; end if;

  -- A second trip for the same vehicle and time fails with a unique violation (23505)
  insert into trips (route_id, vehicle_id, departure_at, capacity, fare_kobo, departure_point, status)
  values (p_route_id, p_vehicle_id, p_departure_at, v_capacity, p_fare_kobo, p_departure_point, 'published')
  returning * into v_trip;

  insert into audit_events (actor_id, action, entity_type, entity_id, after_data)
  values (p_actor_id, 'trip.create', 'trip', v_trip.id, to_jsonb(v_trip));

  return v_trip.id;
end;
$$;

create or replace function cancel_trip(p_trip_id uuid, p_actor_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_trip trips%rowtype;
begin
  select * into v_trip from trips where id = p_trip_id for update;
  if not found then raise exception 'trip_not_found'; end if;
  if v_trip.status = 'cancelled' then raise exception 'already_cancelled'; end if;
  if v_trip.status = 'completed' then raise exception 'trip_completed'; end if;

  -- Counts paid bookings and unexpired unpaid ones
  if trip_held_places(p_trip_id) > 0 then raise exception 'trip_has_bookings'; end if;

  update trips set status = 'cancelled' where id = p_trip_id;

  insert into audit_events (actor_id, action, entity_type, entity_id, before_data, after_data)
  values (p_actor_id, 'trip.cancel', 'trip', p_trip_id,
          jsonb_build_object('status', v_trip.status), jsonb_build_object('status', 'cancelled'));
end;
$$;

-- Only our backend may call these, never a browser using the public key
revoke all on function create_trip(uuid, uuid, uuid, timestamptz, bigint, text) from public, anon, authenticated;
grant execute on function create_trip(uuid, uuid, uuid, timestamptz, bigint, text) to service_role;
revoke all on function cancel_trip(uuid, uuid) from public, anon, authenticated;
grant execute on function cancel_trip(uuid, uuid) to service_role;