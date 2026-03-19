import type { MonitorLocale } from './types.js';

export interface WatcherEntity {
  id: string;
  label: string;
  locale: MonitorLocale;
  keywords: string[];
  excludePatterns: string[];
  summaryPrompt: string;
}

export const WATCHER_ENTITIES: WatcherEntity[] = [
  {
    id: 'gruene',
    label: 'Die Grünen',
    locale: 'de',
    keywords: [
      // Party name patterns (avoiding bare "grüne" which matches adjective use)
      'die grünen',
      'der grünen',
      'den grünen',
      'grünen-',
      'grüne fordern',
      'grüne kritisieren',
      'grüne wollen',
      'grüne halten',
      'grüne im',
      'grüne und',
      'grüne richten',
      'grüne über',
      'grüne attackiert',
      'grüne-politiker',
      'grünen-politiker',
      'grünen-fraktion',
      'grünen-abgeordnete',
      'grünen-haushalts',
      'grünen-wahlkampf',
      'bündnis 90',
      // Bundesparteivorstand (BDK Nov 2025)
      'franziska brantner',
      'felix banaszak',
      'pegah edalatian',
      'heiko knopf',
      'sven giegold',
      // Fraktionsvorsitz
      'katharina dröge',
      'britta haßelmann',
      'hasselmann', // common spelling without ß
      'irene mihalic',
      // Stellv. Fraktionsvorsitzende
      'agnieszka brugger',
      'janosch dahmen',
      'misbah khan',
      'julia verlinden',
      'andreas audretsch',
      // Prominente Abgeordnete (distinctive names only)
      'anton hofreiter',
      'hofreiter',
      'paula piechotta',
      'piechotta',
      'omid nouripour',
      'nouripour',
      'lisa paus',
      'claudia roth',
      'katrin göring-eckardt',
      'göring-eckardt',
      'michael kellner',
      'ricarda lang',
      'steffi lemke',
      'anna lührmann',
      'lamya kaddor',
      'tarek al-wazir',
      'al-wazir',
      // Ex-Minister*innen (still prominent in media)
      'robert habeck',
      'annalena baerbock',
      'cem özdemir',
    ],
    excludePatterns: [
      'grünes licht',
      'grünen tisch',
      'grünen wasserstoff',
      'grüner wasserstoff',
      'grüner werden',
      'grüner wachsen',
      'grüne wiese',
      'grüne lunge',
      'grüne bohne',
      'grüne soße',
      'grüne sauce',
    ],
    summaryPrompt: 'Fasse zusammen, was die Medien aktuell über Bündnis 90/Die Grünen berichten.',
  },
  {
    id: 'gruene-at',
    label: 'Die Grünen',
    locale: 'at',
    keywords: [
      'die grünen',
      'der grünen',
      'den grünen',
      'grünen-',
      'grüne fordern',
      'grüne kritisieren',
      'grüne wollen',
      'werner kogler',
      'kogler',
      'leonore gewessler',
      'gewessler',
      'sigrid maurer',
      'eva blimlinger',
    ],
    excludePatterns: ['grünes licht', 'grünen tisch', 'grünen wasserstoff', 'grüner wasserstoff'],
    summaryPrompt:
      'Fasse zusammen, was die österreichischen Medien aktuell über Die Grünen in Österreich berichten.',
  },
];

export function getEntityForLocale(locale: MonitorLocale): WatcherEntity {
  return WATCHER_ENTITIES.find((e) => e.locale === locale) ?? WATCHER_ENTITIES[0];
}

export function getEntity(id: string): WatcherEntity | undefined {
  return WATCHER_ENTITIES.find((e) => e.id === id);
}
