/**
 * Illustration Definitions
 * Registry of illustrations from React Kawaii, undraw, and opendoodles with German names and tags
 */

// =============================================================================
// TYPES
// =============================================================================

// React Kawaii types
export type KawaiiMood = 'sad' | 'shocked' | 'happy' | 'blissful' | 'lovestruck';

export type KawaiiIllustrationType =
    | 'planet' | 'cat' | 'ghost' | 'iceCream' | 'browser'
    | 'mug' | 'speechBubble' | 'backpack' | 'creditCard' | 'file' | 'folder';

export interface KawaiiDef {
    id: KawaiiIllustrationType;
    name: string;
    tags: string[];
    source: 'kawaii';
}

export interface KawaiiInstance {
    id: string;
    illustrationId: KawaiiIllustrationType;
    source: 'kawaii';
    x: number;
    y: number;
    scale: number;
    rotation: number;
    color: string;
    opacity: number;
    mood: KawaiiMood;
}

// SVG Illustration types
export interface SvgDef {
    id: string;
    name: string; // German name
    filename: string;
    source: 'undraw' | 'opendoodles';
    tags: string[]; // German search tags
    category?: string;
}

export interface SvgInstance {
    id: string;
    illustrationId: string; // references SvgDef.id
    source: 'undraw' | 'opendoodles';
    x: number;
    y: number;
    scale: number;
    rotation: number;
    opacity: number;
    color?: string;
}

// Unified Union Types
export type IllustrationDef = KawaiiDef | SvgDef;
export type IllustrationInstance = KawaiiInstance | SvgInstance;

// =============================================================================
// REACT KAWAII REGISTRY
// =============================================================================

export const KAWAII_ILLUSTRATIONS: KawaiiDef[] = [
    { id: 'planet', name: 'Planet', tags: ['weltraum', 'space', 'erde', 'welt', 'rund'], source: 'kawaii' },
    { id: 'cat', name: 'Katze', tags: ['tier', 'animal', 'haustier', 'katze', 'niedlich'], source: 'kawaii' },
    { id: 'ghost', name: 'Geist', tags: ['geist', 'ghost', 'halloween', 'süß', 'spooky'], source: 'kawaii' },
    { id: 'iceCream', name: 'Eis', tags: ['eis', 'sommer', 'süß', 'essen', 'dessert'], source: 'kawaii' },
    { id: 'browser', name: 'Browser', tags: ['internet', 'web', 'computer', 'technik', 'digital'], source: 'kawaii' },
    { id: 'mug', name: 'Tasse', tags: ['kaffee', 'tee', 'tasse', 'getränk', 'pause'], source: 'kawaii' },
    { id: 'speechBubble', name: 'Sprechblase', tags: ['sprechen', 'dialog', 'kommunikation', 'rede', 'chat'], source: 'kawaii' },
    { id: 'backpack', name: 'Rucksack', tags: ['rucksack', 'reise', 'schule', 'wandern', 'tasche'], source: 'kawaii' },
    { id: 'creditCard', name: 'Kreditkarte', tags: ['zahlung', 'geld', 'karte', 'finanzen', 'bank'], source: 'kawaii' },
    { id: 'file', name: 'Datei', tags: ['datei', 'dokument', 'büro', 'arbeit', 'ordnung'], source: 'kawaii' },
    { id: 'folder', name: 'Ordner', tags: ['ordner', 'ablage', 'büro', 'organisation', 'dokumente'], source: 'kawaii' },
];

export const ILLUSTRATION_COLORS = [
    { id: 'green', label: 'Grün', color: '#005538' },
    { id: 'sunflower', label: 'Sonnenblume', color: '#FFED00' },
    { id: 'magenta', label: 'Magenta', color: '#E5007D' },
    { id: 'turquoise', label: 'Türkis', color: '#009EE0' },
    { id: 'klee', label: 'Klee', color: '#6CCD87' },
    { id: 'white', label: 'Weiß', color: '#FFFFFF' },
    { id: 'black', label: 'Schwarz', color: '#262626' },
    { id: 'pink', label: 'Rosa', color: '#FFB6C1' },
] as const;

