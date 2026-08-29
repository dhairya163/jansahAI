import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { artifacts, type ArtifactRow, type CaseRow } from '../db/schema.js';
import { uploadArtifactPdf, broadcast } from '../lib/supabase.js';
import { registerFonts } from './fonts.js';
import { buildArtifactData } from './data.js';
import { ComplaintPdf } from './templates/complaint.js';
import { BankNoticePdf } from './templates/bankNotice.js';
import { FirPackPdf, SpLetterPdf, MagistrateDraftPdf } from './templates/firPack.js';
import { TakedownLetterPdf, CertinEmailPdf, GacNotePdf, RestorationRequestPdf } from './templates/letters.js';
import type { ArtifactKind } from '../engine/playbooks.js';
import { addEvent } from '../engine/events.js';

export const ARTIFACT_LABELS: Record<ArtifactKind, { en: string; hi: string }> = {
  complaint_pdf: { en: 'Complaint PDF', hi: 'शिकायत PDF' },
  bank_notice: { en: 'Bank dispute notice', hi: 'बैंक विवाद नोटिस' },
  fir_pack: { en: 'FIR application pack', hi: 'FIR आवेदन पैक' },
  sp_letter: { en: 'SP escalation letter', hi: 'SP को पत्र' },
  magistrate_draft: { en: 'Magistrate application (draft)', hi: 'मजिस्ट्रेट आवेदन (मसौदा)' },
  takedown_letter: { en: 'Platform takedown letter', hi: 'Takedown पत्र' },
  certin_email: { en: 'CERT-In incident email', hi: 'CERT-In ईमेल' },
  gac_note: { en: 'GAC appeal note', hi: 'GAC अपील नोट' },
  restoration_request: { en: 'Money-restoration request', hi: 'धन-वापसी अनुरोध' },
};

/**
 * Generate an artifact PDF for a case. Idempotent by (case, kind) — §20.
 * Returns the artifact row (existing or new).
 */
export async function generateArtifact(c: CaseRow, kind: ArtifactKind): Promise<ArtifactRow> {
  const [existing] = await db.select().from(artifacts)
    .where(and(eq(artifacts.caseId, c.id), eq(artifacts.kind, kind)));
  if (existing) return existing;

  registerFonts();
  const d = await buildArtifactData(c);

  const el = ((): React.ReactElement => {
    switch (kind) {
      case 'complaint_pdf': return React.createElement(ComplaintPdf, { d });
      case 'bank_notice': return React.createElement(BankNoticePdf, { d });
      case 'fir_pack': return React.createElement(FirPackPdf, { d });
      case 'sp_letter': return React.createElement(SpLetterPdf, { d });
      case 'magistrate_draft': return React.createElement(MagistrateDraftPdf, { d });
      case 'takedown_letter': return React.createElement(TakedownLetterPdf, { d });
      case 'certin_email': return React.createElement(CertinEmailPdf, { d });
      case 'gac_note': return React.createElement(GacNotePdf, { d });
      case 'restoration_request': return React.createElement(RestorationRequestPdf, { d });
    }
  })();

  const buf = await renderToBuffer(el as React.ReactElement<import('@react-pdf/renderer').DocumentProps>);
  const storagePath = `cases/${c.id}/${kind}-v1.pdf`;
  await uploadArtifactPdf(storagePath, buf);

  const meta: Record<string, unknown> = {
    label_en: ARTIFACT_LABELS[kind].en,
    label_hi: ARTIFACT_LABELS[kind].hi,
    bytes: buf.length,
  };
  if (kind === 'certin_email') meta.body_text = d.certinBody;
  if (kind === 'takedown_letter') meta.platforms = d.platforms;
  if (d.narrativeEn) meta.narrative_en = d.narrativeEn;

  const [row] = await db.insert(artifacts).values({ caseId: c.id, kind, storagePath, meta }).returning();

  await addEvent(c.id, 'artifact_generated', 'system', {
    kind, artifact_id: row.id,
    label_en: ARTIFACT_LABELS[kind].en, label_hi: ARTIFACT_LABELS[kind].hi,
  });
  void broadcast(`case:${c.id}`, 'artifact_added', { id: row.id, kind });
  return row;
}
