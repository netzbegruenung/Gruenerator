import { cn } from '@gruenerator/shared/utils';
import { Input, Textarea } from '@gruenerator/ui';

import { useDraft, useDraftActions } from '../../../draft/SiteDraftContext';
import { useSectionFocus } from '../../../hooks/useSectionFocus';
import { Field, SectionHeading } from '../common/Field';
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

export function HeroImageSectionEditor() {
  const { registerField, handleFieldFocus, handleFieldBlur } = useSectionFocus();
  const { setField } = useDraftActions();
  const imageUrl = useDraft((d) => d.heroImage.imageUrl);
  const title = useDraft((d) => d.heroImage.title);
  const subtitle = useDraft((d) => d.heroImage.subtitle);

  return (
    <div>
      <SectionHeading>Hero-Bild</SectionHeading>

      <div className="flex gap-6 items-stretch mb-5 max-[600px]:flex-col max-[600px]:items-center">
        <div className="shrink-0 basis-[120px] w-[120px] min-w-[120px] flex max-[600px]:w-[100px]">
          <ImageUpload
            value={imageUrl}
            onChange={(url) => setField('heroImage.imageUrl', url)}
            placeholder="Bild"
            size="fill"
          />
        </div>

        <div className="flex-1 min-w-0 flex flex-col">
          <Field
            panel="heroImage"
            path="sections.heroImage.title"
            htmlFor="heroimage-title"
            label="Hauptbotschaft"
          >
            <Input
              ref={(el) => registerField('heroImage', 'sections.heroImage.title', el)}
              id="heroimage-title"
              value={title}
              onChange={(e) => setField('heroImage.title', e.target.value)}
              onFocus={() => handleFieldFocus('heroImage', 'sections.heroImage.title')}
              onBlur={handleFieldBlur}
              placeholder="Gemeinsam für eine nachhaltige Zukunft!"
              maxLength={MAX_TITLE_LENGTH}
            />
            <Counter length={title.length} max={MAX_TITLE_LENGTH} />
          </Field>

          <Field
            panel="heroImage"
            path="sections.heroImage.subtitle"
            htmlFor="heroimage-subtitle"
            label="Untertitel"
          >
            <Textarea
              ref={(el) => registerField('heroImage', 'sections.heroImage.subtitle', el)}
              id="heroimage-subtitle"
              value={subtitle}
              onChange={(e) => setField('heroImage.subtitle', e.target.value)}
              onFocus={() => handleFieldFocus('heroImage', 'sections.heroImage.subtitle')}
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
