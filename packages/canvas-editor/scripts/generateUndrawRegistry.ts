/**
 * Generates undrawAll.ts from the SVG files in apps/web/public/illustrations/undraw/
 *
 * Preserves the 62 curated UNDRAW_FEATURED entries (matched by filename) with their
 * German names, tags, and categories. Auto-generates entries for the remaining ~1,546 files.
 *
 * Usage: pnpm tsx packages/canvas-editor/scripts/generateUndrawRegistry.ts
 */

import fs from 'node:fs';
import path from 'node:path';

const UNDRAW_DIR = path.resolve('apps/web/public/illustrations/undraw');
const OUTPUT_FILE = path.resolve('packages/canvas-editor/src/utils/illustrations/undrawAll.ts');

// Existing curated entries keyed by filename for fast lookup
const CURATED: Record<string, { id: string; name: string; tags: string[]; category: string }> = {
  'voting_3ygx.svg': {
    id: 'ud-voting',
    name: 'Abstimmung',
    tags: ['wahl', 'abstimmung', 'demokratie', 'politik'],
    category: 'Politik',
  },
  'election-day_puwv.svg': {
    id: 'ud-election-day',
    name: 'Wahltag',
    tags: ['wahl', 'politik', 'demokratie'],
    category: 'Politik',
  },
  'public-discussion_693m.svg': {
    id: 'ud-public-discussion',
    name: 'Öffentliche Diskussion',
    tags: ['diskussion', 'debatte', 'dialog', 'politik'],
    category: 'Politik',
  },
  'team-spirit_18vw.svg': {
    id: 'ud-team-spirit',
    name: 'Teamgeist',
    tags: ['team', 'zusammenarbeit', 'gemeinschaft', 'gruppe'],
    category: 'Gemeinschaft',
  },
  'online-community_3o0l.svg': {
    id: 'ud-community',
    name: 'Gemeinschaft',
    tags: ['gemeinschaft', 'zusammen', 'netzwerk', 'gruppe'],
    category: 'Gemeinschaft',
  },
  'neighbors_z879.svg': {
    id: 'ud-neighbors',
    name: 'Nachbarn',
    tags: ['nachbarn', 'gemeinschaft', 'quartier', 'zusammenleben'],
    category: 'Gemeinschaft',
  },
  'eco-conscious_oqny.svg': {
    id: 'ud-eco-conscious',
    name: 'Umweltbewusst',
    tags: ['umwelt', 'nachhaltigkeit', 'grün', 'ökologie'],
    category: 'Umwelt',
  },
  'environment_9luj.svg': {
    id: 'ud-environment',
    name: 'Umwelt',
    tags: ['umwelt', 'natur', 'klima', 'schutz'],
    category: 'Umwelt',
  },
  'wind-turbine_4z2a.svg': {
    id: 'ud-wind-turbine',
    name: 'Windkraft',
    tags: ['wind', 'energie', 'erneuerbar', 'nachhaltigkeit'],
    category: 'Umwelt',
  },
  'electric-car_vlgq.svg': {
    id: 'ud-electric-car',
    name: 'Elektroauto',
    tags: ['elektro', 'auto', 'mobilität', 'umwelt'],
    category: 'Umwelt',
  },
  'nature_yf30.svg': {
    id: 'ud-nature',
    name: 'Natur',
    tags: ['natur', 'grün', 'pflanzen', 'umwelt'],
    category: 'Umwelt',
  },
  'gardening_3tyw.svg': {
    id: 'ud-gardening',
    name: 'Gärtnern',
    tags: ['garten', 'pflanzen', 'natur', 'hobby'],
    category: 'Umwelt',
  },
  'watering-plants_64af.svg': {
    id: 'ud-watering-plants',
    name: 'Pflanzen gießen',
    tags: ['pflanzen', 'gießen', 'natur', 'garten'],
    category: 'Umwelt',
  },
  'education_3vwh.svg': {
    id: 'ud-education',
    name: 'Bildung',
    tags: ['bildung', 'schule', 'lernen', 'wissen'],
    category: 'Bildung',
  },
  'teacher_s628.svg': {
    id: 'ud-teacher',
    name: 'Lehrer',
    tags: ['lehrer', 'unterricht', 'schule', 'bildung'],
    category: 'Bildung',
  },
  'graduation_u7uc.svg': {
    id: 'ud-graduation',
    name: 'Abschluss',
    tags: ['abschluss', 'studium', 'erfolg', 'uni'],
    category: 'Bildung',
  },
  'book-lover_m9n3.svg': {
    id: 'ud-book-lover',
    name: 'Buchliebhaber',
    tags: ['buch', 'lesen', 'wissen', 'bibliothek'],
    category: 'Bildung',
  },
  'learning_qt7d.svg': {
    id: 'ud-learning',
    name: 'Lernen',
    tags: ['lernen', 'bildung', 'wissen', 'entwicklung'],
    category: 'Bildung',
  },
  'healthy-lifestyle_8zpg.svg': {
    id: 'ud-healthy-lifestyle',
    name: 'Gesunder Lebensstil',
    tags: ['gesundheit', 'lifestyle', 'wohlbefinden', 'fitness'],
    category: 'Gesundheit',
  },
  'medical-care_7m9g.svg': {
    id: 'ud-medical-care',
    name: 'Medizinische Versorgung',
    tags: ['medizin', 'gesundheit', 'pflege', 'arzt'],
    category: 'Gesundheit',
  },
  'doctors_djoj.svg': {
    id: 'ud-doctors',
    name: 'Ärzte',
    tags: ['arzt', 'ärztin', 'medizin', 'gesundheit'],
    category: 'Gesundheit',
  },
  'yoga_i399.svg': {
    id: 'ud-yoga',
    name: 'Yoga',
    tags: ['yoga', 'entspannung', 'gesundheit', 'fitness'],
    category: 'Gesundheit',
  },
  'fitness-tracker_y5q5.svg': {
    id: 'ud-fitness-tracker',
    name: 'Fitness Tracker',
    tags: ['fitness', 'sport', 'gesundheit', 'tracking'],
    category: 'Gesundheit',
  },
  'family_6gj8.svg': {
    id: 'ud-family',
    name: 'Familie',
    tags: ['familie', 'kinder', 'eltern', 'zusammen'],
    category: 'Familie',
  },
  'children_e6ln.svg': {
    id: 'ud-children',
    name: 'Kinder',
    tags: ['kinder', 'spielen', 'jugend', 'zukunft'],
    category: 'Familie',
  },
  'fatherhood_eldm.svg': {
    id: 'ud-fatherhood',
    name: 'Vaterschaft',
    tags: ['vater', 'kind', 'familie', 'eltern'],
    category: 'Familie',
  },
  'motherhood_9s9r.svg': {
    id: 'ud-motherhood',
    name: 'Mutterschaft',
    tags: ['mutter', 'kind', 'familie', 'eltern'],
    category: 'Familie',
  },
  'grandma_9rwj.svg': {
    id: 'ud-grandma',
    name: 'Großmutter',
    tags: ['oma', 'großmutter', 'familie', 'generation'],
    category: 'Familie',
  },
  'working-together_r43a.svg': {
    id: 'ud-working-together',
    name: 'Zusammenarbeiten',
    tags: ['arbeit', 'team', 'zusammenarbeit', 'büro'],
    category: 'Arbeit',
  },
  'working-remotely_ivtz.svg': {
    id: 'ud-remote-work',
    name: 'Homeoffice',
    tags: ['homeoffice', 'remote', 'arbeit', 'digital'],
    category: 'Arbeit',
  },
  'job-hunt_5umi.svg': {
    id: 'ud-job-hunt',
    name: 'Jobsuche',
    tags: ['job', 'arbeit', 'suche', 'karriere'],
    category: 'Arbeit',
  },
  'interview_yz52.svg': {
    id: 'ud-interview',
    name: 'Vorstellungsgespräch',
    tags: ['interview', 'job', 'bewerbung', 'karriere'],
    category: 'Arbeit',
  },
  'meeting_dunc.svg': {
    id: 'ud-meeting',
    name: 'Besprechung',
    tags: ['meeting', 'besprechung', 'team', 'arbeit'],
    category: 'Arbeit',
  },
  'biking_m4mb.svg': {
    id: 'ud-biking',
    name: 'Radfahren',
    tags: ['fahrrad', 'radfahren', 'mobilität', 'umwelt'],
    category: 'Mobilität',
  },
  'bike-ride_ba0o.svg': {
    id: 'ud-bike-ride',
    name: 'Fahrradtour',
    tags: ['fahrrad', 'tour', 'freizeit', 'sport'],
    category: 'Mobilität',
  },
  'bus-stop_m7q9.svg': {
    id: 'ud-bus-stop',
    name: 'Bushaltestelle',
    tags: ['bus', 'öpnv', 'haltestelle', 'verkehr'],
    category: 'Mobilität',
  },
  'subway_66jh.svg': {
    id: 'ud-subway',
    name: 'U-Bahn',
    tags: ['ubahn', 'metro', 'öpnv', 'verkehr'],
    category: 'Mobilität',
  },
  'scooter_izdb.svg': {
    id: 'ud-scooter',
    name: 'Roller',
    tags: ['roller', 'scooter', 'mobilität', 'stadt'],
    category: 'Mobilität',
  },
  'city-life_l74x.svg': {
    id: 'ud-city-life',
    name: 'Stadtleben',
    tags: ['stadt', 'leben', 'urban', 'gemeinschaft'],
    category: 'Wohnen',
  },
  'town_oesm.svg': {
    id: 'ud-town',
    name: 'Kleinstadt',
    tags: ['stadt', 'dorf', 'gemeinde', 'ort'],
    category: 'Wohnen',
  },
  'suburbs_zzmj.svg': {
    id: 'ud-suburbs',
    name: 'Vorort',
    tags: ['vorort', 'wohnen', 'familie', 'grün'],
    category: 'Wohnen',
  },
  'houses_owky.svg': {
    id: 'ud-house',
    name: 'Haus',
    tags: ['haus', 'wohnen', 'zuhause', 'immobilie'],
    category: 'Wohnen',
  },
  'apartment-rent_oodr.svg': {
    id: 'ud-apartment',
    name: 'Wohnung',
    tags: ['wohnung', 'miete', 'wohnen', 'stadt'],
    category: 'Wohnen',
  },
  'conversation_15p8.svg': {
    id: 'ud-conversation',
    name: 'Gespräch',
    tags: ['gespräch', 'dialog', 'kommunikation', 'austausch'],
    category: 'Kommunikation',
  },
  'group-chat_4xw0.svg': {
    id: 'ud-group-chat',
    name: 'Gruppenchat',
    tags: ['chat', 'gruppe', 'kommunikation', 'digital'],
    category: 'Kommunikation',
  },
  'podcast_0ioh.svg': {
    id: 'ud-podcast',
    name: 'Podcast',
    tags: ['podcast', 'audio', 'medien', 'kommunikation'],
    category: 'Kommunikation',
  },
  'conference-call_ccsp.svg': {
    id: 'ud-conference',
    name: 'Konferenz',
    tags: ['konferenz', 'video', 'meeting', 'digital'],
    category: 'Kommunikation',
  },
  'presentation_4ik4.svg': {
    id: 'ud-presentation',
    name: 'Präsentation',
    tags: ['präsentation', 'vortrag', 'rede', 'event'],
    category: 'Kommunikation',
  },
  'outdoor-party_ixnf.svg': {
    id: 'ud-outdoor-party',
    name: 'Outdoor Party',
    tags: ['party', 'fest', 'outdoor', 'feier'],
    category: 'Events',
  },
  'celebration_wtm8.svg': {
    id: 'ud-celebration',
    name: 'Feier',
    tags: ['feier', 'fest', 'party', 'freude'],
    category: 'Events',
  },
  'party_27wv.svg': {
    id: 'ud-party',
    name: 'Party',
    tags: ['party', 'feier', 'spaß', 'musik'],
    category: 'Events',
  },
  'special-event_hv54.svg': {
    id: 'ud-special-event',
    name: 'Besonderes Event',
    tags: ['event', 'veranstaltung', 'besonders', 'feier'],
    category: 'Events',
  },
  'success_288d.svg': {
    id: 'ud-success',
    name: 'Erfolg',
    tags: ['erfolg', 'ziel', 'gewinnen', 'erreichen'],
    category: 'Motivation',
  },
  'goals_0pov.svg': {
    id: 'ud-goals',
    name: 'Ziele',
    tags: ['ziele', 'motivation', 'planen', 'zukunft'],
    category: 'Motivation',
  },
  'winners_fre4.svg': {
    id: 'ud-winners',
    name: 'Gewinner',
    tags: ['gewinnen', 'erfolg', 'sieger', 'feier'],
    category: 'Motivation',
  },
  'high-five_w86k.svg': {
    id: 'ud-high-five',
    name: 'Abklatschen',
    tags: ['high five', 'team', 'erfolg', 'freude'],
    category: 'Motivation',
  },
  'innovative_9l1b.svg': {
    id: 'ud-innovative',
    name: 'Innovation',
    tags: ['innovation', 'technologie', 'fortschritt', 'zukunft'],
    category: 'Technologie',
  },
  'artificial-intelligence_43qa.svg': {
    id: 'ud-artificial-intelligence',
    name: 'Künstliche Intelligenz',
    tags: ['ki', 'ai', 'technologie', 'zukunft'],
    category: 'Technologie',
  },
  'smart-home_9s59.svg': {
    id: 'ud-smart-home',
    name: 'Smart Home',
    tags: ['smart home', 'technologie', 'wohnen', 'digital'],
    category: 'Technologie',
  },
  'hiking_9zta.svg': {
    id: 'ud-hiking',
    name: 'Wandern',
    tags: ['wandern', 'natur', 'sport', 'freizeit'],
    category: 'Freizeit',
  },
  'camping_q4ji.svg': {
    id: 'ud-camping',
    name: 'Camping',
    tags: ['camping', 'natur', 'zelt', 'abenteuer'],
    category: 'Freizeit',
  },
  'at-the-park_2y19.svg': {
    id: 'ud-park',
    name: 'Park',
    tags: ['park', 'grün', 'freizeit', 'natur'],
    category: 'Freizeit',
  },
  'basketball_40ga.svg': {
    id: 'ud-basketball',
    name: 'Basketball',
    tags: ['basketball', 'sport', 'team', 'spielen'],
    category: 'Sport',
  },
  'jogging_tf9a.svg': {
    id: 'ud-jogging',
    name: 'Joggen',
    tags: ['joggen', 'laufen', 'sport', 'fitness'],
    category: 'Sport',
  },
  'agreement_ftet.svg': {
    id: 'ud-agreement',
    name: 'Einigung',
    tags: ['einigung', 'vertrag', 'handschlag', 'zusammenarbeit'],
    category: 'Geschäft',
  },
  'ideas_vn7a.svg': {
    id: 'ud-ideas',
    name: 'Ideen',
    tags: ['idee', 'kreativ', 'denken', 'innovation'],
    category: 'Kreativität',
  },
  'brainstorming_gny9.svg': {
    id: 'ud-brainstorming',
    name: 'Brainstorming',
    tags: ['brainstorming', 'ideen', 'team', 'kreativ'],
    category: 'Kreativität',
  },
  'welcome_nk8k.svg': {
    id: 'ud-welcome',
    name: 'Willkommen',
    tags: ['willkommen', 'begrüßung', 'offen', 'freundlich'],
    category: 'Allgemein',
  },
  'pride_u77s.svg': {
    id: 'ud-pride',
    name: 'Pride',
    tags: ['pride', 'vielfalt', 'lgbtq', 'regenbogen'],
    category: 'Vielfalt',
  },
  'happy-women-day_8whn.svg': {
    id: 'ud-happy-women-day',
    name: 'Frauentag',
    tags: ['frauen', 'gleichstellung', 'feminismus', 'tag'],
    category: 'Vielfalt',
  },
};

