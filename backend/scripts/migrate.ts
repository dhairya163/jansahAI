import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { config } from '../src/config.js';
import { supabaseAdmin } from '../src/lib/supabase.js';

const dir = path.dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const ddl = readFileSync(path.join(dir, '..', 'drizzle', '0000_init.sql'), 'utf8');
  const sql = postgres(config.databaseUrl, { max: 1 });
  console.log('Running DDL (§15, idempotent)…');
  await sql.unsafe(ddl);
  await sql.end();
  console.log('DDL applied.');

  console.log(`Ensuring private storage bucket "${config.artifactsBucket}"…`);
  const { data: buckets } = await supabaseAdmin.storage.listBuckets();
  if (!buckets?.some((b) => b.name === config.artifactsBucket)) {
    const { error } = await supabaseAdmin.storage.createBucket(config.artifactsBucket, { public: false });
    if (error) throw new Error(`createBucket: ${error.message}`);
    console.log('Bucket created.');
  } else {
    console.log('Bucket exists.');
  }
  console.log('Migration complete.');
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
