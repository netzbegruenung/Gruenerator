import { type TrashItem, type TrashKind } from '@gruenerator/contracts';
import { type IconType } from 'react-icons';
import {
  PiBrain,
  PiChatCircle,
  PiCookingPot,
  PiEnvelope,
  PiFile,
  PiFileText,
  PiFilmStrip,
  PiFloppyDisk,
  PiGlobe,
  PiImage,
  PiKanban,
  PiLayout,
  PiHeadphones,
  PiLightbulb,
  PiLightning,
  PiNotebook,
  PiPresentation,
  PiReceipt,
  PiRepeat,
  PiRobot,
  PiSpeakerHigh,
  PiSticker,
  PiTable,
  PiUsersThree,
  PiVideo,
} from 'react-icons/pi';

/** Label per storage kind; the Select offers these, a row refines two of them by `subtype`. */
export const TRASH_KIND_LABELS: Record<TrashKind, string> = {
  collaborative_document: 'Dokument',
  chat_thread: 'Chat',
  notebook: 'Notebook',
  document: 'Quelle',
  shared_media: 'Medium',
  subtitler_project: 'Reel',
  user_agent: 'Agent',
  user_template: 'Vorlage',
  user_text_form: 'Rezept',
  custom_prompt: 'Prompt',
  user_site: 'Website',
  recurring_task: 'Wiederkehrende Aufgabe',
  user_letterhead: 'Briefkopf',
  user_document: 'Gespeicherter Text',
  user_knowledge: 'Wissen',
  group: 'Projekt',
  reisekosten_abrechnung: 'Reisekostenabrechnung',
  explainable: 'Explainable',
  podcast: 'Podcast',
  studio_asset: 'Sticker & Hintergründe',
};

export const TRASH_KIND_ICONS: Record<TrashKind, IconType> = {
  collaborative_document: PiFileText,
  chat_thread: PiChatCircle,
  notebook: PiNotebook,
  document: PiFile,
  shared_media: PiImage,
  subtitler_project: PiFilmStrip,
  user_agent: PiRobot,
  user_template: PiLayout,
  user_text_form: PiCookingPot,
  custom_prompt: PiLightning,
  user_site: PiGlobe,
  recurring_task: PiRepeat,
  user_letterhead: PiEnvelope,
  user_document: PiFloppyDisk,
  user_knowledge: PiBrain,
  group: PiUsersThree,
  reisekosten_abrechnung: PiReceipt,
  explainable: PiLightbulb,
  podcast: PiHeadphones,
  studio_asset: PiSticker,
};

interface SubtypeDisplay {
  label: string;
  icon: IconType;
}

/**
 * `document_subtype` of a collaborative document (COLLAB_SUBTYPE_VALUES in
 * @gruenerator/contracts). Every value not listed here is a text document.
 */
const COLLAB_SUBTYPES: Record<string, SubtypeDisplay> = {
  sheets: { label: 'Tabelle', icon: PiTable },
  tabelle: { label: 'Tabelle', icon: PiTable },
  presentations: { label: 'Präsentation', icon: PiPresentation },
  boards: { label: 'Board', icon: PiKanban },
  canvas: { label: 'Sharepic', icon: PiImage },
};

/** `media_type` of a shared media row. */
const MEDIA_SUBTYPES: Record<string, SubtypeDisplay> = {
  image: { label: 'Bild', icon: PiImage },
  video: { label: 'Video', icon: PiVideo },
  audio: { label: 'Audio', icon: PiSpeakerHigh },
  transfer: { label: 'Datei', icon: PiFile },
};

/** `kind` of a Studio gallery item. */
const STUDIO_ASSET_SUBTYPES: Record<string, SubtypeDisplay> = {
  sticker: { label: 'Sticker', icon: PiSticker },
  background: { label: 'Hintergrund', icon: PiImage },
};

/** Canvas-Zeilen im Folienformat sind Präsentationen, alle anderen Sharepics. */
const SLIDE_CANVAS_FORMAT = 'slide-16-9';

type TrashDisplayItem = Pick<TrashItem, 'kind' | 'subtype'> & Partial<Pick<TrashItem, 'format'>>;

function subtypeDisplay(item: TrashDisplayItem): SubtypeDisplay | null {
  if (!item.subtype) return null;
  if (
    item.kind === 'collaborative_document' &&
    item.subtype === 'canvas' &&
    item.format === SLIDE_CANVAS_FORMAT
  ) {
    return COLLAB_SUBTYPES.presentations;
  }
  if (item.kind === 'studio_asset') return STUDIO_ASSET_SUBTYPES[item.subtype] ?? null;
  if (item.kind === 'collaborative_document') return COLLAB_SUBTYPES[item.subtype] ?? null;
  if (item.kind === 'shared_media') return MEDIA_SUBTYPES[item.subtype] ?? null;
  return null;
}

export function trashItemLabel(item: TrashDisplayItem): string {
  return subtypeDisplay(item)?.label ?? TRASH_KIND_LABELS[item.kind];
}

export function trashItemIcon(item: TrashDisplayItem): IconType {
  return subtypeDisplay(item)?.icon ?? TRASH_KIND_ICONS[item.kind];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Calendar days until `purgeAt`, which the server computes — the client never knows the retention. */
export function purgeCountdown(purgeAt: string, now: Date = new Date()): string {
  const purge = new Date(purgeAt);
  if (purge.getTime() <= now.getTime()) return 'wird in Kürze endgültig gelöscht';
  // Round, not floor: a DST switch makes one day 23 or 25 hours long.
  const days = Math.round((startOfDay(purge) - startOfDay(now)) / DAY_MS);
  if (days <= 0) return 'wird heute endgültig gelöscht';
  if (days === 1) return 'wird morgen endgültig gelöscht';
  return `wird in ${days} Tagen endgültig gelöscht`;
}
