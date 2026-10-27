// SPDX-License-Identifier: MPL-2.0
/**
 * Was das Kontextmenü zeigt, als reine Funktion des Ziels. Die Namen und
 * Kürzel kommen aus dem Befehlsregister, die Fähigkeiten aus denselben Fragen,
 * die die Leiste stellt (`selectionCapabilities`) — Menü und Leiste können
 * nicht auseinanderlaufen.
 */

import { messages } from '@ggraphic/editor/i18n/messages';
import {
  CANVAS_COMMANDS,
  ariaShortcut,
  formatShortcut,
  shortcutOf,
  type CanvasCommandId,
} from '@ggraphic/editor/utils/canvasCommandRegistry';

import type { BackgroundControls } from '../../configs/types';
import type { FloatingModuleState } from '../../hooks/useFloatingModuleState';
import type { SelectionCapabilities } from '../../utils/selectionCapabilities';

/** Was eine Seite beim Öffnen des Menüs über sich sagt — gelesen, nicht aus einem Render. */
export interface CanvasMenuSnapshot {
  selection: readonly string[];
  module: FloatingModuleState | null;
  caps: SelectionCapabilities;
  canSelectAll: boolean;
  isCropping: boolean;
  /** Die Hintergrund-Steuerung dieser Seite, an ihren Zustand gebunden. */
  background: BackgroundControls | null;
}

export type CanvasMenuKind = 'element' | 'multi' | 'background' | 'page';

export interface CanvasMenuEnv {
  isMac: boolean;
  /** Ob der Rechtsklick auf der Bühne lag — nur dann gibt es „Hier einfügen“. */
  hasPoint: boolean;
  hasClipboard: boolean;
  pageIndex: number;
  pageCount: number;
  canAddPage: boolean;
  /** Der Editor hat einen Bereich „Bild bearbeiten“. */
  canEditImage: boolean;
}

export type CanvasMenuEntry =
  | {
      kind: 'item';
      id: CanvasCommandId;
      label: string;
      shortcut: string | null;
      ariaShortcut: string | null;
      disabled: boolean;
      destructive: boolean;
    }
  | { kind: 'check'; id: CanvasCommandId; label: string; checked: boolean }
  | { kind: 'sub'; label: string; entries: CanvasMenuEntry[] }
  | { kind: 'label'; label: string }
  | { kind: 'separator' };

export interface CanvasMenu {
  kind: CanvasMenuKind;
  /** Der Name des Menüs für Screenreader („Element“, „3 Elemente“, „Seite 2“). */
  label: string;
  entries: CanvasMenuEntry[];
}

export function menuKindOf(snapshot: CanvasMenuSnapshot): CanvasMenuKind {
  if (snapshot.selection.length > 1) return 'multi';
  if (snapshot.selection.length === 0) return 'page';
  const type = snapshot.module?.type;
  if (type === 'background' || (type === 'image' && snapshot.module?.data.isPhoto)) {
    return 'background';
  }
  return 'element';
}

