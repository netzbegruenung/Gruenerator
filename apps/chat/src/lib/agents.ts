export interface AgentConfig {
  identifier: string;
  title: string;
  description: string;
  systemRole: string;
  avatar: string;
  backgroundColor: string;
  tags: string[];
  model: string;
  provider: 'mistral' | 'anthropic' | 'litellm';
  params: {
    max_tokens: number;
    temperature: number;
  };
  openingMessage: string;
  openingQuestions: string[];
  locale: string;
  author: string;
  plugins?: string[];
}

export function getDefaultAgent(): string {
  return 'gruenerator-universal';
}

// Static agent list for client-side use
export const agentsList: Pick<
  AgentConfig,
  'identifier' | 'title' | 'description' | 'avatar' | 'backgroundColor' | 'openingQuestions'
>[] = [
  {
    identifier: 'gruenerator-universal',
    title: 'Universal Assistent',
    description: 'Alle Textformen mit Programmsuche',
    avatar: '✨',
    backgroundColor: '#316049',
    openingQuestions: [
      'Schreibe einen Newsletter-Text zu unserer Klimaschutz-Initiative',
      'Erstelle eine Einladung zu unserer Mitgliederversammlung',
      'Verfasse einen Blogbeitrag über die Verkehrswende in unserer Stadt',
      'Schreibe einen Flyer-Text für den Infostand',
    ],
  },
  {
    identifier: 'gruene-oesterreich',
    title: 'Grüne Österreich Assistent',
    description: 'Texte für Die Grünen Österreich',
    avatar: '🇦🇹',
    backgroundColor: '#88B04B',
    openingQuestions: [
      'Schreibe einen Newsletter-Text zu unserer Klimaschutz-Initiative in Österreich',
      'Erstelle einen Instagram-Post zum Thema Verkehrswende',
      'Verfasse eine Pressemitteilung zur Energiepolitik',
      'Schreibe einen Flyer-Text für den nächsten Infostand',
    ],
  },
  {
    identifier: 'gruenerator-antrag',
    title: 'Antragsschreiber*in',
    description: 'Anträge & Anfragen',
    avatar: '📝',
    backgroundColor: '#316049',
    openingQuestions: [
      'Antrag: Die Stadt soll ein Konzept für mehr Stadtbäume erstellen',
      'Kleine Anfrage zur Umsetzung des Radverkehrskonzepts',
      'Große Anfrage zum Stand der Klimaneutralität in unserer Kommune',
      'Antrag auf Einrichtung eines Jugendparlaments',
    ],
  },
  {
    identifier: 'gruenerator-buergerservice',
    title: 'Bürgerservice',
    description: 'Bürgeranfragen beantworten',
    avatar: '💬',
    backgroundColor: '#316049',
    openingQuestions: [
      'Ein*e Bürger*in fragt, warum wir gegen den Ausbau der B-Straße gestimmt haben',
      'Anfrage zur grünen Position beim Thema Windkraftausbau',
      'Beschwerde über mangelnde Radwege - wie antworten?',
      'Frage einer*eines Bürger*in zu unserem Klimaschutzkonzept',
    ],
  },
  {
    identifier: 'gruenerator-gruene-jugend',
    title: 'Grüne Jugend',
    description: 'Aktivistischer Content',
    avatar: '✊',
    backgroundColor: '#46962b',
    openingQuestions: [
      'Instagram- und Twitter-Posts zur Klimademo am Freitag',
      'Reels-Skript zum Thema Mietenwahnsinn',
      'Aktionsideen für eine Kampagne gegen Rechtsextremismus',
      'TikTok-Text zur Erklärung des Mindestlohns',
    ],
  },
  {
    identifier: 'gruenerator-oeffentlichkeitsarbeit',
    title: 'Öffentlichkeitsarbeit',
    description: 'Presse & Social Media',
    avatar: '📢',
    backgroundColor: '#316049',
    openingQuestions: [
      'Pressemitteilung zur Verabschiedung unseres Klimaschutzkonzepts',
      'Instagram- und Facebook-Posts zum Thema Verkehrswende',
      'PM zu unserer Kritik am neuen Bebauungsplan',
      'LinkedIn-Post über unseren Erfolg im Stadtrat',
    ],
  },
  {
    identifier: 'gruenerator-rede-schreiber',
    title: 'Rede-Schreiber*in',
    description: 'Politische Reden',
    avatar: '🎤',
    backgroundColor: '#316049',
    openingQuestions: [
      'Rede für eine Stadtratssitzung zum Thema Klimaschutz',
      'Eröffnungsrede für ein Sommerfest des Ortsverbands',
      'Rede zur Haushaltsdebatte mit Fokus auf soziale Gerechtigkeit',
      'Kurze Ansprache (5 Min.) für eine Demo',
    ],
  },
  {
    identifier: 'gruenerator-wahlprogramm',
    title: 'Wahlprogramm',
    description: 'Programmkapitel',
    avatar: '📋',
    backgroundColor: '#316049',
    openingQuestions: [
      'Kapitel zum Thema Klimaschutz und Energie',
      'Wahlprogramm-Kapitel zu bezahlbarem Wohnen',
      'Kapitel zu Mobilität und Verkehrswende für unsere Kommune',
      'Kapitel über Bildung und Chancengleichheit',
    ],
  },
];
