import { Resend } from 'resend';

import { config } from '../config.js';
import type { CaseRecord, EmailRecord } from '../domain/types.js';
import { categoryLabels } from '../engine/playbooks.js';
import { id } from '../lib/ids.js';
import { repository } from '../db/repository.js';

const subjectFor = (template: string, record: CaseRecord) => {
  if (template === 'ack') return `Complaint ${record.caseNumber} registered — documents ready`;
  if (template === 'nudge') return `Case ${record.caseNumber}: your next-step document is ready`;
  if (template === 'escalation') return `Case ${record.caseNumber}: escalation letter ready`;
  if (template === 'restoration') return `Good news on ${record.caseNumber}: funds are shown on hold`;
  return `Update on case ${record.caseNumber}: ${record.status.replaceAll('_', ' ')}`;
};

export async function sendCaseEmail(record: CaseRecord, template: string) {
  if (!record.email) {
    const skipped: EmailRecord = { id: id(), caseId: record.id, toAddr: 'not-provided', template, subject: subjectFor(template, record), status: 'skipped', payload: { reason: 'email_skipped_no_address' }, createdAt: new Date().toISOString() };
    await repository.addEmail(skipped);
    return skipped;
  }

  const subject = subjectFor(template, record);
  const heading = template === 'ack' ? 'Your complaint is registered' : template === 'nudge' ? 'Your next step is ready' : 'There is an update on your case';
  const html = `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#2c2430"><div style="background:#28152e;color:white;padding:14px 22px">SahAI · Independent prototype</div><div style="padding:28px 22px"><h1 style="font-size:24px">${heading}</h1><p>Case <b>${record.caseNumber}</b> · ${categoryLabels[record.category] ?? record.category}</p><p>Status: <b>${record.status.replaceAll('_', ' ')}</b></p><p>Your documents and next steps are available on your case page.</p><p><a href="${config.appBaseUrl}/case/${record.caseNumber}">Open case</a></p><p style="margin-top:28px;color:#756a72;font-size:12px">Independent hackathon prototype. Not a government service. Demo data only.<br/>स्वतंत्र हैकाथॉन प्रोटोटाइप · सरकारी सेवा नहीं।</p></div></div>`;
  const email: EmailRecord = { id: id(), caseId: record.id, toAddr: record.email, template, subject, status: config.resendApiKey ? 'queued' : 'skipped', payload: { provider: config.resendApiKey ? 'resend' : 'demo' }, createdAt: new Date().toISOString() };

  if (config.resendApiKey) {
    try {
      const resend = new Resend(config.resendApiKey);
      await resend.emails.send({ from: config.mailFrom, to: record.email, bcc: config.opsEmail, replyTo: config.mailReplyTo, subject, html });
      email.status = 'sent'; email.sentAt = new Date().toISOString();
    } catch (error) {
      email.status = 'failed'; email.payload = { error: error instanceof Error ? error.message : 'Unknown email error' };
    }
  } else {
    email.payload = { reason: 'RESEND_API_KEY not configured; email recorded in demo outbox' };
  }
  await repository.addEmail(email);
  return email;
}
