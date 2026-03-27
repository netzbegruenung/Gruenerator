import { type BundestagSourceConfig } from './types.js';

export const BASE_URL = 'https://www.gruene-bundestag.de';
export const COLLECTION_NAME = 'bundestag_content';
export const CRAWL_DELAY = 500;
export const REQUEST_TIMEOUT = 30000;
export const FETCH_CONCURRENCY = 5;

function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/é/g, 'e')
    .replace(/ć/g, 'c')
    .replace(/[.]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

const MDB_NAMES = [
  'Tarek Al-Wazir',
  'Dr. Alaa Alhamwi',
  'Luise Amtsberg',
  'Ayse Asar',
  'Andreas Audretsch',
  'Lisa Badum',
  'Felix Banaszak',
  'Karl Bär',
  'Katharina Beck',
  'Lukas Benner',
  'Dr. Franziska Brantner',
  'Victoria Broßart',
  'Agnieszka Brugger',
  'Dr. Janosch Dahmen',
  'Dr. Sandra Detzer',
  'Jeanne Dillschneider',
  'Katharina Dröge',
  'Deborah Düring',
  'Timon Dzienus',
  'Harald Ebner',
  'Leon Eckert',
  'Marcel Emmerich',
  'Simone Fischer',
  'Schahina Gambir',
  'Matthias Gastel',
  'Dr. Jan-Niclas Gesenhues',
  'Katrin Göring-Eckardt',
  'Prof. Dr. Armin Grau',
  'Dr. Lena Gumnior',
  'Britta Haßelmann',
  'Linda Heitmann',
  'Dr. Moritz Heuberger',
  'Dr. Anton Hofreiter',
  'Julian Joswig',
  'Lamya Kaddor',
  'Dr. Kirsten Kappert-Gonther',
  'Michael Kellner',
  'Misbah Khan',
  'Chantal Kopf',
  'Ricarda Lang',
  'Sven Lehmann',
  'Steffi Lemke',
  'Rebecca Lenhard',
  'Helge Limburg',
  'Denise Loop',
  'Dr. Andrea Lübcke',
  'Max Lucks',
  'Dr. Anna Lührmann',
  'Dr. Zoe Mayer',
  'Swantje Henrike Michaelsen',
  'Dr. Irene Mihalic',
  'Boris Mijatović',
  'Claudia Müller',
  'Sascha Müller',
  'Sara Nanni',
  'Dr. Ophelia Nick',
  'Dr. Konstantin von Notz',
  'Omid Nouripour',
  'Karoline Otte',
  'Lisa Paus',
  'Dr. med. Paula Piechotta',
  'Filiz Polat',
  'Dr. Anja Reinalter',
  'Sylvia Rietenberg',
  'Claudia Roth',
  'Corinna Rüffer',
  'Jamila Schäfer',
  'Dr. Sebastian Schäfer',
  'Ulle Schauws',
  'Stefan Schmidt',
  'Julia Schneider',
  'Marlene Schönberger',
  'Nyke Slawik',
  'Dr. Till Steffen',
  'Sandra Stein',
  'Hanna Steinmüller',
  'Kassem Taher Saleh',
  'Awet Tesfaiesus',
  'Katrin Uhlig',
  'Dr. Julia Verlinden',
  'Mayra Vriesema',
  'Niklas Wagener',
  'Robin Wagener',
  'Johannes Wagner',
  'Tina Winklmann',
];

export function getMdBDetailUrls(): string[] {
  return MDB_NAMES.map((name) => `${BASE_URL}/abgeordnete/details/${nameToSlug(name)}/`);
}

export const SITEMAP_URLS = [
  'https://www.gruene-bundestag.de/sitemap.xml?sitemap=pages&cHash=34a293d8e591b238162791ff016a8c08',
  'https://www.gruene-bundestag.de/sitemap.xml?page=1&sitemap=pages&cHash=7004a57c90a1da07d73efc49a9aacf90',
];

export const BUNDESTAG_SOURCES: BundestagSourceConfig[] = [
  {
    id: 'abgeordnete',
    name: 'MdB Profile',
    path: '/abgeordnete/details/',
    primaryCategory: 'Abgeordnete',
    maxDepth: 0,
    maxPages: 120,
    discovery: 'generated',
  },
  {
    id: 'fachtexte',
    name: 'Fachtexte',
    path: '/unsere-politik/fachtexte/',
    primaryCategory: 'Fachtexte',
    maxDepth: 0,
    maxPages: 1000,
    discovery: 'sitemap',
  },
  {
    id: 'einfach-erklaert',
    name: 'Einfach erklärt',
    path: '/unsere-politik/einfach-erklaert/',
    primaryCategory: 'Einfach erklärt',
    maxDepth: 0,
    maxPages: 500,
    discovery: 'sitemap',
  },
  {
    id: 'presse',
    name: 'Pressemitteilungen',
    path: '/presse/',
    primaryCategory: 'Presse',
    maxDepth: 0,
    maxPages: 2000,
    discovery: 'sitemap',
  },
];
