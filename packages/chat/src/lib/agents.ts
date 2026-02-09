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

export const agentsList: Pick<
  AgentConfig,
  'identifier' | 'title' | 'description' | 'avatar' | 'backgroundColor' | 'openingQuestions'
>[] = [
  {
    identifier: 'gruenerator-universal',
    title: 'Universal Assistent',
    description: 'Alle Textformen mit Programmsuche',
    avatar: '\u2728',
    backgroundColor: '#316049',
    openingQuestions: [
      'Schreibe einen Newsletter-Text zu unserer Klimaschutz-Initiative',
      'Erstelle eine Einladung zu unserer Mitgliederversammlung',
      'Verfasse einen Blogbeitrag \u00fcber die Verkehrswende in unserer Stadt',
      'Schreibe einen Flyer-Text f\u00fcr den Infostand',
    ],
  },
  {
    identifier: 'gruene-oesterreich',
    title: 'Gr\u00fcne \u00d6sterreich Assistent',
    description: 'Texte f\u00fcr Die Gr\u00fcnen \u00d6sterreich',
    avatar: '\ud83c\udde6\ud83c\uddf9',
    backgroundColor: '#88B04B',
    openingQuestions: [
      'Schreibe einen Newsletter-Text zu unserer Klimaschutz-Initiative in \u00d6sterreich',
      'Erstelle einen Instagram-Post zum Thema Verkehrswende',
      'Verfasse eine Pressemitteilung zur Energiepolitik',
      'Schreibe einen Flyer-Text f\u00fcr den n\u00e4chsten Infostand',
    ],
  },
  {
    identifier: 'gruenerator-antrag',
    title: 'Antragsschreiber*in',
    description: 'Antr\u00e4ge & Anfragen',
    avatar: '\ud83d\udcdd',
    backgroundColor: '#316049',
    openingQuestions: [
      'Antrag: Die Stadt soll ein Konzept f\u00fcr mehr Stadtb\u00e4ume erstellen',
      'Kleine Anfrage zur Umsetzung des Radverkehrskonzepts',
      'Gro\u00dfe Anfrage zum Stand der Klimaneutralit\u00e4t in unserer Kommune',
      'Antrag auf Einrichtung eines Jugendparlaments',
    ],
  },
  {
    identifier: 'gruenerator-buergerservice',
    title: 'B\u00fcrgerservice',
    description: 'B\u00fcrgeranfragen beantworten',
    avatar: '\ud83d\udcac',
    backgroundColor: '#316049',
    openingQuestions: [
      'Ein*e B\u00fcrger*in fragt, warum wir gegen den Ausbau der B-Stra\u00dfe gestimmt haben',
      'Anfrage zur gr\u00fcnen Position beim Thema Windkraftausbau',
      'Beschwerde \u00fcber mangelnde Radwege - wie antworten?',
      'Frage einer*eines B\u00fcrger*in zu unserem Klimaschutzkonzept',
    ],
  },
  {
    identifier: 'gruenerator-gruene-jugend',
    title: 'Gr\u00fcne Jugend',
    description: 'Aktivistischer Content',
    avatar: '\u270a',
    backgroundColor: '#46962b',
    openingQuestions: [
      'Instagram- und Twitter-Posts zur Klimademo am Freitag',
      'Reels-Skript zum Thema Mietenwahnsinn',
      'Aktionsideen f\u00fcr eine Kampagne gegen Rechtsextremismus',
      'TikTok-Text zur Erkl\u00e4rung des Mindestlohns',
    ],
  },
  {
    identifier: 'gruenerator-oeffentlichkeitsarbeit',
    title: '\u00d6ffentlichkeitsarbeit',
    description: 'Presse & Social Media',
    avatar: '\ud83d\udce2',
    backgroundColor: '#316049',
    openingQuestions: [
      'Pressemitteilung zur Verabschiedung unseres Klimaschutzkonzepts',
      'Instagram- und Facebook-Posts zum Thema Verkehrswende',
      'PM zu unserer Kritik am neuen Bebauungsplan',
      'LinkedIn-Post \u00fcber unseren Erfolg im Stadtrat',
    ],
  },
  {
    identifier: 'gruenerator-rede-schreiber',
    title: 'Rede-Schreiber*in',
    description: 'Politische Reden',
    avatar: '\ud83c\udf99\ufe0f',
    backgroundColor: '#316049',
    openingQuestions: [
      'Rede f\u00fcr eine Stadtratssitzung zum Thema Klimaschutz',
      'Er\u00f6ffnungsrede f\u00fcr ein Sommerfest des Ortsverbands',
      'Rede zur Haushaltsdebatte mit Fokus auf soziale Gerechtigkeit',
      'Kurze Ansprache (5 Min.) f\u00fcr eine Demo',
    ],
  },
  {
    identifier: 'gruenerator-wahlprogramm',
    title: 'Wahlprogramm',
    description: 'Programmkapitel',
    avatar: '\ud83d\udccb',
    backgroundColor: '#316049',
    openingQuestions: [
      'Kapitel zum Thema Klimaschutz und Energie',
      'Wahlprogramm-Kapitel zu bezahlbarem Wohnen',
      'Kapitel zu Mobilit\u00e4t und Verkehrswende f\u00fcr unsere Kommune',
      'Kapitel \u00fcber Bildung und Chancengleichheit',
    ],
  },
];
