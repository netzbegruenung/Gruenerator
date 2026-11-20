/** @jsxRuntime automatic @jsxImportSource react */
import { stripGreeting } from '@gruenerator/contracts';

import { sectionGround } from '../../model/grounds.js';
import { SECTION_ANCHORS } from '../../model/visibility.js';
import { CONTAINER, editableText, Section, type SectionContext } from '../layout.js';
import { PortraitPlaceholder } from '../PortraitPlaceholder.js';
import { SiteImage } from '../SiteImage.js';
import { SocialLinks } from '../SocialLinks.js';

export function HeroSection({ ctx }: { ctx: SectionContext }) {
  const { snapshot, mode, copy, visible } = ctx;
  const anchor = SECTION_ANCHORS.hero;
  // Legacy rows may already store the greeting in the title: never greet twice.
  const name = stripGreeting(snapshot.site_title.trim());
  const tagline = snapshot.tagline.trim();
  const headingId = `${anchor}-titel`;

  return (
    <Section
      section="hero"
      anchor={anchor}
      ground={sectionGround(snapshot.variant, 'hero', snapshot.locale)}
      className="site:pt-hero site:pb-section"
    >
      <div
        className={`${CONTAINER} site:grid site:items-center site:gap-x-12 site:gap-y-10 site:md:grid-cols-[7fr_5fr]`}
      >
        <div className="site:min-w-0 site:md:col-start-1 site:md:row-start-1">
          <p className="site:mb-5 site:text-small site:font-[700] site:tracking-[0.08em] site:uppercase">
            {copy.partyShort}
          </p>
          {name === '' && mode === 'preview' && !ctx.edit ? (
            <h1
              id={headingId}
              data-field="site_title"
              data-empty=""
              className="site:rounded-card site:border-2 site:border-dashed site:border-current site:px-4 site:py-2 site:text-display site:text-heading"
            >
              {copy.emptyName}
            </h1>
          ) : (
            <h1
              id={headingId}
              className="site:text-display site:text-heading site:hyphens-manual site:wrap-anywhere"
            >
              {copy.heroGreeting}
              <span data-field="site_title">
                {editableText(ctx, 'site_title', copy.emptyName, name)}
              </span>
              !
            </h1>
          )}
          {(tagline !== '' || ctx.edit) && (
            <p
              data-field="tagline"
              className="site:mt-6 site:max-w-[32ch] site:text-lead site:wrap-anywhere"
            >
              {editableText(ctx, 'tagline', copy.editTagline, tagline)}
            </p>
          )}
          <SocialLinks links={snapshot.social_links} copy={copy} className="site:mt-8" />
        </div>

        <div className="site:relative site:order-first site:mr-3 site:mb-3 site:md:order-none site:md:col-start-2 site:md:row-start-1 site:md:mr-0">
          <div
            aria-hidden="true"
            className="site:absolute site:inset-0 site:translate-3 site:bg-accent"
          />
          {snapshot.profile_image !== '' ? (
            <SiteImage
              url={snapshot.profile_image}
              slot="portrait"
              field="profile_image"
              focus={snapshot.sections.profileImageFocus}
              className="site:relative site:aspect-[4/5] site:max-h-[70svh] site:w-full site:md:max-h-none"
            />
          ) : (
            <div
              data-field="profile_image"
              {...(mode === 'preview' ? { 'data-empty': '' } : {})}
              className="site:relative"
            >
              <PortraitPlaceholder className="site:aspect-[4/5] site:max-h-[70svh] site:w-full site:md:max-h-none" />
            </div>
          )}
        </div>

        {visible.includes('actions') && (
          <a
            href={`#${SECTION_ANCHORS.actions}`}
            className="site:relative site:z-10 site:flex site:size-30 site:-rotate-[7deg] site:items-center site:justify-center site:justify-self-start site:rounded-pill site:bg-signal site:p-3 site:text-center site:font-display site:text-[1.5rem] site:leading-[1] site:text-signal-ink site:md:col-start-2 site:md:row-start-1 site:md:-mb-6 site:md:-ml-10 site:md:self-end"
          >
            {copy.stoerer}
          </a>
        )}
      </div>
    </Section>
  );
}
