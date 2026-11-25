import { FocalPointPicker } from '../../components/editor/common/FocalPointPicker';
import { ImageUpload } from '../../components/editor/common/ImageUpload';
import { useDraft, useDraftActions, useDraftReader } from '../../draft/SiteDraftContext';
import { type EditorSelection, type ElementPanel } from '../../stores/editorStore';

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
 * The form for the selection in the sidebar: its image, or the block's form with everything that
 * is not text on the page (links, networks, Instagram, card details).
 */
export function SelectionForm({
  selection,
  panel,
}: {
  selection: EditorSelection;
  panel: ElementPanel;
}) {
  const readDraft = useDraftReader();
  if (panel === 'image') {
    const image = imageTarget(selection, readDraft());
    return image ? <ImageForm target={image} /> : null;
  }
  return <BlockForm blockId={selection.blockId} />;
}
