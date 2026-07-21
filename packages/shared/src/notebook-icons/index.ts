import {
  GiRaccoonHead,
  MdDiversity1,
  PiBank,
  PiBooks,
  PiCompass,
  PiCrown,
  PiFlag,
  PiFlowerLight,
  PiGlobe,
  PiLightbulb,
  PiListChecks,
  PiMagnifyingGlass,
  PiMapPin,
  PiNewspaper,
  PiScales,
  PiTree,
} from '../icons';
import { type NotebookId } from '../notebooks';

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
 * Typed as a plain const (with `satisfies Record<NotebookId, IconType>`): the `NotebookId`
 * union from `../notebooks` forces this map to cover *exactly* every registered notebook —
 * adding a notebook to the registry without an icon here is a compile error — while literal
 * indexing still yields `IconType`, not `IconType | undefined`.
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
  'abgeordnetenwatch-notebook': PiListChecks,
  'bayern-notebook': PiMapPin,
  'sachsen-anhalt-notebook': PiTree,
  'hessen-notebook': GiRaccoonHead,
  'saarland-notebook': PiMapPin,
  'boell-stiftung-notebook': PiLightbulb,
} satisfies Record<NotebookId, IconType>;

export type NotebookIconId = keyof typeof NOTEBOOK_ICONS;
