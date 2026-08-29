import { eq } from 'drizzle-orm';
import { writeFileSync } from 'node:fs';
import { db, sql } from '../src/db/client.js';
import { artifacts, cases } from '../src/db/schema.js';
import { downloadArtifactPdf } from '../src/lib/supabase.js';

const dir = process.argv[2] ?? '.';
const rows = await db.select({ kind: artifacts.kind, path: artifacts.storagePath, slots: cases.slots })
  .from(artifacts).innerJoin(cases, eq(cases.id, artifacts.caseId));
const wants: [string, string][] = [
  ['sunita_day0', 'complaint_pdf'], ['ravi_day15', 'fir_pack'], ['ravi_day15', 'bank_notice'],
  ['anon_ncii_day15', 'takedown_letter'], ['ravi_day15', 'restoration_request'],
];
for (const [persona, kind] of wants) {
  const r = rows.find((r) => (r.slots as Record<string, unknown>)?.demo_persona === persona && r.kind === kind);
  if (r) {
    writeFileSync(`${dir}/${persona}-${kind}.pdf`, await downloadArtifactPdf(r.path));
    console.log('saved', persona, kind);
  } else console.log('MISSING', persona, kind);
}
await sql.end();
process.exit(0);
