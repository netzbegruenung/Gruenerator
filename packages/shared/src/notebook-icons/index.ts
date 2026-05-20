import { MdDiversity1 } from 'react-icons/md';
import {
  PiBank,
  PiBooks,
  PiCompass,
  PiFlag,
  PiFlowerLight,
  PiGlobe,
  PiLightbulb,
  PiMagnifyingGlass,
  PiMapPin,
  PiNewspaper,
  PiScales,
  PiTree,
} from 'react-icons/pi';

import type { IconType } from 'react-icons';

/**
 * Single source of truth for `notebook-id → icon`.
 *
 * Consumed by both `apps/web` (notebooksConfig.ts) and `packages/chat`
 * (mentionables.ts) so the visual identity of a notebook stays in sync across
 * the notebook gallery, sidebar favourites, group shared-content, and the chat
 * mention picker.
 *
 * Exposed ONLY via the dedicated `@gruenerator/shared/notebook-icons` subpath —
 * deliberately never re-exported from the package barrel or `./agents`, so the
 * backend (which imports `@gruenerator/shared`) never pulls in `react-icons`.
 *
 * Typed as a plain const (with `satisfies`) rather than `Record<string, IconType>`
 * so consumers indexing by a literal id get `IconType`, not `IconType | undefined`.
 */
export const NOTEBOOK_ICONS = {
  'gruenerator-notebook': PiMagnifyingGlass,
  'gruene-notebook': PiBooks,
  'bundestagsfraktion-notebook': PiBank,
  'hamburg-notebook': PiCompass,
  'schleswig-holstein-notebook': PiMapPin,
  'thueringen-notebook': PiTree,
  'berlin-notebook': MdDiversity1,
  'mecklenburg-vorpommern-notebook': PiFlag,
  'brandenburg-notebook': PiFlowerLight,
  'oesterreich-notebook': PiGlobe,
  'kommunalwiki-notebook': PiScales,
  'gruenblog-notebook': PiNewspaper,
  'bayern-notebook': PiMapPin,
  'boell-stiftung-notebook': PiLightbulb,
} satisfies Record<string, IconType>;

export type NotebookIconId = keyof typeof NOTEBOOK_ICONS;
