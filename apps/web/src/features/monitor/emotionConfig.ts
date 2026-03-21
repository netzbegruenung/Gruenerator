import { Flame, HandHeart, Heart, Shield, Sparkles, TrendingDown, Trophy } from 'lucide-react';

import type { LucideIcon } from 'lucide-react';

export interface EmotionConfig {
  name: string;
  icon: LucideIcon;
  hue: string;
  comms: string;
  valence: 'positive' | 'negative';
}

export const EMOTION_CONFIG: Record<string, EmotionConfig> = {
  angst: {
    name: 'Angst',
    icon: Shield,
    hue: 'red',
    comms: 'Beruhigen. Kompetenz zeigen.',
    valence: 'negative',
  },
  wut: {
    name: 'Wut',
    icon: Flame,
    hue: 'orange',
    comms: 'Wut kanalisieren oder Distanz wahren.',
    valence: 'negative',
  },
  hoffnung: {
    name: 'Hoffnung',
    icon: Sparkles,
    hue: 'green',
    comms: 'Verstärken. Eigene Marke verbinden.',
    valence: 'positive',
  },
  enttaeuschung: {
    name: 'Enttäuschung',
    icon: TrendingDown,
    hue: 'blue',
    comms: 'Alternative sein.',
    valence: 'negative',
  },
  vertrauen: {
    name: 'Vertrauen',
    icon: HandHeart,
    hue: 'violet',
    comms: 'Mutige Vorschläge machen.',
    valence: 'positive',
  },
  solidaritaet: {
    name: 'Solidarität',
    icon: Heart,
    hue: 'emerald',
    comms: 'Koalitionsaufbau. Gemeinsam.',
    valence: 'positive',
  },
  stolz: {
    name: 'Stolz',
    icon: Trophy,
    hue: 'yellow',
    comms: 'Erfolge beanspruchen.',
    valence: 'positive',
  },
};

export const EMOTION_KEYS = Object.keys(EMOTION_CONFIG);

export function getMoodPosition(overall: Record<string, number>): number {
  let positive = 0;
  let negative = 0;
  for (const [key, score] of Object.entries(overall)) {
    const config = EMOTION_CONFIG[key];
    if (!config) continue;
    if (config.valence === 'positive') positive += score;
    else negative += score;
  }
  const total = positive + negative;
  if (total === 0) return 50;
  return (positive / total) * 100;
}
