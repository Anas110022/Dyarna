import { supabase } from '@/src/lib/supabase';

export type ConversationSummary = {
  id: string;
  listingId: string;
  listingTitle: string;
  listingPhotoUrl: string | null;
  otherParticipant: { id: string; fullName: string | null; avatarUrl: string | null };
  lastMessageBody: string | null;
  lastMessageAt: string | null;
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
};

// Finds the real existing conversation for this (listing, buyer) pair, or
// creates a real one. owner_id is never sent here — the
// conversations_set_owner trigger derives it server-side from the
// listing's real owner. Returns a clear, dedicated error if the buyer is
// the listing's own owner, matching the real DB check constraint rather
// than only relying on the UI to hide the button.
export async function getOrCreateConversation(listingId: string, buyerId: string): Promise<{ conversationId: string | null; error: string | null }> {
  const { data: existing, error: existingError } = await supabase
    .from('conversations')
    .select('id')
    .eq('listing_id', listingId)
    .eq('buyer_id', buyerId)
    .maybeSingle();
  if (existingError) return { conversationId: null, error: existingError.message };
  if (existing) return { conversationId: existing.id, error: null };

  const { data: created, error: createError } = await supabase
    .from('conversations')
    .insert({ listing_id: listingId, buyer_id: buyerId })
    .select('id')
    .single();
  if (createError) {
    if (createError.message.toLowerCase().includes('conversations_no_self_chat')) {
      return { conversationId: null, error: 'cannot_message_self' };
    }
    return { conversationId: null, error: createError.message };
  }
  return { conversationId: created.id, error: null };
}

type ConversationRow = {
  id: string;
  listing_id: string;
  buyer_id: string;
  owner_id: string;
  listings: { title: string; listing_photos: { storage_path: string; sort_order: number }[] | null } | null;
  buyer: { id: string; full_name: string | null; avatar_url: string | null } | null;
  owner: { id: string; full_name: string | null; avatar_url: string | null } | null;
};

export async function fetchConversations(userId: string): Promise<{ data: ConversationSummary[]; error: string | null }> {
  const { data, error } = await supabase
    .from('conversations')
    .select(
      `id, listing_id, buyer_id, owner_id,
       listings ( title, listing_photos ( storage_path, sort_order ) ),
       buyer:profiles!conversations_buyer_id_fkey ( id, full_name, avatar_url ),
       owner:profiles!conversations_owner_id_fkey ( id, full_name, avatar_url )`
    )
    .or(`buyer_id.eq.${userId},owner_id.eq.${userId}`)
    .returns<ConversationRow[]>();

  if (error || !data) return { data: [], error: error?.message ?? null };

  const conversationIds = data.map((c) => c.id);
  const { data: recentMessages } = conversationIds.length
    ? await supabase
        .from('messages')
        .select('conversation_id, body, created_at')
        .in('conversation_id', conversationIds)
        .order('created_at', { ascending: false })
    : { data: [] as { conversation_id: string; body: string; created_at: string }[] };

  const lastMessageByConversation = new Map<string, { body: string; created_at: string }>();
  for (const m of recentMessages ?? []) {
    if (!lastMessageByConversation.has(m.conversation_id)) {
      lastMessageByConversation.set(m.conversation_id, { body: m.body, created_at: m.created_at });
    }
  }

  const items: ConversationSummary[] = data.map((row) => {
    const isBuyer = row.buyer_id === userId;
    const other = isBuyer ? row.owner : row.buyer;
    const cover = (row.listings?.listing_photos ?? []).slice().sort((a, b) => a.sort_order - b.sort_order)[0];
    const listingPhotoUrl = cover ? supabase.storage.from('listing-photos').getPublicUrl(cover.storage_path).data.publicUrl : null;
    const lastMessage = lastMessageByConversation.get(row.id);
    return {
      id: row.id,
      listingId: row.listing_id,
      listingTitle: row.listings?.title ?? '',
      listingPhotoUrl,
      otherParticipant: { id: other?.id ?? '', fullName: other?.full_name ?? null, avatarUrl: other?.avatar_url ?? null },
      lastMessageBody: lastMessage?.body ?? null,
      lastMessageAt: lastMessage?.created_at ?? null,
    };
  });

  items.sort((a, b) => {
    const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
    const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
    return bTime - aTime;
  });

  return { data: items, error: null };
}

export type ConversationHeader = {
  id: string;
  listingId: string;
  listingTitle: string;
  otherParticipant: { id: string; fullName: string | null; avatarUrl: string | null };
};

export async function fetchConversationHeader(
  conversationId: string,
  userId: string
): Promise<{ data: ConversationHeader | null; error: string | null }> {
  const { data, error } = await supabase
    .from('conversations')
    .select(
      `id, listing_id, buyer_id, owner_id,
       listings ( title ),
       buyer:profiles!conversations_buyer_id_fkey ( id, full_name, avatar_url ),
       owner:profiles!conversations_owner_id_fkey ( id, full_name, avatar_url )`
    )
    .eq('id', conversationId)
    .maybeSingle()
    .returns<
      Omit<ConversationRow, 'listings'> & { listings: { title: string } | null }
    >();

  if (error || !data) return { data: null, error: error?.message ?? 'not_found' };

  const isBuyer = data.buyer_id === userId;
  const other = isBuyer ? data.owner : data.buyer;

  return {
    data: {
      id: data.id,
      listingId: data.listing_id,
      listingTitle: data.listings?.title ?? '',
      otherParticipant: { id: other?.id ?? '', fullName: other?.full_name ?? null, avatarUrl: other?.avatar_url ?? null },
    },
    error: null,
  };
}

// Capped to the most recent 100 messages — a real conversation today is
// short, but with no cap a very long-running one would ship its entire
// history to the client on every open. Fetched newest-first (so the cap
// keeps the RECENT messages, not the oldest) then reversed back to the
// real chronological order the UI expects.
export async function fetchMessages(conversationId: string): Promise<{ data: ChatMessage[]; error: string | null }> {
  const { data, error } = await supabase
    .from('messages')
    .select('id, conversation_id, sender_id, body, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error || !data) return { data: [], error: error?.message ?? null };

  return {
    data: data
      .slice()
      .reverse()
      .map((row) => ({
        id: row.id,
        conversationId: row.conversation_id,
        senderId: row.sender_id,
        body: row.body,
        createdAt: row.created_at,
      })),
    error: null,
  };
}

export async function sendMessage(conversationId: string, senderId: string, body: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('messages').insert({ conversation_id: conversationId, sender_id: senderId, body });
  return { error: error?.message ?? null };
}
