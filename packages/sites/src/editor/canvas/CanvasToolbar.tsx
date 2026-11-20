import { SITE_ACTIONS_MAX, SITE_THEMES_MAX } from '@gruenerator/contracts';
import { cn } from '@gruenerator/shared/utils';
import { Button } from '@gruenerator/ui';
import { type ReactNode } from 'react';
import {
  FiArrowLeft,
  FiArrowRight,
  FiEyeOff,
  FiImage,
  FiPlus,
  FiSliders,
  FiTrash2,
  FiX,
} from 'react-icons/fi';

import { useDraft, useDraftActions, useDraftReader } from '../../draft/SiteDraftContext';
import { SECTION_LABELS, useEditorStore, type EditorSelection } from '../../stores/editorStore';

import { hiddenWith, imageTarget, isCardList, isOptionalSection } from './targets';
import { type AnchorRect } from './useAnchorRect';

const TOOLBAR_HEIGHT = 44;
const GAP = 8;

const CARD_NOUN = { themes: 'Thema', actions: 'Aktion' } as const;
const CARD_MAX = { themes: SITE_THEMES_MAX, actions: SITE_ACTIONS_MAX } as const;

function ToolButton({
  label,
  onClick,
  pressed,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      aria-label={label}
      title={label}
      className={cn('h-8 gap-1.5 px-2', pressed && 'bg-primary-50 dark:bg-primary-950')}
    >
      {children}
    </Button>
  );
}

function CardTools({
  selection,
}: {
  selection: EditorSelection & { section: 'themes' | 'actions' };
}) {
  const list = selection.section;
  const count = useDraft((d) => d[list].length);
  const readDraft = useDraftReader();
  const actions = useDraftActions();
  const select = useEditorStore((s) => s.select);
  const noun = CARD_NOUN[list];
  const index = selection.index;

  const move = (to: number) => {
    if (index === null) return;
    const id = readDraft()[list][index]?.id;
    if (!id) return;
    if (list === 'themes') actions.moveTheme(id, to);
    else actions.moveAction(id, to);
    select({ section: list, path: null, index: to });
  };
  const remove = () => {
    if (index === null) return;
    const id = readDraft()[list][index]?.id;
    if (!id) return;
    if (list === 'themes') actions.removeTheme(id);
    else actions.removeAction(id);
    select({ section: list, path: null, index: null });
  };
  const add = () => {
    const id = list === 'themes' ? actions.addTheme() : actions.addAction();
    if (id) select({ section: list, path: null, index: readDraft()[list].length - 1 });
  };

  return (
    <>
      {index !== null && (
        <>
          <ToolButton
            label={`${noun} nach links`}
            onClick={() => move(index - 1)}
            disabled={index === 0}
          >
            <FiArrowLeft aria-hidden="true" />
          </ToolButton>
          <ToolButton
            label={`${noun} nach rechts`}
            onClick={() => move(index + 1)}
            disabled={index >= count - 1}
          >
            <FiArrowRight aria-hidden="true" />
          </ToolButton>
          <ToolButton label={`${noun} entfernen`} onClick={remove}>
            <FiTrash2 aria-hidden="true" />
          </ToolButton>
        </>
      )}
      <ToolButton label={`${noun} hinzufügen`} onClick={add} disabled={count >= CARD_MAX[list]}>
        <FiPlus aria-hidden="true" />
        <span className="hidden sm:inline">{noun}</span>
      </ToolButton>
    </>
  );
}

/**
 * The floating toolbar over the selected part of the page. Text is edited in place; everything
 * else about the selection (image, cards, links, visibility) starts here.
 */
export function CanvasToolbar({
  selection,
  anchor,
  canvasWidth,
  canvasHeight,
}: {
  selection: EditorSelection;
  anchor: AnchorRect;
  canvasWidth: number;
  canvasHeight: number;
}) {
  const panel = useEditorStore((s) => s.elementPanel);
  const openElementPanel = useEditorStore((s) => s.openElementPanel);
  const select = useEditorStore((s) => s.select);
  const hidden = useDraft((d) => d.hidden);
  const { setField } = useDraftActions();
  const image = imageTarget(selection);
  const section = selection.section;
  const label =
    isCardList(section) && selection.index !== null
      ? `${CARD_NOUN[section]} ${selection.index + 1}`
      : SECTION_LABELS[section];

  // Above the anchor where there is room, else just inside its top edge; never off the canvas.
  const top = Math.min(
    Math.max(GAP, anchor.top - TOOLBAR_HEIGHT - GAP),
    Math.max(GAP, canvasHeight - TOOLBAR_HEIGHT - GAP)
  );
  const left = Math.min(Math.max(GAP, anchor.left), Math.max(GAP, canvasWidth - 360));

  const toggle = (next: 'details' | 'image') => openElementPanel(panel === next ? null : next);

  return (
    <div
      role="toolbar"
      aria-label={`Werkzeuge: ${label}`}
      style={{ top, left }}
      className="absolute z-20 flex max-w-[calc(100%-1rem)] items-center gap-0.5 overflow-x-auto rounded-lg border border-grey-200 bg-background-pure p-1 shadow-[0_4px_16px_rgba(0,0,0,0.12)] dark:border-grey-700"
    >
      <span className="px-2 text-sm font-semibold whitespace-nowrap text-foreground">{label}</span>
      <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-grey-200 dark:bg-grey-700" />
      {image && (
        <ToolButton label="Bild ändern" onClick={() => toggle('image')} pressed={panel === 'image'}>
          <FiImage aria-hidden="true" />
          <span className="hidden sm:inline">Bild</span>
        </ToolButton>
      )}
      {isCardList(section) && <CardTools selection={{ ...selection, section }} />}
      <ToolButton
        label={`${SECTION_LABELS[section]} bearbeiten`}
        onClick={() => toggle('details')}
        pressed={panel === 'details'}
      >
        <FiSliders aria-hidden="true" />
        <span className="hidden sm:inline">Bearbeiten</span>
      </ToolButton>
      {isOptionalSection(section) && (
        <ToolButton
          label={`${SECTION_LABELS[section]} ausblenden`}
          onClick={() => {
            setField('hidden', hiddenWith(hidden, section));
            select(null);
          }}
        >
          <FiEyeOff aria-hidden="true" />
        </ToolButton>
      )}
      <ToolButton label="Auswahl aufheben" onClick={() => select(null)}>
        <FiX aria-hidden="true" />
      </ToolButton>
    </div>
  );
}
