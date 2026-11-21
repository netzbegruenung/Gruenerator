import { Button } from '@gruenerator/ui';
import { FiX } from 'react-icons/fi';

import { FocalPointPicker } from '../../components/editor/common/FocalPointPicker';
import { ImageUpload } from '../../components/editor/common/ImageUpload';
import { useDraft, useDraftActions, useDraftReader } from '../../draft/SiteDraftContext';
import { useEditorStore, type EditorSelection } from '../../stores/editorStore';
import { SITE_BLOCK_UI } from '../blockUi';

import { BlockForm } from './BlockForm';
import { imageTarget, type ImageTarget } from './targets';

function ImageForm({ target }: { target: ImageTarget }) {
  const value = useDraft((d) => target.read(d));
  const actions = useDraftActions();
  const readDraft = useDraftReader();
  return (
    <div className="flex flex-col gap-sm">
      <ImageUpload
        value={value.url}
        onChange={(url) => target.write(actions, readDraft(), { url })}
        placeholder="Bild"
        aspectRatio={target.aspectRatio}
      />
      {value.url && (
        <FocalPointPicker
          src={value.url}
          value={value.focus}
          onChange={(focus) => target.write(actions, readDraft(), { focus })}
        />
      )}
    </div>
  );
}

/**
 * The floating panel beside the page for the selection: its image, or the block's form with
 * everything that is not text on the page (links, networks, Instagram, card details). Not a
 * popover: the media library opens its own dialog, which must not close this panel.
 */
export function ElementPanel({ selection }: { selection: EditorSelection }) {
  const panel = useEditorStore((s) => s.elementPanel);
  const close = useEditorStore((s) => s.openElementPanel);
  const readDraft = useDraftReader();
  const type = useDraft(
    (d) => d.blocks.find((block) => block.id === selection.blockId)?.type ?? null
  );
  const image = panel === 'image' ? imageTarget(selection, readDraft()) : null;
  if (!panel || !type || (panel === 'image' && !image)) return null;
  const title = panel === 'image' ? 'Bild' : SITE_BLOCK_UI[type].label;

  return (
    <aside
      aria-label={title}
      className="section-editor-panel absolute z-30 flex flex-col overflow-hidden rounded-xl border border-grey-200 bg-background-pure shadow-[0_10px_40px_rgba(0,0,0,0.18)] dark:border-grey-700 inset-x-2 bottom-2 max-h-[70%] sm:inset-x-auto sm:bottom-auto sm:top-4 sm:right-4 sm:w-[400px] sm:max-h-[calc(100%-2rem)]"
    >
      <div className="flex items-center justify-between gap-sm border-b border-grey-200 px-md py-sm dark:border-grey-700">
        {/* The block forms bring their own heading; only the image needs one here. */}
        {image ? (
          <h2 className="m-0 text-base font-semibold text-foreground">{title}</h2>
        ) : (
          <span />
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => close(null)}
          aria-label="Panel schließen"
        >
          <FiX aria-hidden="true" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-md">
        {image ? <ImageForm target={image} /> : <BlockForm blockId={selection.blockId} />}
      </div>
    </aside>
  );
}
