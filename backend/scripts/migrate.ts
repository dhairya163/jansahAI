import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { config } from '../src/config.js';
import { supabaseAdmin } from '../src/lib/supabase.js';

const dir = path.dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const sql = postgres(config.databaseUrl, { max: 1 });
  for (const file of ['0000_init.sql', '0001_v2.sql']) {
    console.log(`Running ${file} (idempotent)…`);
    await sql.unsafe(readFileSync(path.join(dir, '..', 'drizzle', file), 'utf8'));
  }
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
