import { Ionicons } from '@react-native-vector-icons/ionicons';
import { type IconProps } from 'phosphor-react-native';
import { BankIcon } from 'phosphor-react-native/src/icons/Bank';
import { BicycleIcon } from 'phosphor-react-native/src/icons/Bicycle';
import { BirdIcon } from 'phosphor-react-native/src/icons/Bird';
import { BookOpenTextIcon } from 'phosphor-react-native/src/icons/BookOpenText';
import { BuildingsIcon } from 'phosphor-react-native/src/icons/Buildings';
import { CalendarBlankIcon } from 'phosphor-react-native/src/icons/CalendarBlank';
import { ChartBarIcon } from 'phosphor-react-native/src/icons/ChartBar';
import { ChatsCircleIcon } from 'phosphor-react-native/src/icons/ChatsCircle';
import { EnvelopeIcon } from 'phosphor-react-native/src/icons/Envelope';
import { FileTextIcon } from 'phosphor-react-native/src/icons/FileText';
import { FlagIcon } from 'phosphor-react-native/src/icons/Flag';
import { GlobeSimpleIcon } from 'phosphor-react-native/src/icons/GlobeSimple';
import { HandHeartIcon } from 'phosphor-react-native/src/icons/HandHeart';
import { HandshakeIcon } from 'phosphor-react-native/src/icons/Handshake';
import { HeartIcon } from 'phosphor-react-native/src/icons/Heart';
import { HouseIcon } from 'phosphor-react-native/src/icons/House';
import { ImageIcon } from 'phosphor-react-native/src/icons/Image';
import { ImagesSquareIcon } from 'phosphor-react-native/src/icons/ImagesSquare';
import { LeafIcon } from 'phosphor-react-native/src/icons/Leaf';
import { LightbulbIcon } from 'phosphor-react-native/src/icons/Lightbulb';
import { MagnifyingGlassIcon } from 'phosphor-react-native/src/icons/MagnifyingGlass';
import { MegaphoneIcon } from 'phosphor-react-native/src/icons/Megaphone';
import { MicrophoneIcon } from 'phosphor-react-native/src/icons/Microphone';
import { NewspaperIcon } from 'phosphor-react-native/src/icons/Newspaper';
import { PencilSimpleIcon } from 'phosphor-react-native/src/icons/PencilSimple';
import { ProjectorScreenChartIcon } from 'phosphor-react-native/src/icons/ProjectorScreenChart';
import { RocketLaunchIcon } from 'phosphor-react-native/src/icons/RocketLaunch';
import { ScalesIcon } from 'phosphor-react-native/src/icons/Scales';
import { ScrollIcon } from 'phosphor-react-native/src/icons/Scroll';
import { SparkleIcon } from 'phosphor-react-native/src/icons/Sparkle';
import { SquaresFourIcon } from 'phosphor-react-native/src/icons/SquaresFour';
import { StudentIcon } from 'phosphor-react-native/src/icons/Student';
import { SunIcon } from 'phosphor-react-native/src/icons/Sun';
import { TableIcon } from 'phosphor-react-native/src/icons/Table';
import { TrainIcon } from 'phosphor-react-native/src/icons/Train';
import { TreeIcon } from 'phosphor-react-native/src/icons/Tree';
import { UsersThreeIcon } from 'phosphor-react-native/src/icons/UsersThree';
import { VideoCameraIcon } from 'phosphor-react-native/src/icons/VideoCamera';
import { WindIcon } from 'phosphor-react-native/src/icons/Wind';
import { type ComponentType } from 'react';

import { agentIcon } from '../chat/sidebarIcons';

type Glyph = ComponentType<IconProps>;

/**
 * Die Phosphor-Symbole, die die App mitbringt — dieselben Glyphen wie im Web,
 * wo `iconKey` ein react-icons-Name ist (`PiSparkle`).
 *
 * Bewusst eine Auswahl und nicht das ganze Paket: Metro schüttelt keine
 * ungenutzten Exporte ab, und alle ~1500 Symbole in sechs Strichstärken wären
 * rund 7 MB JS (1,1 MB gzip) in jedem OTA-Update — gemessen 15.10.2026 an
 * `phosphor-react-native@3.0.6`. Darum Einzel-Imports über den Paket-Export
 * `./src/icons/*`. Wer im Web ein Symbol außerhalb dieser Liste wählt, sieht
 * mobil das passende Ionicon (`agentIcon`), schlimmstenfalls das Funkeln.
 *
 * Enthalten: alle `SUGGESTED_AGENT_ICONS` (die schlägt der KI-Entwurf vor, also
 * tragen die meisten eigenen Agents eines davon), die Konzept-Symbole der
 * System-Agents (`AGENT_ICON_KEYS`, Zuordnung wie `packages/chat/src/lib/agentIcons.ts`)
 * und ein paar Themen-Symbole für den Picker.
 */
