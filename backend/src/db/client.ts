import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from '../config.js';
import * as schema from './schema.js';

// Session pooler (port 5432) supports prepared statements; keep pool small.
export const sql = postgres(config.databaseUrl, { max: 5, idle_timeout: 30 });
export const db = drizzle(sql, { schema });
