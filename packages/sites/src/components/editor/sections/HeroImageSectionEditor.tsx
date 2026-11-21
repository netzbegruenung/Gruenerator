import { cn } from '@gruenerator/shared/utils';
import { Input, Textarea } from '@gruenerator/ui';

import { useDraftActions, useDraftBlock } from '../../../draft/SiteDraftContext';
import { useFieldRegistry } from '../../../hooks/useFieldRegistry';
import { Field, SectionHeading } from '../common/Field';
import { FocalPointPicker } from '../common/FocalPointPicker';
import { ImageUpload } from '../common/ImageUpload';

const MAX_TITLE_LENGTH = 60;
const MAX_SUBTITLE_LENGTH = 200;

function Counter({ length, max }: { length: number; max: number }) {
  return (
    <div
      className={cn(
        'text-xs text-grey-500 dark:text-grey-400 text-right mt-1',
        length > max * 0.9 && 'text-yellow-600'
      )}
    >
      {length} / {max} Zeichen
    </div>
  );
}

export function HeroImageSectionEditor({ blockId }: { blockId: string }) {
  const { registerField, handleFieldFocus, handleFieldBlur } = useFieldRegistry();
  const { setBlockField } = useDraftActions();
  const block = useDraftBlock(blockId, 'heroImage');
  if (!block) return null;
  const { imageUrl, title, subtitle } = block;
  const imageFocus = block.imageFocus ?? null;
  const set = (patch: Parameters<typeof setBlockField<'heroImage'>>[2]) =>
    setBlockField(blockId, 'heroImage', patch);
  const titlePath = `blocks.${blockId}.title`;
  const subtitlePath = `blocks.${blockId}.subtitle`;

  return (
    <div>
      <SectionHeading>Hero-Bild</SectionHeading>

      <div className="flex gap-6 items-stretch mb-5 max-[600px]:flex-col max-[600px]:items-center">
        <div className="shrink-0 basis-[120px] w-[120px] min-w-[120px] flex flex-col max-[600px]:w-[100px]">
          <ImageUpload
            value={imageUrl}
            onChange={(url) => set({ imageUrl: url })}
            placeholder="Bild"
            size="fill"
          />
          {imageUrl && (
            <FocalPointPicker
              src={imageUrl}
              value={imageFocus}
              onChange={(focus) => set({ imageFocus: focus })}
            />
          )}
        </div>

        <div className="flex-1 min-w-0 flex flex-col">
          <Field
            panel={blockId}
            path={titlePath}
            htmlFor={`${blockId}-title`}
            label="Hauptbotschaft"
          >
            <Input
              ref={(el) => registerField(titlePath, el)}
              id={`${blockId}-title`}
              value={title}
              onChange={(e) => set({ title: e.target.value })}
              onFocus={() => handleFieldFocus(blockId, titlePath)}
              onBlur={handleFieldBlur}
              placeholder="Gemeinsam für eine nachhaltige Zukunft!"
              maxLength={MAX_TITLE_LENGTH}
            />
            <Counter length={title.length} max={MAX_TITLE_LENGTH} />
          </Field>

          <Field
            panel={blockId}
            path={subtitlePath}
            htmlFor={`${blockId}-subtitle`}
            label="Untertitel"
          >
            <Textarea
              ref={(el) => registerField(subtitlePath, el)}
              id={`${blockId}-subtitle`}
              value={subtitle}
              onChange={(e) => set({ subtitle: e.target.value })}
              onFocus={() => handleFieldFocus(blockId, subtitlePath)}
              onBlur={handleFieldBlur}
              placeholder="Ein unterstützender Satz zu deiner Hauptbotschaft..."
              rows={2}
              maxLength={MAX_SUBTITLE_LENGTH}
            />
            <Counter length={subtitle.length} max={MAX_SUBTITLE_LENGTH} />
          </Field>
        </div>
      </div>
    </div>
  );
}
