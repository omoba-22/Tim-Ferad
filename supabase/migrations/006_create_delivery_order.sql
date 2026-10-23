-- The sender email is now required: the order summary is sent to it.
alter table delivery_orders alter column sender_email set not null;

create or replace function create_delivery_order(
  p_reference text,
  p_sender_name text,
  p_sender_phone text,
  p_sender_email text,
  p_recipient_name text,
  p_recipient_phone text,
  p_pickup_address text,
  p_delivery_address text,
  p_package_description text,
  p_instructions text,
  p_idempotency_key text,
  p_access_token_hash text
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_order delivery_orders%rowtype;
  v_company_email text;
begin
  -- Same key again (double click, retry): return the existing order
  select * into v_order from delivery_orders where idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('reference', v_order.reference, 'created', false);
  end if;

  begin
    insert into delivery_orders (
      reference, sender_name, sender_phone, sender_email, recipient_name, recipient_phone,
      pickup_address, delivery_address, package_description, instructions,
      idempotency_key, access_token_hash
    ) values (
      p_reference, p_sender_name, p_sender_phone, p_sender_email, p_recipient_name, p_recipient_phone,
      p_pickup_address, p_delivery_address, p_package_description, p_instructions,
      p_idempotency_key, p_access_token_hash
    ) returning * into v_order;
  exception when unique_violation then
    -- Two identical requests at the same moment: the other one won
    select * into v_order from delivery_orders where idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object('reference', v_order.reference, 'created', false);
    end if;
    raise;
  end;

  -- Queued in the same step as the order, so one cannot exist without the other
  insert into notifications (type, recipient_email, delivery_order_id, dedupe_key)
  values ('delivery_customer', v_order.sender_email, v_order.id, 'delivery_customer:' || v_order.id);

  select value #>> '{}' into v_company_email
  from app_settings where key = 'company_notification_email';

  if v_company_email is not null and v_company_email <> '' then
    insert into notifications (type, recipient_email, delivery_order_id, dedupe_key)
    values ('delivery_company', v_company_email, v_order.id, 'delivery_company:' || v_order.id);
  end if;

  return jsonb_build_object('reference', v_order.reference, 'created', true);
end;
$$;

-- Only our backend may call this, never a browser using the public key
revoke all on function create_delivery_order(text, text, text, text, text, text, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function create_delivery_order(text, text, text, text, text, text, text, text, text, text, text, text)
  to service_role;