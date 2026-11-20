/** @jsxRuntime automatic @jsxImportSource react */
import { isRichTextDocEmpty } from '@gruenerator/contracts';

import { sectionGround } from '../../model/grounds.js';
import { SECTION_ANCHORS } from '../../model/visibility.js';
import {
  CONTAINER,
  editableText,
  Section,
  type SectionContext,
  SectionHeading,
} from '../layout.js';
import { Placeholder } from '../Placeholder.js';
import { SiteRichText } from '../SiteRichText.js';

export function AboutSection({ ctx }: { ctx: SectionContext }) {
  const { snapshot, copy } = ctx;
  const anchor = SECTION_ANCHORS.about;
  const about = snapshot.sections.about;
  const title = about?.title.trim() || copy.aboutDefault;
  const content = about && !isRichTextDocEmpty(about.content) ? about.content : null;

  return (
    <Section
      section="about"
      anchor={anchor}
      ground={sectionGround(snapshot.variant, 'about', snapshot.locale)}
      className="site:py-section"
    >
      <div className={`${CONTAINER} site:grid site:gap-8 site:md:grid-cols-12 site:lg:gap-x-8`}>
        <div className="site:md:col-span-5">
          <SectionHeading id={`${anchor}-titel`} field="sections.about.title">
            {editableText(ctx, 'sections.about.title', copy.aboutDefault, title)}
          </SectionHeading>
        </div>
        <div className="site:text-lead site:md:col-span-7 site:md:pt-[1.625rem]">
          {ctx.edit ? (
            <div
              data-rich-text=""
              data-field="sections.about.content"
              className="site:max-w-prose site:hyphens-auto"
            >
              {ctx.edit.richText('sections.about.content', copy.emptyAbout)}
            </div>
          ) : content ? (
            <SiteRichText content={content} headingOffset={1} field="sections.about.content" />
          ) : (
            <Placeholder field="sections.about.content" text={copy.emptyAbout} mode={ctx.mode} />
          )}
        </div>
      </div>
    </Section>
  );
}
