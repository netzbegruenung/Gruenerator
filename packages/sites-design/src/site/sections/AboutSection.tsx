import { isRichTextDocEmpty } from '@gruenerator/contracts';

import { sectionGround } from '../../model/grounds.js';
import { SECTION_ANCHORS } from '../../model/visibility.js';
import { CONTAINER, Section, type SectionContext, SectionHeading } from '../layout.js';
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
      ground={sectionGround(snapshot.variant, 'about')}
      className="site:py-section"
    >
      <div className={`${CONTAINER} site:grid site:gap-8 site:md:grid-cols-12 site:lg:gap-x-8`}>
        <div className="site:md:col-span-5">
          <SectionHeading id={`${anchor}-titel`} field="sections.about.title">
            {title}
          </SectionHeading>
        </div>
        <div className="site:text-lead site:md:col-span-7 site:md:pt-[1.625rem]">
          {content ? (
            <SiteRichText content={content} headingOffset={1} field="sections.about.content" />
          ) : (
            <Placeholder field="sections.about.content" text={copy.emptyAbout} mode={ctx.mode} />
          )}
        </div>
      </div>
    </Section>
  );
}
