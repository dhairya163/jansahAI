import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { config } from '../config.js';

/** Server-only Supabase client (secret key). Storage + Realtime REST broadcast.
 *  (ws transport supplied for Node 20; realtime broadcasts go over REST anyway.) */
export const supabaseAdmin = createClient(config.supabaseUrl, config.supabaseSecretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  realtime: { transport: WebSocket as any },
});

export async function uploadArtifactPdf(storagePath: string, pdf: Buffer): Promise<void> {
  const { error } = await supabaseAdmin.storage
    .from(config.artifactsBucket)
    .upload(storagePath, pdf, { contentType: 'application/pdf', upsert: true });
  if (error) throw new Error(`storage upload failed: ${error.message}`);
}

export async function signedArtifactUrl(storagePath: string, expiresInSeconds = 60): Promise<string> {
  const { data, error } = await supabaseAdmin.storage
    .from(config.artifactsBucket)
    .createSignedUrl(storagePath, expiresInSeconds);
  if (error || !data) throw new Error(`signed url failed: ${error?.message}`);
  return data.signedUrl;
}

export async function downloadArtifactPdf(storagePath: string): Promise<Buffer> {
  const { data, error } = await supabaseAdmin.storage.from(config.artifactsBucket).download(storagePath);
  if (error || !data) throw new Error(`storage download failed: ${error?.message}`);
  return Buffer.from(await data.arrayBuffer());
}

/** Fire-and-forget realtime broadcast over the REST endpoint (no websocket needed server-side). */
export async function broadcast(topic: string, event: string, payload: unknown): Promise<void> {
  try {
    await fetch(`${config.supabaseUrl}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: config.supabaseSecretKey,
        Authorization: `Bearer ${config.supabaseSecretKey}`,
      },
      body: JSON.stringify({ messages: [{ topic, event, payload, private: false }] }),
    });
  } catch (err) {
    console.warn(`[broadcast] ${topic}/${event} failed:`, (err as Error).message);
  }
}
