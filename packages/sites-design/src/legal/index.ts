import { type SupportedLocale } from '@gruenerator/contracts';

import { datenschutzAt, impressumAt } from './at.js';
import { datenschutzDe, impressumDe } from './de.js';
import { type LegalDocumentKind, type LegalTemplate } from './types.js';

export { datenschutzAt, impressumAt, datenschutzDe, impressumDe };
export * from './types.js';

export function legalTemplate(locale: SupportedLocale, document: LegalDocumentKind): LegalTemplate {
  if (locale === 'de-AT') return document === 'impressum' ? impressumAt : datenschutzAt;
  return document === 'impressum' ? impressumDe : datenschutzDe;
}
