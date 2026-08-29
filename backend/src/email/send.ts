import React from 'react';
import { render } from '@react-email/render';
import { Resend } from 'resend';
import { and, eq, inArray } from 'drizzle-orm';
import { config } from '../config.js';
import { db } from '../db/client.js';
import { artifacts, emails, type CaseRow } from '../db/schema.js';
import { downloadArtifactPdf } from '../lib/supabase.js';
import { addEvent } from '../engine/events.js';
import { categoryLabel, statusLabel } from '../engine/labels.js';
import { getPlaybook } from '../engine/playbooks.js';
import { getGuidanceList } from '../engine/guidance/index.js';
import { formatINR } from '../lib/normalize.js';
import { daysBetween } from '../lib/virtualTime.js';
import { virtualNow } from '../lib/virtualTime.js';
import {
  AckEmail, StatusEmail, NudgeEmail, EscalationEmail, RestorationEmail, type CommonProps,
} from './templates.js';
import type { EmailTemplate } from '../engine/playbooks.js';

const resend = config.resendApiKey ? new Resend(config.resendApiKey) : null;

interface SendOpts {
  statusLine?: { en: string; hi: string };
  amountHeld?: number;
  escalationLevel?: 'SP' | 'Magistrate';
}

const ATTACH_BY_TEMPLATE: Record<EmailTemplate, string[]> = {
  ack: ['complaint_pdf', 'bank_notice'],
  status: [],
  nudge: ['fir_pack'],
  escalation: ['sp_letter', 'magistrate_draft'],
  restoration: ['restoration_request'],
};

/**
 * §22 — send a templated email to the complainant only (+ ops BCC). House rule (ADR-6):
 * NEVER to any authority/bank/platform. Skips silently (with event) when no address.
 */
export async function sendCaseEmail(c: CaseRow, template: EmailTemplate, opts: SendOpts = {}): Promise<void> {
  if (!c.email) {
    await addEvent(c.id, 'email_skipped_no_address', 'system', { template });
    return;
  }

  const cat = categoryLabel(c.category);
  const trackUrl = `${config.appBaseUrl}/track?case=${c.caseNumber}`;
  const common: CommonProps = {
    caseNumber: c.caseNumber, categoryEn: cat.en, categoryHi: cat.hi, trackUrl,
  };
  const vNow = virtualNow(c.timeOffsetDays);
  const daysSince = c.registeredAt ? Math.max(0, daysBetween(c.registeredAt, vNow)) : 0;

  let subject = '';
  let el: React.ReactElement;
  switch (template) {
    case 'ack': {
      const pb = getPlaybook(c.category);
      const guidance = getGuidanceList(pb?.guidance ?? []).map((g) => ({
        titleEn: g.en.title, bodyEn: g.en.body, titleHi: g.hi.title, bodyHi: g.hi.body,
      }));
      subject = `Complaint ${c.caseNumber} registered — documents attached`;
      el = React.createElement(AckEmail, { ...common, guidance, financial: c.track === 'financial' });
      break;
    }
    case 'status': {
      const sl = statusLabel(c.status);
      subject = `Update on case ${c.caseNumber}: ${sl.en}`;
      el = React.createElement(StatusEmail, {
        ...common, statusEn: sl.en, statusHi: sl.hi,
        lineEn: opts.statusLine?.en ?? `Your case status is now: ${sl.en}.`,
        lineHi: opts.statusLine?.hi ?? `आपके केस की स्थिति अब: ${sl.hi}।`,
      });
      break;
    }
    case 'nudge':
      subject = `Case ${c.caseNumber}: no FIR yet — your police application is ready`;
      el = React.createElement(NudgeEmail, { ...common, daysSince });
      break;
    case 'escalation': {
      const level = opts.escalationLevel ?? 'SP';
      subject = `Case ${c.caseNumber}: escalation letter ready (${level})`;
      el = React.createElement(EscalationEmail, { ...common, level });
      break;
    }
    case 'restoration': {
      const held = formatINR(opts.amountHeld ?? Number(c.amountHeld ?? 0));
      subject = `Good news on ${c.caseNumber}: ${held} is on hold`;
      el = React.createElement(RestorationEmail, { ...common, amountHeld: held });
      break;
    }
  }

  const [row] = await db.insert(emails).values({
    caseId: c.id, toAddr: c.email, template, subject, status: 'queued',
    payload: { daysSince, escalationLevel: opts.escalationLevel ?? null },
  }).returning();

  try {
    const html = await render(el);

    // attach the case's artifacts relevant to this template (drafts for the citizen to sign)
    const wantKinds = ATTACH_BY_TEMPLATE[template].filter((k) =>
      template !== 'escalation' || (opts.escalationLevel === 'Magistrate' ? k === 'magistrate_draft' : k === 'sp_letter'));
    const rows = wantKinds.length > 0
      ? await db.select().from(artifacts).where(and(eq(artifacts.caseId, c.id), inArray(artifacts.kind, wantKinds)))
      : [];
    const attachments = await Promise.all(rows.map(async (a) => ({
      filename: `${a.kind}-${c.caseNumber}.pdf`,
      content: (await downloadArtifactPdf(a.storagePath)).toString('base64'),
    })));

    if (!resend) throw new Error('RESEND_API_KEY not configured');
    const { data, error } = await resend.emails.send({
      from: config.mailFrom,
      to: [c.email],
      ...(config.opsBccEmail ? { bcc: [config.opsBccEmail] } : {}),
      ...(config.mailReplyTo ? { replyTo: config.mailReplyTo } : {}),
      subject,
      html,
      attachments,
    });
    if (error) throw new Error(error.message);

    await db.update(emails).set({ status: 'sent', sentAt: new Date(), payload: { resend_id: data?.id ?? null } })
      .where(eq(emails.id, row.id));
    await addEvent(c.id, 'email_sent', 'system', { template, to: c.email, subject });
  } catch (err) {
    console.warn(`[email] ${template} to ${c.email} failed:`, (err as Error).message);
    await db.update(emails).set({ status: 'failed', payload: { error: (err as Error).message } })
      .where(eq(emails.id, row.id));
  }
}