export const PHOSPHOR_GLYPHS = {
  PiSparkle: SparkleIcon,
  PiMegaphone: MegaphoneIcon,
  PiNewspaper: NewspaperIcon,
  PiMagnifyingGlass: MagnifyingGlassIcon,
  PiChatsCircle: ChatsCircleIcon,
  PiBuildings: BuildingsIcon,
  PiTree: TreeIcon,
  PiLeaf: LeafIcon,
  PiUsersThree: UsersThreeIcon,
  PiCalendarBlank: CalendarBlankIcon,
  PiImage: ImageIcon,
  PiGlobeSimple: GlobeSimpleIcon,
  PiBookOpenText: BookOpenTextIcon,
  PiMicrophone: MicrophoneIcon,
  PiHandHeart: HandHeartIcon,
  PiBird: BirdIcon,
  PiFileText: FileTextIcon,
  PiLightbulb: LightbulbIcon,
  PiHeart: HeartIcon,
  PiRocketLaunch: RocketLaunchIcon,
  PiBank: BankIcon,
  PiImagesSquare: ImagesSquareIcon,
  PiProjectorScreenChart: ProjectorScreenChartIcon,
  PiScales: ScalesIcon,
  PiSquaresFour: SquaresFourIcon,
  PiTable: TableIcon,
  PiEnvelope: EnvelopeIcon,
  PiPencilSimple: PencilSimpleIcon,
  PiChartBar: ChartBarIcon,
  PiHouse: HouseIcon,
  PiBicycle: BicycleIcon,
  PiTrain: TrainIcon,
  PiSun: SunIcon,
  PiWind: WindIcon,
  PiFlag: FlagIcon,
  PiStudent: StudentIcon,
  PiHandshake: HandshakeIcon,
  PiScroll: ScrollIcon,
  PiVideoCamera: VideoCameraIcon,
} as const satisfies Record<string, Glyph>;

export type PhosphorGlyphKey = keyof typeof PHOSPHOR_GLYPHS;

/** System-Agents tragen Konzept-Schlüssel (`hand-heart`), keine Komponentennamen. */
const CONCEPT_GLYPHS: Readonly<Record<string, PhosphorGlyphKey>> = {
  sparkle: 'PiSparkle',
  megaphone: 'PiMegaphone',
  buildings: 'PiBuildings',
  'magnifying-glass': 'PiMagnifyingGlass',
  'chats-circle': 'PiChatsCircle',
  microphone: 'PiMicrophone',
  'book-open-text': 'PiBookOpenText',
  'hand-heart': 'PiHandHeart',
  'file-text': 'PiFileText',
  bird: 'PiBird',
  image: 'PiImage',
  'image-square': 'PiImagesSquare',
  'layout-grid': 'PiSquaresFour',
  table: 'PiTable',
  'projector-screen-chart': 'PiProjectorScreenChart',
  scales: 'PiScales',
  bank: 'PiBank',
};

/**
 * `PiSparkleFill` → Komponente + Strichstärke. react-icons hängt die Stärke an
 * den Namen; Phosphor-RN nimmt sie als Prop.
 */
const WEIGHT_SUFFIXES = ['Bold', 'Fill', 'Duotone', 'Light', 'Thin'] as const;
type Weight = NonNullable<IconProps['weight']>;

export function resolvePhosphorGlyph(
  iconKey: string | null | undefined
): { glyph: Glyph; weight: Weight } | null {
  if (!iconKey) return null;
  const concept = CONCEPT_GLYPHS[iconKey];
  if (concept) return { glyph: PHOSPHOR_GLYPHS[concept], weight: 'regular' };
  for (const suffix of WEIGHT_SUFFIXES) {
    if (iconKey.endsWith(suffix)) {
      const base = iconKey.slice(0, -suffix.length);
      if (base in PHOSPHOR_GLYPHS)
        return {
          glyph: PHOSPHOR_GLYPHS[base as PhosphorGlyphKey],
          weight: suffix.toLowerCase() as Weight,
        };
    }
  }
  return iconKey in PHOSPHOR_GLYPHS
    ? { glyph: PHOSPHOR_GLYPHS[iconKey as PhosphorGlyphKey], weight: 'regular' }
    : null;
}

/** Das Symbol eines Agents oder Rezepts — Phosphor wie im Web, sonst Ionicon. */
export function AgentGlyph({
  iconKey,
  size,
  color,
}: {
  iconKey: string | null | undefined;
  size: number;
  color: string;
}) {
  const resolved = resolvePhosphorGlyph(iconKey);
  if (resolved) {
    const Glyph = resolved.glyph;
    return <Glyph size={size} color={color} weight={resolved.weight} />;
  }
  return <Ionicons name={agentIcon(iconKey ?? undefined)} size={size} color={color} />;
}