export const KAWAII_MOODS: { id: KawaiiMood; label: string; emoji: string }[] = [
    { id: 'happy', label: 'Fröhlich', emoji: '😊' },
    { id: 'blissful', label: 'Glückselig', emoji: '😌' },
    { id: 'lovestruck', label: 'Verliebt', emoji: '😍' },
    { id: 'shocked', label: 'Überrascht', emoji: '😲' },
    { id: 'sad', label: 'Traurig', emoji: '😢' },
];

// =============================================================================
// OPENDOODLES REGISTRY
// =============================================================================

export const OPENDOODLES: SvgDef[] = [
    { id: 'od-doggie', name: 'Hund', filename: 'Doggie.svg', source: 'opendoodles', tags: ['hund', 'tier', 'haustier', 'niedlich'], category: 'Tiere' },
    { id: 'od-ballet', name: 'Ballett', filename: 'ballet.svg', source: 'opendoodles', tags: ['tanzen', 'sport', 'kunst', 'bewegung'], category: 'Aktivitäten' },
    { id: 'od-bikini', name: 'Sommer', filename: 'bikini.svg', source: 'opendoodles', tags: ['sommer', 'strand', 'urlaub', 'sonne'], category: 'Freizeit' },
    { id: 'od-chilling', name: 'Entspannen', filename: 'chilling.svg', source: 'opendoodles', tags: ['entspannung', 'pause', 'ruhe', 'freizeit'], category: 'Freizeit' },
    { id: 'od-clumsy', name: 'Tollpatschig', filename: 'clumsy.svg', source: 'opendoodles', tags: ['lustig', 'humor', 'stolpern'], category: 'Menschen' },
    { id: 'od-coffee', name: 'Kaffee', filename: 'coffee.svg', source: 'opendoodles', tags: ['kaffee', 'pause', 'getränk', 'morgen'], category: 'Freizeit' },
    { id: 'od-dancing', name: 'Tanzen', filename: 'dancing.svg', source: 'opendoodles', tags: ['tanzen', 'party', 'freude', 'musik'], category: 'Aktivitäten' },
    { id: 'od-dog-jump', name: 'Springender Hund', filename: 'dog-jump.svg', source: 'opendoodles', tags: ['hund', 'tier', 'spielen', 'springen'], category: 'Tiere' },
    { id: 'od-float', name: 'Schweben', filename: 'float.svg', source: 'opendoodles', tags: ['fliegen', 'schweben', 'träumen', 'leicht'], category: 'Menschen' },
    { id: 'od-groovy', name: 'Groovy', filename: 'groovy.svg', source: 'opendoodles', tags: ['cool', 'musik', 'tanzen', 'retro'], category: 'Aktivitäten' },
    { id: 'od-ice-cream', name: 'Eiscreme', filename: 'ice-cream.svg', source: 'opendoodles', tags: ['eis', 'sommer', 'süß', 'lecker'], category: 'Essen' },
    { id: 'od-jumping', name: 'Springen', filename: 'jumping.svg', source: 'opendoodles', tags: ['springen', 'freude', 'energie', 'sport'], category: 'Aktivitäten' },
    { id: 'od-laying', name: 'Liegen', filename: 'laying.svg', source: 'opendoodles', tags: ['entspannen', 'ruhe', 'schlafen', 'pause'], category: 'Freizeit' },
    { id: 'od-levitate', name: 'Schweben', filename: 'levitate.svg', source: 'opendoodles', tags: ['schweben', 'fliegen', 'magie', 'meditation'], category: 'Menschen' },
    { id: 'od-loving', name: 'Verliebt', filename: 'loving.svg', source: 'opendoodles', tags: ['liebe', 'herz', 'romantik', 'glücklich'], category: 'Gefühle' },
    { id: 'od-meditating', name: 'Meditieren', filename: 'meditating.svg', source: 'opendoodles', tags: ['meditation', 'yoga', 'ruhe', 'achtsamkeit'], category: 'Gesundheit' },
    { id: 'od-moshing', name: 'Moshen', filename: 'moshing.svg', source: 'opendoodles', tags: ['konzert', 'musik', 'party', 'rock'], category: 'Aktivitäten' },
    { id: 'od-petting', name: 'Streicheln', filename: 'petting.svg', source: 'opendoodles', tags: ['tier', 'liebe', 'fürsorge', 'haustier'], category: 'Tiere' },
    { id: 'od-plant', name: 'Pflanze', filename: 'plant.svg', source: 'opendoodles', tags: ['pflanze', 'natur', 'grün', 'umwelt'], category: 'Natur' },
    { id: 'od-reading-side', name: 'Lesen (Seite)', filename: 'reading-side.svg', source: 'opendoodles', tags: ['lesen', 'buch', 'bildung', 'wissen'], category: 'Bildung' },
    { id: 'od-reading', name: 'Lesen', filename: 'reading.svg', source: 'opendoodles', tags: ['lesen', 'buch', 'bildung', 'lernen'], category: 'Bildung' },
    { id: 'od-roller-skating', name: 'Rollschuh fahren', filename: 'roller-skating.svg', source: 'opendoodles', tags: ['rollschuh', 'sport', 'spaß', 'bewegung'], category: 'Sport' },
    { id: 'od-rolling', name: 'Rollen', filename: 'rolling.svg', source: 'opendoodles', tags: ['bewegung', 'spaß', 'spielen'], category: 'Aktivitäten' },
    { id: 'od-running', name: 'Laufen', filename: 'running.svg', source: 'opendoodles', tags: ['laufen', 'sport', 'joggen', 'fitness'], category: 'Sport' },
    { id: 'od-selfie', name: 'Selfie', filename: 'selfie.svg', source: 'opendoodles', tags: ['selfie', 'foto', 'handy', 'social media'], category: 'Technologie' },
    { id: 'od-sitting-reading', name: 'Sitzend lesen', filename: 'sitting-reading.svg', source: 'opendoodles', tags: ['lesen', 'sitzen', 'buch', 'entspannung'], category: 'Bildung' },
    { id: 'od-sitting', name: 'Sitzen', filename: 'sitting.svg', source: 'opendoodles', tags: ['sitzen', 'pause', 'warten', 'ruhe'], category: 'Menschen' },
    { id: 'od-sleek', name: 'Elegant', filename: 'sleek.svg', source: 'opendoodles', tags: ['elegant', 'stil', 'mode', 'cool'], category: 'Menschen' },
    { id: 'od-sprinting', name: 'Sprinten', filename: 'sprinting.svg', source: 'opendoodles', tags: ['sprint', 'laufen', 'schnell', 'sport'], category: 'Sport' },
    { id: 'od-strolling', name: 'Spazieren', filename: 'strolling.svg', source: 'opendoodles', tags: ['spazieren', 'gehen', 'entspannt', 'natur'], category: 'Aktivitäten' },
    { id: 'od-swinging', name: 'Schaukeln', filename: 'swinging.svg', source: 'opendoodles', tags: ['schaukel', 'spielen', 'kind', 'spaß'], category: 'Freizeit' },
    { id: 'od-unboxing', name: 'Auspacken', filename: 'unboxing.svg', source: 'opendoodles', tags: ['paket', 'geschenk', 'überraschung', 'freude'], category: 'Aktivitäten' },
    { id: 'od-zombieing', name: 'Zombie', filename: 'zombieing.svg', source: 'opendoodles', tags: ['zombie', 'halloween', 'gruselig', 'spaß'], category: 'Sonstiges' },
];

