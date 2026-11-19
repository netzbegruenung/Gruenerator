import { SECTION_LABELS, type EditorPanel, type SectionType } from '../stores/editorStore';

const HERO_PATHS = new Set(['site_title', 'tagline', 'profile_image']);
const CONTACT_PATHS = new Set(['contact_email', 'contact_phone']);

const isSectionId = (id: string): id is SectionType => id in SECTION_LABELS;

export function panelForPath(path: string): EditorPanel | null {
  const [head, second] = path.split('.');
  if (head === undefined) return null;
  if (HERO_PATHS.has(path) || head === 'social_links') return 'hero';
  if (CONTACT_PATHS.has(path)) return 'contact';
  if (head === 'legal') return 'legal';
  if (head === 'sections' && second !== undefined && isSectionId(second)) return second;
  return null;
}

const LEAF_LABELS: Record<string, string> = {
  site_title: 'Name',
  tagline: 'Tagline',
  profile_image: 'Profilbild',
  social_links: 'Soziale Netzwerke',
  contact_email: 'E-Mail',
  contact_phone: 'Telefon',
  title: 'Titel',
  content: 'Inhalt',
  subtitle: 'Untertitel',
  imageUrl: 'Bild',
  text: 'Button-Text',
  link: 'Link',
  instagramUsername: 'Instagram-Benutzername',
};

const LEGAL_LABELS: Record<string, string> = {
  name: 'Name',
  street: 'Straße',
  postal_code: 'Postleitzahl',
  city: 'Ort',
  email: 'E-Mail',
  phone: 'Telefon',
};

export function fieldLabel(path: string): string {
  const parts = path.split('.');
  if (parts[0] === 'legal' && parts[1] !== undefined) {
    return `Impressum: ${LEGAL_LABELS[parts[1]] ?? parts[1]}`;
  }
  if (parts[0] === 'sections' && parts[1] !== undefined && isSectionId(parts[1])) {
    const section = SECTION_LABELS[parts[1]];
    const [first, second] = parts.slice(2);
    const index = first !== undefined && /^\d+$/.test(first) ? Number(first) + 1 : null;
    const leaf = index === null ? first : second;
    const leafLabel = leaf === undefined ? null : (LEAF_LABELS[leaf] ?? null);
    const head = index === null ? section : `${section} ${index}`;
    return leafLabel ? `${head}: ${leafLabel}` : head;
  }
  if (parts[0] === 'social_links' && parts[1] !== undefined) return `Netzwerk: ${parts[1]}`;
  return LEAF_LABELS[path] ?? path;
}
