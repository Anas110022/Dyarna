-- Dyarna: real notification when a user receives a new chat message.
--
-- Follows the exact same trust pattern already used for
-- publish_listing_if_eligible (20260903040000_account_features.sql): the
-- client never inserts into notifications directly (no insert policy exists
-- for authenticated users, and none is added here); a SECURITY DEFINER
-- trigger reacting to a real event (a message actually being inserted)
-- creates the row, deriving the recipient and sender name server-side so
-- neither can be spoofed by the client.
--
-- Purely additive: no existing table, RLS policy, or trigger is removed.
-- Run this after 20260905000000_favorites.sql.

alter table public.notifications
  add column if not exists related_conversation_id uuid references public.conversations (id) on delete cascade;

create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_buyer uuid;
  v_owner uuid;
  v_recipient uuid;
  v_sender_name text;
  v_body text;
begin
  select buyer_id, owner_id into v_buyer, v_owner
  from public.conversations
  where id = new.conversation_id;

  if v_buyer is null then
    return new;
  end if;

  -- The recipient is always "the other participant" — never the sender,
  -- so a user is never notified about their own message.
  v_recipient := case when new.sender_id = v_buyer then v_owner else v_buyer end;

  select coalesce(full_name, 'مستخدم') into v_sender_name
  from public.profiles
  where id = new.sender_id;

  v_body := new.body;
  if char_length(v_body) > 200 then
    v_body := left(v_body, 200) || '…';
  end if;

  insert into public.notifications (user_id, type, title, body, related_conversation_id)
  values (
    v_recipient,
    'new_message',
    format('رسالة جديدة من %s', v_sender_name),
    v_body,
    new.conversation_id
  );

  return new;
end;
$$;

create trigger messages_notify_new_message
after insert on public.messages
for each row execute procedure public.notify_new_message();
