import {
  Globe,
  Leaf,
  TrendingUp,
  Heart,
  Shield,
  Stethoscope,
  Flag,
  Monitor,
  GraduationCap,
  Wallet,
  Scale,
  Briefcase,
  Train,
} from 'lucide-react';

import type { LucideIcon } from 'lucide-react';

export type TopicCategory =
  | 'migration'
  | 'klima'
  | 'wirtschaft'
  | 'soziales'
  | 'sicherheit'
  | 'gesundheit'
  | 'europa'
  | 'digital'
  | 'bildung'
  | 'finanzen'
  | 'justiz'
  | 'arbeit'
  | 'mobilitaet';

export interface TopicInfo {
  name: string;
  description: string;
  icon: LucideIcon;
  color: string;
  barColor: string;
  dotColor: string;
}

export const TOPIC_COLORS: Record<string, string> = {
  migration: '#f59e0b',
  klima: '#22c55e',
  wirtschaft: '#3b82f6',
  soziales: '#ec4899',
  sicherheit: '#6366f1',
  gesundheit: '#14b8a6',
  europa: '#8b5cf6',
  digital: '#06b6d4',
  bildung: '#f97316',
  finanzen: '#eab308',
  justiz: '#78716c',
  arbeit: '#84cc16',
  mobilitaet: '#0ea5e9',
};

export const TOPIC_CONFIG: Record<TopicCategory, TopicInfo> = {
  migration: {
    name: 'Migration',
    description: 'Flucht, Asyl, Einwanderung',
    icon: Globe,
    color: 'text-amber-500',
    barColor: 'bg-amber-500',
    dotColor: 'bg-amber-500',
  },
  klima: {
    name: 'Klima & Umwelt',
    description: 'Klimaschutz, Energie, Nachhaltigkeit',
    icon: Leaf,
    color: 'text-green-500',
    barColor: 'bg-green-500',
    dotColor: 'bg-green-500',
  },
  wirtschaft: {
    name: 'Wirtschaft',
    description: 'Unternehmen, Industrie, Handel',
    icon: TrendingUp,
    color: 'text-blue-500',
    barColor: 'bg-blue-500',
    dotColor: 'bg-blue-500',
  },
  soziales: {
    name: 'Soziales',
    description: 'Rente, Familie, Armut',
    icon: Heart,
    color: 'text-pink-500',
    barColor: 'bg-pink-500',
    dotColor: 'bg-pink-500',
  },
  sicherheit: {
    name: 'Sicherheit',
    description: 'Polizei, Verteidigung, Terrorismus',
    icon: Shield,
    color: 'text-indigo-500',
    barColor: 'bg-indigo-500',
    dotColor: 'bg-indigo-500',
  },
  gesundheit: {
    name: 'Gesundheit',
    description: 'Krankenhaus, Pflege, Medizin',
    icon: Stethoscope,
    color: 'text-teal-500',
    barColor: 'bg-teal-500',
    dotColor: 'bg-teal-500',
  },
  europa: {
    name: 'Europa/Außen',
    description: 'EU, Außenpolitik, Ukraine',
    icon: Flag,
    color: 'text-violet-500',
    barColor: 'bg-violet-500',
    dotColor: 'bg-violet-500',
  },
  digital: {
    name: 'Digitales & Medien',
    description: 'Internet, Daten, Technologie',
    icon: Monitor,
    color: 'text-cyan-500',
    barColor: 'bg-cyan-500',
    dotColor: 'bg-cyan-500',
  },
  bildung: {
    name: 'Bildung',
    description: 'Schule, Universität, Forschung',
    icon: GraduationCap,
    color: 'text-orange-500',
    barColor: 'bg-orange-500',
    dotColor: 'bg-orange-500',
  },
  finanzen: {
    name: 'Finanzen',
    description: 'Steuern, Haushalt, Schulden',
    icon: Wallet,
    color: 'text-yellow-500',
    barColor: 'bg-yellow-500',
    dotColor: 'bg-yellow-500',
  },
  justiz: {
    name: 'Justiz/Recht',
    description: 'Gerichte, Gesetze, Verfassung',
    icon: Scale,
    color: 'text-stone-500',
    barColor: 'bg-stone-500',
    dotColor: 'bg-stone-500',
  },
  arbeit: {
    name: 'Arbeit',
    description: 'Lohn, Gewerkschaft, Beschäftigung',
    icon: Briefcase,
    color: 'text-lime-500',
    barColor: 'bg-lime-500',
    dotColor: 'bg-lime-500',
  },
  mobilitaet: {
    name: 'Mobilität',
    description: 'Verkehr, Bahn, Auto, ÖPNV',
    icon: Train,
    color: 'text-sky-500',
    barColor: 'bg-sky-500',
    dotColor: 'bg-sky-500',
  },
};
