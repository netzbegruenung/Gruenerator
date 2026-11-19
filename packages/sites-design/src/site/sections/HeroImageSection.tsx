import { SECTION_ANCHORS } from '../../model/visibility.js';
import { CONTAINER, Section, type SectionContext, SectionHeading } from '../layout.js';
import { Placeholder } from '../Placeholder.js';
import { SiteImage } from '../SiteImage.js';

export function HeroImageSection({ ctx }: { ctx: SectionContext }) {
  const { snapshot, mode, copy } = ctx;
  const anchor = SECTION_ANCHORS.heroImage;
  const band = snapshot.sections.heroImage;
  const imageUrl = band?.imageUrl ?? '';
  const title = band?.title.trim() ?? '';
  const subtitle = band?.subtitle.trim() ?? '';
  const hasImage = imageUrl !== '';

  return (
    <Section
      section="heroImage"
      anchor={anchor}
      ground={hasImage ? 'photo' : 'deep'}
      className="site:relative site:isolate site:flex site:min-h-[clamp(22rem,50vw,36rem)] site:items-center site:overflow-hidden site:py-section"
    >
      {hasImage && (
        <>
          <SiteImage
            url={imageUrl}
            slot="banner"
            field="sections.heroImage.imageUrl"
            focus={band?.imageFocus}
            className="site:absolute site:inset-0 site:-z-20"
          />
          <div
            aria-hidden="true"
            className="site:absolute site:inset-0 site:-z-10 site:bg-ground"
          />
        </>
      )}
      <div className={`${CONTAINER} site:text-center`}>
        {title !== '' ? (
          <SectionHeading
            id={`${anchor}-titel`}
            field="sections.heroImage.title"
            center
            className="site:mx-auto site:max-w-[20ch] site:text-banner"
          >
            {title}
          </SectionHeading>
        ) : (
          <h2 id={`${anchor}-titel`} className="site:sr-only">
            {mode === 'preview' && !hasImage ? copy.emptyHeroImage : snapshot.site_title}
          </h2>
        )}
        {subtitle !== '' && (
          <p
            data-field="sections.heroImage.subtitle"
            className="site:mx-auto site:mt-6 site:max-w-[40ch] site:text-lead"
          >
            {subtitle}
          </p>
        )}
        {!hasImage && title === '' && (
          <Placeholder
            field="sections.heroImage.imageUrl"
            text={copy.emptyHeroImage}
            mode={ctx.mode}
            className="site:mx-auto site:max-w-prose"
          />
        )}
      </div>
    </Section>
  );
}
