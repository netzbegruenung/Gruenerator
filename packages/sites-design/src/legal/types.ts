export type LegalBlock =
  | { kind: 'text'; text: string }
  | { kind: 'address'; lines: 'full' | 'name-and-city' }
  | { kind: 'contact' }
  | { kind: 'pending'; note: string };

export interface LegalSection {
  heading: string;
  blocks: readonly LegalBlock[];
}

export interface LegalTemplate {
  status: 'draft' | 'approved';
  title: string;
  sections: readonly LegalSection[];
}

export type LegalDocumentKind = 'impressum' | 'datenschutz';

export const LEGAL_DRAFT_NOTICE = 'Entwurf: Dieser Text ist noch nicht rechtlich geprüft.';
