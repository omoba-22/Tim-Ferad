create or replace function update_delivery_status(p_order_id uuid, p_status text, p_actor_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_order delivery_orders%rowtype;
begin
  select * into v_order from delivery_orders where id = p_order_id for update;
  if not found then raise exception 'order_not_found'; end if;
  if v_order.status in ('delivered', 'cancelled') then raise exception 'order_closed'; end if;
  if v_order.status = p_status then raise exception 'no_change'; end if;

  update delivery_orders set status = p_status where id = p_order_id;

  insert into audit_events (actor_id, action, entity_type, entity_id, before_data, after_data)
  values (p_actor_id, 'delivery.status', 'delivery_order', p_order_id,
          jsonb_build_object('status', v_order.status), jsonb_build_object('status', p_status));
end;
$$;

revoke all on function update_delivery_status(uuid, text, uuid) from public, anon, authenticated;
grant execute on function update_delivery_status(uuid, text, uuid) to service_role;