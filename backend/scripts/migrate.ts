import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { Pool } from 'pg';

import { config } from '../src/config.js';

if (!config.directDatabaseUrl) throw new Error('DIRECT_URL or Supabase pooler settings are required');

const pool = new Pool({ connectionString: config.directDatabaseUrl, ssl: { rejectUnauthorized: false }, max: 1 });
const directory = resolve('migrations');

try {
  const files = (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = await readFile(resolve(directory, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('commit');
      console.log(`Applied ${file}`);
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }
} finally {
  await pool.end();
}
