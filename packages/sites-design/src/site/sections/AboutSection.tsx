/** @jsxRuntime automatic @jsxImportSource react */
import { isRichTextDocEmpty } from '@gruenerator/contracts';

import {
  blockField,
  CONTAINER,
  editableText,
  type Placement,
  Section,
  type SectionContext,
  SectionHeading,
} from '../layout.js';
import { Placeholder } from '../Placeholder.js';
import { SiteRichText } from '../SiteRichText.js';

export function AboutSection({ ctx, place }: { ctx: SectionContext; place: Placement<'about'> }) {
  const { copy } = ctx;
  const { anchor, block: about } = place;
  const title = about.title.trim() || copy.aboutDefault;
  const content = !isRichTextDocEmpty(about.content) ? about.content : null;
  const titleField = blockField(about, 'title');
  const contentField = blockField(about, 'content');

  return (
    <Section ctx={ctx} place={place} className="site:py-section">
      <div className={`${CONTAINER} site:grid site:gap-8 site:md:grid-cols-12 site:lg:gap-x-8`}>
        <div className="site:md:col-span-5">
          <SectionHeading id={`${anchor}-titel`} field={titleField}>
            {editableText(ctx, titleField, copy.aboutDefault, title)}
          </SectionHeading>
        </div>
        <div className="site:text-lead site:md:col-span-7 site:md:pt-[1.625rem]">
          {ctx.edit ? (
            <div
              data-rich-text=""
              data-field={contentField}
              className="site:max-w-prose site:hyphens-auto"
            >
              {ctx.edit.richText(contentField, copy.emptyAbout)}
            </div>
          ) : content ? (
            <SiteRichText content={content} headingOffset={1} field={contentField} />
          ) : (
            <Placeholder field={contentField} text={copy.emptyAbout} mode={ctx.mode} />
          )}
        </div>
      </div>
    </Section>
  );
}
