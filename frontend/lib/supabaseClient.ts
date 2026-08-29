'use client';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_KEY;
  if (!url || !key) return null;
  if (!client) client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

/** Subscribe to a broadcast topic; returns unsubscribe. Polling remains the fallback everywhere. */
export function subscribeTopic(topic: string, onEvent: (event: string, payload: unknown) => void): () => void {
  const supabase = getSupabase();
  if (!supabase) return () => undefined;
  const channel = supabase.channel(topic)
    .on('broadcast', { event: '*' }, (msg) => onEvent(msg.event, msg.payload))
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}
