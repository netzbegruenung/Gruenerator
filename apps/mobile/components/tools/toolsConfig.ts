import { type IoniconsIconName } from '@react-native-vector-icons/ionicons';

import { type AppRoute } from '../../types/routes';

export interface ToolDef {
  id: string;
  title: string;
  description: string;
  icon: IoniconsIconName;
  route: AppRoute;
}

/**
 * Single source of truth for the app's tools. Both the Tools tab (full set) and
 * the Start screen's "Werkzeuge" section (favorites only) render from this list,
 * so a tool is defined once and favorited by `id` via `useToolFavoritesStore`.
 */
export const TOOLS: ToolDef[] = [
  {
    id: 'reel',
    title: 'Reel',
    description: 'Untertitel für Clips',
    icon: 'videocam',
    route: '/(tabs)/(tools)/reel',
  },
  {
    id: 'ki-bildgenerierung',
    title: 'KI-Bild',
    description: 'KI-Bilder erstellen',
    icon: 'sparkles',
    route: '/(focused)/bild-editor',
  },
  {
    id: 'scanner',
    title: 'Scanner',
    description: 'Fotos zu Text',
    icon: 'scan',
    route: '/(tabs)/(tools)/scanner',
  },
  {
    id: 'vorlagen',
    title: 'Vorlagen',
    description: 'Design-Vorlagen',
    icon: 'albums',
    route: '/(tabs)/(tools)/vorlagen',
  },
  {
    id: 'agents',
    title: 'Agent*innen',
    description: 'Skills & Agenten',
    icon: 'people',
    route: '/(focused)/agents',
  },
];
