import { type ContentReportReason } from '@gruenerator/contracts';

/** Display order of the reasons; the record keeps the labels exhaustive over the contract enum. */
export const CONTENT_REPORT_REASON_LABELS: Record<ContentReportReason, string> = {
  offensive: 'Beleidigend oder hasserfüllt',
  false_information: 'Falschinformation',
  harassment: 'Belästigung',
  illegal: 'Rechtswidrig',
  other: 'Sonstiges',
};

export const CONTENT_REPORT_REASONS = Object.keys(
  CONTENT_REPORT_REASON_LABELS
) as ContentReportReason[];