// =============================================================================
// UNDRAW REGISTRY
// =============================================================================

export const UNDRAW_FEATURED: SvgDef[] = [
    // Politik & Gemeinschaft
    { id: 'ud-voting', name: 'Abstimmung', filename: 'voting_3ygx.svg', source: 'undraw', tags: ['wahl', 'abstimmung', 'demokratie', 'politik'], category: 'Politik' },
    { id: 'ud-election-day', name: 'Wahltag', filename: 'election-day_puwv.svg', source: 'undraw', tags: ['wahl', 'politik', 'demokratie'], category: 'Politik' },
    { id: 'ud-public-discussion', name: 'Öffentliche Diskussion', filename: 'public-discussion_693m.svg', source: 'undraw', tags: ['diskussion', 'debatte', 'dialog', 'politik'], category: 'Politik' },
    { id: 'ud-team-spirit', name: 'Teamgeist', filename: 'team-spirit_18vw.svg', source: 'undraw', tags: ['team', 'zusammenarbeit', 'gemeinschaft', 'gruppe'], category: 'Gemeinschaft' },
    { id: 'ud-community', name: 'Gemeinschaft', filename: 'online-community_3o0l.svg', source: 'undraw', tags: ['gemeinschaft', 'zusammen', 'netzwerk', 'gruppe'], category: 'Gemeinschaft' },
    { id: 'ud-neighbors', name: 'Nachbarn', filename: 'neighbors_z879.svg', source: 'undraw', tags: ['nachbarn', 'gemeinschaft', 'quartier', 'zusammenleben'], category: 'Gemeinschaft' },

    // Umwelt & Nachhaltigkeit
    { id: 'ud-eco-conscious', name: 'Umweltbewusst', filename: 'eco-conscious_oqny.svg', source: 'undraw', tags: ['umwelt', 'nachhaltigkeit', 'grün', 'ökologie'], category: 'Umwelt' },
    { id: 'ud-environment', name: 'Umwelt', filename: 'environment_9luj.svg', source: 'undraw', tags: ['umwelt', 'natur', 'klima', 'schutz'], category: 'Umwelt' },
    { id: 'ud-wind-turbine', name: 'Windkraft', filename: 'wind-turbine_4z2a.svg', source: 'undraw', tags: ['wind', 'energie', 'erneuerbar', 'nachhaltigkeit'], category: 'Umwelt' },
    { id: 'ud-electric-car', name: 'Elektroauto', filename: 'electric-car_vlgq.svg', source: 'undraw', tags: ['elektro', 'auto', 'mobilität', 'umwelt'], category: 'Umwelt' },
    { id: 'ud-nature', name: 'Natur', filename: 'nature_yf30.svg', source: 'undraw', tags: ['natur', 'grün', 'pflanzen', 'umwelt'], category: 'Umwelt' },
    { id: 'ud-gardening', name: 'Gärtnern', filename: 'gardening_3tyw.svg', source: 'undraw', tags: ['garten', 'pflanzen', 'natur', 'hobby'], category: 'Umwelt' },
    { id: 'ud-watering-plants', name: 'Pflanzen gießen', filename: 'watering-plants_64af.svg', source: 'undraw', tags: ['pflanzen', 'gießen', 'natur', 'garten'], category: 'Umwelt' },

    // Bildung & Wissen
    { id: 'ud-education', name: 'Bildung', filename: 'education_3vwh.svg', source: 'undraw', tags: ['bildung', 'schule', 'lernen', 'wissen'], category: 'Bildung' },
    { id: 'ud-teacher', name: 'Lehrer', filename: 'teacher_s628.svg', source: 'undraw', tags: ['lehrer', 'unterricht', 'schule', 'bildung'], category: 'Bildung' },
    { id: 'ud-graduation', name: 'Abschluss', filename: 'graduation_u7uc.svg', source: 'undraw', tags: ['abschluss', 'studium', 'erfolg', 'uni'], category: 'Bildung' },
    { id: 'ud-book-lover', name: 'Buchliebhaber', filename: 'book-lover_m9n3.svg', source: 'undraw', tags: ['buch', 'lesen', 'wissen', 'bibliothek'], category: 'Bildung' },
    { id: 'ud-learning', name: 'Lernen', filename: 'learning_qt7d.svg', source: 'undraw', tags: ['lernen', 'bildung', 'wissen', 'entwicklung'], category: 'Bildung' },

    // Gesundheit & Wohlbefinden
    { id: 'ud-healthy-lifestyle', name: 'Gesunder Lebensstil', filename: 'healthy-lifestyle_8zpg.svg', source: 'undraw', tags: ['gesundheit', 'lifestyle', 'wohlbefinden', 'fitness'], category: 'Gesundheit' },
    { id: 'ud-medical-care', name: 'Medizinische Versorgung', filename: 'medical-care_7m9g.svg', source: 'undraw', tags: ['medizin', 'gesundheit', 'pflege', 'arzt'], category: 'Gesundheit' },
    { id: 'ud-doctors', name: 'Ärzte', filename: 'doctors_djoj.svg', source: 'undraw', tags: ['arzt', 'ärztin', 'medizin', 'gesundheit'], category: 'Gesundheit' },
    { id: 'ud-yoga', name: 'Yoga', filename: 'yoga_i399.svg', source: 'undraw', tags: ['yoga', 'entspannung', 'gesundheit', 'fitness'], category: 'Gesundheit' },
    { id: 'ud-fitness-tracker', name: 'Fitness Tracker', filename: 'fitness-tracker_y5q5.svg', source: 'undraw', tags: ['fitness', 'sport', 'gesundheit', 'tracking'], category: 'Gesundheit' },

    // Familie & Soziales
    { id: 'ud-family', name: 'Familie', filename: 'family_6gj8.svg', source: 'undraw', tags: ['familie', 'kinder', 'eltern', 'zusammen'], category: 'Familie' },
    { id: 'ud-children', name: 'Kinder', filename: 'children_e6ln.svg', source: 'undraw', tags: ['kinder', 'spielen', 'jugend', 'zukunft'], category: 'Familie' },
    { id: 'ud-fatherhood', name: 'Vaterschaft', filename: 'fatherhood_eldm.svg', source: 'undraw', tags: ['vater', 'kind', 'familie', 'eltern'], category: 'Familie' },
    { id: 'ud-motherhood', name: 'Mutterschaft', filename: 'motherhood_9s9r.svg', source: 'undraw', tags: ['mutter', 'kind', 'familie', 'eltern'], category: 'Familie' },
    { id: 'ud-grandma', name: 'Großmutter', filename: 'grandma_9rwj.svg', source: 'undraw', tags: ['oma', 'großmutter', 'familie', 'generation'], category: 'Familie' },

    // Arbeit & Wirtschaft
    { id: 'ud-working-together', name: 'Zusammenarbeiten', filename: 'working-together_r43a.svg', source: 'undraw', tags: ['arbeit', 'team', 'zusammenarbeit', 'büro'], category: 'Arbeit' },
    { id: 'ud-remote-work', name: 'Homeoffice', filename: 'working-remotely_ivtz.svg', source: 'undraw', tags: ['homeoffice', 'remote', 'arbeit', 'digital'], category: 'Arbeit' },
    { id: 'ud-job-hunt', name: 'Jobsuche', filename: 'job-hunt_5umi.svg', source: 'undraw', tags: ['job', 'arbeit', 'suche', 'karriere'], category: 'Arbeit' },
    { id: 'ud-interview', name: 'Vorstellungsgespräch', filename: 'interview_yz52.svg', source: 'undraw', tags: ['interview', 'job', 'bewerbung', 'karriere'], category: 'Arbeit' },
    { id: 'ud-meeting', name: 'Besprechung', filename: 'meeting_dunc.svg', source: 'undraw', tags: ['meeting', 'besprechung', 'team', 'arbeit'], category: 'Arbeit' },

    // Verkehr & Mobilität
    { id: 'ud-biking', name: 'Radfahren', filename: 'biking_m4mb.svg', source: 'undraw', tags: ['fahrrad', 'radfahren', 'mobilität', 'umwelt'], category: 'Mobilität' },
    { id: 'ud-bike-ride', name: 'Fahrradtour', filename: 'bike-ride_ba0o.svg', source: 'undraw', tags: ['fahrrad', 'tour', 'freizeit', 'sport'], category: 'Mobilität' },
    { id: 'ud-bus-stop', name: 'Bushaltestelle', filename: 'bus-stop_m7q9.svg', source: 'undraw', tags: ['bus', 'öpnv', 'haltestelle', 'verkehr'], category: 'Mobilität' },
    { id: 'ud-subway', name: 'U-Bahn', filename: 'subway_66jh.svg', source: 'undraw', tags: ['ubahn', 'metro', 'öpnv', 'verkehr'], category: 'Mobilität' },
    { id: 'ud-scooter', name: 'Roller', filename: 'scooter_izdb.svg', source: 'undraw', tags: ['roller', 'scooter', 'mobilität', 'stadt'], category: 'Mobilität' },

    // Wohnen & Stadt
    { id: 'ud-city-life', name: 'Stadtleben', filename: 'city-life_l74x.svg', source: 'undraw', tags: ['stadt', 'leben', 'urban', 'gemeinschaft'], category: 'Wohnen' },
    { id: 'ud-town', name: 'Kleinstadt', filename: 'town_oesm.svg', source: 'undraw', tags: ['stadt', 'dorf', 'gemeinde', 'ort'], category: 'Wohnen' },
    { id: 'ud-suburbs', name: 'Vorort', filename: 'suburbs_zzmj.svg', source: 'undraw', tags: ['vorort', 'wohnen', 'familie', 'grün'], category: 'Wohnen' },
    { id: 'ud-house', name: 'Haus', filename: 'houses_owky.svg', source: 'undraw', tags: ['haus', 'wohnen', 'zuhause', 'immobilie'], category: 'Wohnen' },
    { id: 'ud-apartment', name: 'Wohnung', filename: 'apartment-rent_oodr.svg', source: 'undraw', tags: ['wohnung', 'miete', 'wohnen', 'stadt'], category: 'Wohnen' },

    // Kommunikation & Dialog
    { id: 'ud-conversation', name: 'Gespräch', filename: 'conversation_15p8.svg', source: 'undraw', tags: ['gespräch', 'dialog', 'kommunikation', 'austausch'], category: 'Kommunikation' },
    { id: 'ud-group-chat', name: 'Gruppenchat', filename: 'group-chat_4xw0.svg', source: 'undraw', tags: ['chat', 'gruppe', 'kommunikation', 'digital'], category: 'Kommunikation' },
    { id: 'ud-podcast', name: 'Podcast', filename: 'podcast_0ioh.svg', source: 'undraw', tags: ['podcast', 'audio', 'medien', 'kommunikation'], category: 'Kommunikation' },
    { id: 'ud-conference', name: 'Konferenz', filename: 'conference-call_ccsp.svg', source: 'undraw', tags: ['konferenz', 'video', 'meeting', 'digital'], category: 'Kommunikation' },
    { id: 'ud-presentation', name: 'Präsentation', filename: 'presentation_4ik4.svg', source: 'undraw', tags: ['präsentation', 'vortrag', 'rede', 'event'], category: 'Kommunikation' },

    // Veranstaltungen
    { id: 'ud-outdoor-party', name: 'Outdoor Party', filename: 'outdoor-party_ixnf.svg', source: 'undraw', tags: ['party', 'fest', 'outdoor', 'feier'], category: 'Events' },
    { id: 'ud-celebration', name: 'Feier', filename: 'celebration_wtm8.svg', source: 'undraw', tags: ['feier', 'fest', 'party', 'freude'], category: 'Events' },
    { id: 'ud-party', name: 'Party', filename: 'party_27wv.svg', source: 'undraw', tags: ['party', 'feier', 'spaß', 'musik'], category: 'Events' },
    { id: 'ud-special-event', name: 'Besonderes Event', filename: 'special-event_hv54.svg', source: 'undraw', tags: ['event', 'veranstaltung', 'besonders', 'feier'], category: 'Events' },

    // Erfolg & Motivation
    { id: 'ud-success', name: 'Erfolg', filename: 'success_288d.svg', source: 'undraw', tags: ['erfolg', 'ziel', 'gewinnen', 'erreichen'], category: 'Motivation' },
    { id: 'ud-goals', name: 'Ziele', filename: 'goals_0pov.svg', source: 'undraw', tags: ['ziele', 'motivation', 'planen', 'zukunft'], category: 'Motivation' },
    { id: 'ud-winners', name: 'Gewinner', filename: 'winners_fre4.svg', source: 'undraw', tags: ['gewinnen', 'erfolg', 'sieger', 'feier'], category: 'Motivation' },
    { id: 'ud-high-five', name: 'Abklatschen', filename: 'high-five_w86k.svg', source: 'undraw', tags: ['high five', 'team', 'erfolg', 'freude'], category: 'Motivation' },

    // Technologie & Innovation
    { id: 'ud-innovative', name: 'Innovation', filename: 'innovative_9l1b.svg', source: 'undraw', tags: ['innovation', 'technologie', 'fortschritt', 'zukunft'], category: 'Technologie' },
    { id: 'ud-artificial-intelligence', name: 'Künstliche Intelligenz', filename: 'artificial-intelligence_43qa.svg', source: 'undraw', tags: ['ki', 'ai', 'technologie', 'zukunft'], category: 'Technologie' },
    { id: 'ud-smart-home', name: 'Smart Home', filename: 'smart-home_9s59.svg', source: 'undraw', tags: ['smart home', 'technologie', 'wohnen', 'digital'], category: 'Technologie' },

    // Freizeit & Sport
    { id: 'ud-hiking', name: 'Wandern', filename: 'hiking_9zta.svg', source: 'undraw', tags: ['wandern', 'natur', 'sport', 'freizeit'], category: 'Freizeit' },
    { id: 'ud-camping', name: 'Camping', filename: 'camping_q4ji.svg', source: 'undraw', tags: ['camping', 'natur', 'zelt', 'abenteuer'], category: 'Freizeit' },
    { id: 'ud-park', name: 'Park', filename: 'at-the-park_2y19.svg', source: 'undraw', tags: ['park', 'grün', 'freizeit', 'natur'], category: 'Freizeit' },
    { id: 'ud-basketball', name: 'Basketball', filename: 'basketball_40ga.svg', source: 'undraw', tags: ['basketball', 'sport', 'team', 'spielen'], category: 'Sport' },
    { id: 'ud-jogging', name: 'Joggen', filename: 'jogging_tf9a.svg', source: 'undraw', tags: ['joggen', 'laufen', 'sport', 'fitness'], category: 'Sport' },

    // Sonstige nützliche
    { id: 'ud-agreement', name: 'Einigung', filename: 'agreement_ftet.svg', source: 'undraw', tags: ['einigung', 'vertrag', 'handschlag', 'zusammenarbeit'], category: 'Geschäft' },
    { id: 'ud-ideas', name: 'Ideen', filename: 'ideas_vn7a.svg', source: 'undraw', tags: ['idee', 'kreativ', 'denken', 'innovation'], category: 'Kreativität' },
    { id: 'ud-brainstorming', name: 'Brainstorming', filename: 'brainstorming_gny9.svg', source: 'undraw', tags: ['brainstorming', 'ideen', 'team', 'kreativ'], category: 'Kreativität' },
    { id: 'ud-welcome', name: 'Willkommen', filename: 'welcome_nk8k.svg', source: 'undraw', tags: ['willkommen', 'begrüßung', 'offen', 'freundlich'], category: 'Allgemein' },
    { id: 'ud-pride', name: 'Pride', filename: 'pride_u77s.svg', source: 'undraw', tags: ['pride', 'vielfalt', 'lgbtq', 'regenbogen'], category: 'Vielfalt' },
    { id: 'ud-happy-women-day', name: 'Frauentag', filename: 'happy-women-day_8whn.svg', source: 'undraw', tags: ['frauen', 'gleichstellung', 'feminismus', 'tag'], category: 'Vielfalt' },
];