// Keyword → category mapping for auto-classification
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Politik: [
    'vote',
    'voting',
    'election',
    'campaign',
    'government',
    'law',
    'political',
    'democracy',
    'debate',
    'protest',
    'rally',
  ],
  Gemeinschaft: [
    'community',
    'together',
    'group',
    'team',
    'crowd',
    'people',
    'social',
    'neighbor',
    'volunteer',
    'support',
  ],
  Umwelt: [
    'eco',
    'environment',
    'nature',
    'green',
    'plant',
    'tree',
    'solar',
    'wind',
    'energy',
    'recycle',
    'climate',
    'earth',
    'forest',
    'flower',
    'garden',
    'organic',
    'sustainable',
  ],
  Bildung: [
    'education',
    'school',
    'learn',
    'book',
    'study',
    'teach',
    'university',
    'knowledge',
    'library',
    'graduation',
    'student',
    'reading',
    'science',
    'research',
  ],
  Gesundheit: [
    'health',
    'medical',
    'doctor',
    'hospital',
    'fitness',
    'yoga',
    'wellness',
    'therapy',
    'mental',
    'care',
    'medicine',
    'vaccine',
    'nurse',
  ],
  Familie: [
    'family',
    'child',
    'children',
    'parent',
    'baby',
    'mother',
    'father',
    'grandma',
    'grandpa',
    'kid',
    'parenting',
  ],
  Arbeit: [
    'work',
    'office',
    'job',
    'career',
    'meeting',
    'business',
    'interview',
    'resume',
    'employee',
    'remote',
    'cowork',
    'freelance',
    'startup',
    'entrepreneur',
  ],
  Mobilität: [
    'bike',
    'bicycle',
    'bus',
    'train',
    'car',
    'transport',
    'subway',
    'scooter',
    'drive',
    'ride',
    'travel',
    'flight',
    'airport',
  ],
  Wohnen: [
    'house',
    'home',
    'apartment',
    'city',
    'town',
    'building',
    'suburb',
    'real-estate',
    'rent',
    'neighborhood',
    'urban',
  ],
  Kommunikation: [
    'chat',
    'message',
    'email',
    'conversation',
    'podcast',
    'video-call',
    'conference',
    'presentation',
    'speech',
    'newsletter',
    'blog',
    'social-media',
  ],
  Events: [
    'party',
    'event',
    'celebration',
    'festival',
    'concert',
    'gathering',
    'ceremony',
    'birthday',
    'wedding',
  ],
  Motivation: [
    'success',
    'goal',
    'winner',
    'achievement',
    'high-five',
    'growth',
    'progress',
    'milestone',
    'challenge',
    'dream',
    'hero',
    'super',
  ],
  Technologie: [
    'tech',
    'code',
    'programming',
    'software',
    'data',
    'cloud',
    'server',
    'ai',
    'robot',
    'digital',
    'cyber',
    'smart',
    'app',
    'web',
    'internet',
    'device',
    'computer',
    'phone',
    'mobile',
    'iot',
    'blockchain',
  ],
  Kreativität: [
    'idea',
    'creative',
    'design',
    'art',
    'brainstorm',
    'innovation',
    'imagine',
    'color',
    'paint',
    'draw',
    'photo',
    'music',
    'craft',
  ],
  Vielfalt: [
    'pride',
    'diversity',
    'inclusion',
    'women',
    'equality',
    'multicultural',
    'accessibility',
    'gender',
  ],
  Freizeit: [
    'hiking',
    'camping',
    'park',
    'outdoor',
    'adventure',
    'leisure',
    'hobby',
    'fishing',
    'beach',
    'vacation',
    'holiday',
    'relax',
    'trip',
    'picnic',
    'walk',
  ],
  Sport: [
    'sport',
    'basketball',
    'football',
    'soccer',
    'running',
    'jogging',
    'swim',
    'gym',
    'athletic',
    'baseball',
    'tennis',
    'golf',
  ],
  Finanzen: [
    'finance',
    'money',
    'payment',
    'bank',
    'invest',
    'saving',
    'credit',
    'wallet',
    'crypto',
    'stock',
    'budget',
    'tax',
  ],
  Sicherheit: [
    'security',
    'safe',
    'protect',
    'privacy',
    'lock',
    'shield',
    'guard',
    'authentication',
    'password',
    'encrypt',
  ],
  Essen: [
    'food',
    'cook',
    'recipe',
    'restaurant',
    'eat',
    'meal',
    'breakfast',
    'lunch',
    'dinner',
    'drink',
    'coffee',
    'pizza',
    'burger',
    'wine',
    'beer',
    'ice-cream',
    'bakery',
  ],
  Shopping: [
    'shop',
    'cart',
    'buy',
    'store',
    'ecommerce',
    'purchase',
    'order',
    'delivery',
    'package',
    'gift',
  ],
};

