import { SITE_BLOCKS_MAX, siteBlockSpec, type SiteBlockType } from '@gruenerator/contracts';
import { cn } from '@gruenerator/shared/utils';
import { Button } from '@gruenerator/ui';
import { type ReactNode } from 'react';
import {
  FiArrowDown,
  FiArrowLeft,
  FiArrowRight,
  FiArrowUp,
  FiCopy,
  FiEye,
  FiEyeOff,
  FiImage,
  FiPlus,
  FiSliders,
  FiTrash2,
  FiX,
} from 'react-icons/fi';

import { useDraft, useDraftActions, useDraftReader } from '../../draft/SiteDraftContext';
import { useEditorStore, type EditorSelection } from '../../stores/editorStore';
import { SITE_BLOCK_UI } from '../blockUi';

import { imageTarget } from './targets';
import { type AnchorRect } from './useAnchorRect';

const TOOLBAR_HEIGHT = 44;
/** Rough width of the widest toolbar, to keep it on the canvas. */
const TOOLBAR_WIDTH = 520;
/** The element panel's width (400px) plus its margin. */
const PANEL_SPACE = 432;
const GAP = 8;

type ListType = 'themes' | 'actions';
const CARD_NOUN = { themes: 'Thema', actions: 'Aktion' } as const;
const isListType = (type: SiteBlockType): type is ListType =>
  type === 'themes' || type === 'actions';

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

function CardTools({ selection, type }: { selection: EditorSelection; type: ListType }) {
  const { blockId, itemId } = selection;
  const ids = useDraft((d) => {
    const block = d.blocks.find((entry) => entry.id === blockId);
    return block && 'items' in block ? block.items.map((item) => item.id) : [];
  });
  const actions = useDraftActions();
  const select = useEditorStore((s) => s.select);
  const noun = CARD_NOUN[type];
  const index = itemId === null ? -1 : ids.indexOf(itemId);

  const move = (to: number) => {
    if (itemId === null) return;
    actions.moveItem(blockId, itemId, to);
    select({ blockId, itemId, path: null });
  };
  const remove = () => {
    if (itemId === null) return;
    actions.removeItem(blockId, itemId);
    select({ blockId, itemId: null, path: null });
  };
  const add = () => {
    const id = actions.addItem(blockId);
    if (id) select({ blockId, itemId: id, path: null });
  };

  return (
    <>
      {index !== -1 && (
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
            disabled={index >= ids.length - 1}
          >
            <FiArrowRight aria-hidden="true" />
          </ToolButton>
          <ToolButton label={`${noun} entfernen`} onClick={remove}>
            <FiTrash2 aria-hidden="true" />
          </ToolButton>
        </>
      )}
      <ToolButton
        label={`${noun} hinzufügen`}
        onClick={add}
        disabled={ids.length >= siteBlockSpec(type).itemMax}
      >
        <FiPlus aria-hidden="true" />
        <span className="hidden sm:inline">{noun}</span>
      </ToolButton>
    </>
  );
}

/** Move, copy, hide and delete for any block but the profile, which is pinned on top. */
function BlockTools({
  blockId,
  type,
  label,
}: {
  blockId: string;
  type: SiteBlockType;
  label: string;
}) {
  const actions = useDraftActions();
  const select = useEditorStore((s) => s.select);
  const index = useDraft((d) => d.blocks.findIndex((block) => block.id === blockId));
  const count = useDraft((d) => d.blocks.length);
  const sameType = useDraft((d) => d.blocks.filter((block) => block.type === type).length);
  const hidden = useDraft((d) => d.blocks[index]?.hidden === true);
  const { max } = siteBlockSpec(type);
  const canCopy = count < SITE_BLOCKS_MAX && (max === null || sameType < max);

  return (
    <>
      <ToolButton
        label={`${label} nach oben`}
        onClick={() => actions.moveBlock(blockId, index - 1)}
        disabled={index <= 1}
      >
        <FiArrowUp aria-hidden="true" />
      </ToolButton>
      <ToolButton
        label={`${label} nach unten`}
        onClick={() => actions.moveBlock(blockId, index + 1)}
        disabled={index >= count - 1}
      >
        <FiArrowDown aria-hidden="true" />
      </ToolButton>
      <ToolButton
        label={`${label} doppeln`}
        onClick={() => {
          const copy = actions.duplicateBlock(blockId);
          if (copy) select({ blockId: copy, itemId: null, path: null });
        }}
        disabled={!canCopy}
      >
        <FiCopy aria-hidden="true" />
      </ToolButton>
      <ToolButton
        label={`${label} ${hidden ? 'einblenden' : 'ausblenden'}`}
        onClick={() => actions.setBlockHidden(blockId, !hidden)}
        pressed={hidden}
      >
        {hidden ? <FiEye aria-hidden="true" /> : <FiEyeOff aria-hidden="true" />}
      </ToolButton>
      <ToolButton
        label={`${label} löschen`}
        onClick={() => {
          if (actions.removeBlock(blockId)) select(null);
        }}
      >
        <FiTrash2 aria-hidden="true" />
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
  const readDraft = useDraftReader();
  const type = useDraft(
    (d) => d.blocks.find((block) => block.id === selection.blockId)?.type ?? null
  );
  const itemIndex = useDraft((d) => {
    const block = d.blocks.find((entry) => entry.id === selection.blockId);
    return block && 'items' in block && selection.itemId !== null
      ? block.items.findIndex((item) => item.id === selection.itemId)
      : -1;
  });
  if (!type) return null;
  const image = imageTarget(selection, readDraft());
  const blockLabel = SITE_BLOCK_UI[type].label;
  const label =
    isListType(type) && itemIndex !== -1 ? `${CARD_NOUN[type]} ${itemIndex + 1}` : blockLabel;

  // Above the anchor where there is room, else just inside its top edge; never off the canvas.
  const top = Math.min(
    Math.max(GAP, anchor.top - TOOLBAR_HEIGHT - GAP),
    Math.max(GAP, canvasHeight - TOOLBAR_HEIGHT - GAP)
  );
  // An open panel sits at the right edge (from `sm` up); keep the toolbar clear of it.
  const reserved = panel && canvasWidth >= 640 ? PANEL_SPACE : 0;
  const left = Math.min(
    Math.max(GAP, anchor.left),
    Math.max(GAP, canvasWidth - reserved - TOOLBAR_WIDTH)
  );

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
      {isListType(type) && <CardTools selection={selection} type={type} />}
      <ToolButton
        label={`${blockLabel} bearbeiten`}
        onClick={() => toggle('details')}
        pressed={panel === 'details'}
      >
        <FiSliders aria-hidden="true" />
        <span className="hidden sm:inline">Bearbeiten</span>
      </ToolButton>
      {!siteBlockSpec(type).pinned && (
        <BlockTools blockId={selection.blockId} type={type} label={blockLabel} />
      )}
      <ToolButton label="Auswahl aufheben" onClick={() => select(null)}>
        <FiX aria-hidden="true" />
      </ToolButton>
    </div>
  );
}