// =============================================================================
// COMBINED REGISTRY
// =============================================================================

export const ALL_ILLUSTRATIONS: IllustrationDef[] = [
    ...KAWAII_ILLUSTRATIONS,
    ...OPENDOODLES,
    ...UNDRAW_FEATURED,
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

export function getIllustrationPath(illustration: SvgDef): string {
    return `/illustrations/${illustration.source}/${illustration.filename}`;
}

export function createIllustration(
    illustrationId: string, // Can be Kawaii type OR SVG ID
    canvasWidth: number,
    canvasHeight: number
): IllustrationInstance {
    // Check if it's a Kawaii illustration
    const kawaiiDef = KAWAII_ILLUSTRATIONS.find(k => k.id === illustrationId);
    if (kawaiiDef) {
        return {
            id: `ill-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            illustrationId: kawaiiDef.id,
            source: 'kawaii',
            x: canvasWidth / 2 - 50,
            y: canvasHeight / 2 - 50,
            scale: 1,
            rotation: 0,
            color: '#6CCD87', // Default to Klee green
            opacity: 1,
            mood: 'happy',
        };
    }

    // Check if it's an SVG illustration
    const svgDef = ALL_ILLUSTRATIONS.find(s => s.id === illustrationId);
    if (svgDef && (svgDef.source === 'undraw' || svgDef.source === 'opendoodles')) {
        const svg = svgDef as SvgDef;
        return {
            id: `svg-ill-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            illustrationId: svg.id,
            source: svg.source,
            x: canvasWidth / 2 - 100,
            y: canvasHeight / 2 - 100,
            scale: 1.0,
            rotation: 0,
            opacity: 1,
            color: '#005538', // Default to Tanne
        };
    }

    throw new Error(`Unknown illustration ID: ${illustrationId}`);
}

export function findIllustrationById(id: string): IllustrationDef | undefined {
    return ALL_ILLUSTRATIONS.find(ill => ill.id === id);
}

export function searchIllustrations(query: string): IllustrationDef[] {
    const lowerQuery = query.toLowerCase();
    return ALL_ILLUSTRATIONS.filter(ill =>
        ill.name.toLowerCase().includes(lowerQuery) ||
        ill.tags.some(tag => tag.toLowerCase().includes(lowerQuery)) ||
        (ill.source !== 'kawaii' && (ill as SvgDef).category?.toLowerCase().includes(lowerQuery))
    );
}

export function getIllustrationsByCategory(category: string): SvgDef[] {
    return ALL_ILLUSTRATIONS.filter(ill =>
        ill.source !== 'kawaii' && (ill as SvgDef).category === category
    ) as SvgDef[];
}

export function getAllSvgCategories(): string[] {
    const categories = new Set<string>();
    ALL_ILLUSTRATIONS.forEach(ill => {
        if (ill.source !== 'kawaii' && (ill as SvgDef).category) {
            categories.add((ill as SvgDef).category!);
        }
    });
    return Array.from(categories).sort();
}
// =============================================================================
// ALIASES FOR COMPATIBILITY
// =============================================================================

export const ALL_SVG_ILLUSTRATIONS = [...OPENDOODLES, ...UNDRAW_FEATURED];
export const getSvgIllustrationsByCategory = getIllustrationsByCategory;
export const searchSvgIllustrations = searchIllustrations;