function classifyFilename(basename: string): string {
  const lower = basename.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) return category;
    }
  }
  return 'Sonstige';
}

function filenameToName(filename: string): string {
  // "voting_3ygx.svg" → "Voting", "a-better-world_y9ca.svg" → "A Better World"
  const base = filename.replace(/\.svg$/, '').replace(/_[a-z0-9]{4}$/, '');
  return base
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function filenameToTags(filename: string): string[] {
  const base = filename.replace(/\.svg$/, '').replace(/_[a-z0-9]{4}$/, '');
  return base.split('-').filter((w) => w.length > 2);
}

function filenameToId(filename: string): string {
  const base = filename.replace(/\.svg$/, '').replace(/_[a-z0-9]{4}$/, '');
  return `ud-${base}`;
}

function main() {
  const files = fs
    .readdirSync(UNDRAW_DIR)
    .filter((f) => f.endsWith('.svg'))
    .sort();
  console.log(`Found ${files.length} SVG files in ${UNDRAW_DIR}`);

  const entries: string[] = [];
  let curatedCount = 0;
  let generatedCount = 0;

  for (const filename of files) {
    const curated = CURATED[filename];
    if (curated) {
      curatedCount++;
      entries.push(
        `  { id: ${JSON.stringify(curated.id)}, name: ${JSON.stringify(curated.name)}, filename: ${JSON.stringify(filename)}, source: 'undraw', tags: ${JSON.stringify(curated.tags)}, category: ${JSON.stringify(curated.category)} },`
      );
    } else {
      generatedCount++;
      const id = filenameToId(filename);
      const name = filenameToName(filename);
      const tags = filenameToTags(filename);
      const category = classifyFilename(filename);
      entries.push(
        `  { id: ${JSON.stringify(id)}, name: ${JSON.stringify(name)}, filename: ${JSON.stringify(filename)}, source: 'undraw', tags: ${JSON.stringify(tags)}, category: ${JSON.stringify(category)} },`
      );
    }
  }

  const output = `/**
 * Auto-generated Undraw illustration registry
 * Generated by: pnpm tsx packages/canvas-editor/scripts/generateUndrawRegistry.ts
 *
 * ${files.length} illustrations total (${curatedCount} curated + ${generatedCount} auto-generated)
 * DO NOT EDIT MANUALLY — re-run the generator script instead.
 */

import type { SvgDef } from './types';

export const UNDRAW_ALL: SvgDef[] = [
${entries.join('\n')}
];
`;

  fs.writeFileSync(OUTPUT_FILE, output, 'utf-8');
  console.log(`Written ${OUTPUT_FILE}`);
  console.log(
    `  Curated: ${curatedCount}, Auto-generated: ${generatedCount}, Total: ${files.length}`
  );
}

main();
