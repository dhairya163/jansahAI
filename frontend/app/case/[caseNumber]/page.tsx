import { CaseClient } from './case-client';

export default async function CasePage({ params }: { params: Promise<{ caseNumber: string }> }) {
  const { caseNumber } = await params;
  return <main className="min-h-screen bg-[var(--paper-1)]"><CaseClient caseNumber={caseNumber} /></main>;
}
