import { type ContentReportCreate, type ContentReportReason } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';

export const RATE_LIMIT_ERROR = 'Zu viele Meldungen, bitte versuch es später erneut.';
export const FALLBACK_ERROR = 'Die Meldung konnte nicht gesendet werden. Bitte versuche es erneut.';

export type ReportTarget = Pick<
  ContentReportCreate,
  'kind' | 'targetId' | 'groupId' | 'threadId' | 'excerpt'
>;

export async function submitReport(
  target: ReportTarget,
  reason: ContentReportReason,
  note: string
): Promise<'done' | typeof RATE_LIMIT_ERROR | typeof FALLBACK_ERROR> {
  try {
    const trimmed = note.trim();
    const result = await getContractsClient().contentReports.create({
      body: {
        ...target,
        reason,
        ...(trimmed ? { note: trimmed } : {}),
      },
    });
    if (result.status === 200) return 'done';
    // Server messages are English internals; never show them verbatim.
    return result.status === 429 ? RATE_LIMIT_ERROR : FALLBACK_ERROR;
  } catch {
    return FALLBACK_ERROR;
  }
}
