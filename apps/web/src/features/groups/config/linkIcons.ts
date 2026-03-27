import { Globe } from 'lucide-react';
import {
  HiCalendar,
  HiChat,
  HiDocument,
  HiFolder,
  HiLink,
  HiMail,
  HiMap,
  HiPhone,
  HiVideoCamera,
} from 'react-icons/hi';
import {
  SiCanva,
  SiDiscord,
  SiFigma,
  SiGithub,
  SiGoogledrive,
  SiGooglemeet,
  SiInstagram,
  SiMastodon,
  SiMattermost,
  SiMiro,
  SiNextcloud,
  SiNotion,
  SiSignal,
  SiSlack,
  SiTelegram,
  SiTrello,
  SiWhatsapp,
  SiX,
  SiYoutube,
  SiZoom,
} from 'react-icons/si';

import type { IconType } from 'react-icons';

export interface LinkIconEntry {
  key: string;
  label: string;
  icon: IconType;
}

export const LINK_ICONS: LinkIconEntry[] = [
  { key: 'globe', label: 'Webseite', icon: Globe },
  { key: 'link', label: 'Link', icon: HiLink },
  { key: 'signal', label: 'Signal', icon: SiSignal },
  { key: 'whatsapp', label: 'WhatsApp', icon: SiWhatsapp },
  { key: 'telegram', label: 'Telegram', icon: SiTelegram },
  { key: 'discord', label: 'Discord', icon: SiDiscord },
  { key: 'slack', label: 'Slack', icon: SiSlack },
  { key: 'mattermost', label: 'Mattermost', icon: SiMattermost },
  { key: 'canva', label: 'Canva', icon: SiCanva },
  { key: 'figma', label: 'Figma', icon: SiFigma },
  { key: 'miro', label: 'Miro', icon: SiMiro },
  { key: 'drive', label: 'Drive', icon: SiGoogledrive },
  { key: 'nextcloud', label: 'Nextcloud', icon: SiNextcloud },
  { key: 'notion', label: 'Notion', icon: SiNotion },
  { key: 'trello', label: 'Trello', icon: SiTrello },
  { key: 'github', label: 'GitHub', icon: SiGithub },
  { key: 'zoom', label: 'Zoom', icon: SiZoom },
  { key: 'googlemeet', label: 'Meet', icon: SiGooglemeet },
  { key: 'youtube', label: 'YouTube', icon: SiYoutube },
  { key: 'instagram', label: 'Instagram', icon: SiInstagram },
  { key: 'mastodon', label: 'Mastodon', icon: SiMastodon },
  { key: 'linkedin', label: 'LinkedIn', icon: HiLink },
  { key: 'x', label: 'X', icon: SiX },
  { key: 'mail', label: 'E-Mail', icon: HiMail },
  { key: 'calendar', label: 'Kalender', icon: HiCalendar },
  { key: 'chat', label: 'Chat', icon: HiChat },
  { key: 'phone', label: 'Telefon', icon: HiPhone },
  { key: 'video', label: 'Video', icon: HiVideoCamera },
  { key: 'document', label: 'Dokument', icon: HiDocument },
  { key: 'folder', label: 'Ordner', icon: HiFolder },
  { key: 'map', label: 'Karte', icon: HiMap },
];

const iconMap = new Map(LINK_ICONS.map((entry) => [entry.key, entry]));

export function getLinkIcon(key: string): IconType {
  return iconMap.get(key)?.icon ?? Globe;
}

export function getLinkIconEntry(key: string): LinkIconEntry {
  return iconMap.get(key) ?? LINK_ICONS[0];
}

/**
 * Detects the best icon key for a given URL based on domain patterns.
 * Falls back to 'globe' for unknown URLs.
 */
const URL_ICON_PATTERNS: [RegExp, string][] = [
  [/signal\.(org|group|me)/i, 'signal'],
  [/wa\.me|whatsapp\.com|chat\.whatsapp/i, 'whatsapp'],
  [/t\.me|telegram\.(org|me)/i, 'telegram'],
  [/discord\.(gg|com)/i, 'discord'],
  [/slack\.com/i, 'slack'],
  [/mattermost\./i, 'mattermost'],
  [/canva\.com/i, 'canva'],
  [/figma\.com/i, 'figma'],
  [/miro\.com/i, 'miro'],
  [/drive\.google\.com/i, 'drive'],
  [/docs\.google\.com/i, 'document'],
  [/meet\.google\.com/i, 'googlemeet'],
  [/calendar\.google\.com|outlook\..*\/calendar/i, 'calendar'],
  [/nextcloud\.|wolke\./i, 'nextcloud'],
  [/notion\.so|notion\.site/i, 'notion'],
  [/trello\.com/i, 'trello'],
  [/github\.com|gitlab\.com/i, 'github'],
  [/zoom\.(us|com)/i, 'zoom'],
  [/youtube\.com|youtu\.be/i, 'youtube'],
  [/instagram\.com/i, 'instagram'],
  [/mastodon\.|gruene\.social|social\./i, 'mastodon'],
  [/linkedin\.com/i, 'linkedin'],
  [/(^https?:\/\/(www\.)?(x|twitter)\.com)/i, 'x'],
  [/mailto:/i, 'mail'],
  [/tel:/i, 'phone'],
  [/maps\.google|google\..*\/maps|openstreetmap/i, 'map'],
];

export function detectIconFromUrl(url: string): string {
  for (const [pattern, key] of URL_ICON_PATTERNS) {
    if (pattern.test(url)) return key;
  }
  return 'globe';
}

/**
 * Suggests a title based on URL domain patterns.
 * Returns the matched service label, or null if no known service detected.
 */
export function detectTitleFromUrl(url: string): string | null {
  const iconKey = detectIconFromUrl(url);
  if (iconKey === 'globe') return null;
  return getLinkIconEntry(iconKey).label;
}