export function buildCanvasMenu(snapshot: CanvasMenuSnapshot, env: CanvasMenuEnv): CanvasMenu {
  const { caps } = snapshot;
  const item = (
    id: CanvasCommandId,
    options: { disabled?: boolean; destructive?: boolean; label?: string } = {}
  ): CanvasMenuEntry => {
    const shortcut = shortcutOf(id);
    return {
      kind: 'item',
      id,
      label: options.label ?? CANVAS_COMMANDS[id].label,
      shortcut: shortcut ? formatShortcut(shortcut, env.isMac) : null,
      ariaShortcut: shortcut ? ariaShortcut(shortcut, env.isMac) : null,
      disabled: options.disabled ?? false,
      destructive: options.destructive ?? false,
    };
  };
  const separator: CanvasMenuEntry = { kind: 'separator' };

  const paste = (): CanvasMenuEntry[] => [
    item('paste', { disabled: !env.hasClipboard }),
    ...(env.hasPoint ? [item('pasteHere', { disabled: !env.hasClipboard })] : []),
  ];
  const lock = (): CanvasMenuEntry[] =>
    caps.canLock
      ? [
          item('toggleLock', {
            label:
              caps.lock === 'all' ? messages().contextMenu.unlock : messages().commands.toggleLock,
          }),
        ]
      : [];
  const selectAll = () => item('selectAll', { disabled: !snapshot.canSelectAll });
  /** Einzeln an der Seite, mehrere an der Auswahl; Verteilen braucht drei. */
  const align = (multi: boolean): CanvasMenuEntry[] =>
    caps.canAlign
      ? [
          {
            kind: 'sub',
            label: messages().contextMenu.align,
            entries: [
              item('alignLeft'),
              item('alignCenterH'),
              item('alignRight'),
              item('alignTop'),
              item('alignMiddle'),
              item('alignBottom'),
              ...(multi
                ? [
                    separator,
                    item('distributeHorizontal', { disabled: !caps.canDistribute }),
                    item('distributeVertical', { disabled: !caps.canDistribute }),
                  ]
                : []),
            ],
          },
        ]
      : [];
  /**
   * Drehen & Spiegeln. Zurücksetzen nur, wenn es etwas zurückzusetzen gibt;
   * bei mehreren kennen die Fähigkeiten keine Drehung (`rotation: null`) —
   * dort steht es immer, sobald sich die Auswahl drehen lässt.
   */
  const orient = (): CanvasMenuEntry[] => {
    if (!caps.canRotate) return [];
    const entries = [
      ...(caps.canFlip ? [item('flipHorizontal'), item('flipVertical')] : []),
      ...(caps.rotation !== 0 ? [item('resetRotation')] : []),
    ];
    return entries.length
      ? [{ kind: 'sub', label: messages().contextMenu.rotateAndFlip, entries }]
      : [];
  };
  const page = (): CanvasMenuEntry[] => [
    item('duplicatePage', { disabled: !env.canAddPage }),
    ...(env.pageCount > 1 ? [item('deletePage', { destructive: true })] : []),
  ];

  const kind = menuKindOf(snapshot);
  const pageLabel = messages().common.page(env.pageIndex + 1);

  if (kind === 'multi') {
    return {
      kind,
      label: messages().common.elements(caps.count),
      entries: compact([
        { kind: 'label', label: messages().common.elements(caps.count) },
        item('copy', { disabled: !caps.canCopy }),
        item('cut', { disabled: !caps.canCopy || !caps.canDelete }),
        item('duplicate', { disabled: !caps.canCopy }),
        item('delete', { disabled: !caps.canDelete, destructive: true }),
        separator,
        ...orient(),
        ...align(true),
        ...lock(),
        separator,
        ...paste(),
        selectAll(),
      ]),
    };
  }

  if (kind === 'page') {
    return {
      kind,
      label: pageLabel,
      entries: compact([...paste(), selectAll(), separator, ...page()]),
    };
  }

  if (kind === 'background') {
    const bg = snapshot.background;
    const hasImage = !!bg?.currentImageSrc;
    return {
      kind,
      label: messages().contextMenu.background,
      entries: compact([
        ...(bg?.onImageChange
          ? [
              hasImage
                ? item('replaceBackground')
                : item('replaceBackground', { label: messages().contextMenu.backgroundImage }),
            ]
          : []),
        ...(hasImage && snapshot.module?.data.canCrop ? [item('cropBackground')] : []),
        ...(hasImage && bg?.onImageChange ? [item('removeBackground', { destructive: true })] : []),
        ...(hasImage && env.canEditImage ? [item('editImage')] : []),
        separator,
        ...paste(),
        selectAll(),
        separator,
        ...page(),
      ]),
    };
  }

  const type = snapshot.module?.type;
  const own: CanvasMenuEntry[] = [];
  if (caps.canEditText) own.push(item('editText', { disabled: snapshot.isCropping }));
  if (type === 'user-image' && env.canEditImage) own.push(item('editImage'));
  if (type === 'frame') own.push(item('insertFrameImage'));

  return {
    kind,
    label: messages().common.element,
    entries: compact([
      ...own,
      separator,
      item('copy', { disabled: !caps.canCopy }),
      item('cut', { disabled: !caps.canCopy || !caps.canDelete }),
      ...paste(),
      item('duplicate', { disabled: !caps.canCopy }),
      item('delete', { disabled: !caps.canDelete, destructive: true }),
      separator,
      {
        kind: 'sub',
        label: messages().contextMenu.layer,
        entries: [
          item('bringToFront', { disabled: !caps.canBringForward }),
          item('bringForward', { disabled: !caps.canBringForward }),
          item('sendBackward', { disabled: !caps.canSendBackward }),
          item('sendToBack', { disabled: !caps.canSendBackward }),
        ],
      },
      ...orient(),
      ...align(false),
      ...lock(),
      separator,
      selectAll(),
    ]),
  };
}

/** Keine Trennlinie am Rand und keine zwei hintereinander. */
function compact(entries: CanvasMenuEntry[]): CanvasMenuEntry[] {
  const out: CanvasMenuEntry[] = [];
  const last = () => out[out.length - 1];
  for (const entry of entries) {
    if (entry.kind === 'separator' && (out.length === 0 || last()?.kind === 'separator')) {
      continue;
    }
    out.push(entry);
  }
  while (last()?.kind === 'separator') out.pop();
  return out;
}
