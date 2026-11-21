/** @jsxRuntime automatic @jsxImportSource react */
import { stripGreeting } from '@gruenerator/contracts';

import { sectionGround } from '../../model/grounds.js';
import { SECTION_ANCHORS } from '../../model/visibility.js';
import { CONTAINER, editableText, Section, type SectionContext } from '../layout.js';
import { PortraitPlaceholder } from '../PortraitPlaceholder.js';
import { SiteImage } from '../SiteImage.js';
import { SocialLinks } from '../SocialLinks.js';

const anchor = SECTION_ANCHORS.hero;
const headingId = `${anchor}-titel`;

/** Party line, greeting with the name, tagline and social links: the same in both layouts. */
function HeroText({ ctx }: { ctx: SectionContext }) {
  const { snapshot, mode, copy } = ctx;
  // Legacy rows may already store the greeting in the title: never greet twice.
  const name = stripGreeting(snapshot.site_title.trim());
  const tagline = snapshot.tagline.trim();

  return (
    <>
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
    </>
  );
}

export function HeroSection({ ctx }: { ctx: SectionContext }) {
  return ctx.snapshot.sections.heroLayout === 'vollbild' ? (
    <FullBleedHero ctx={ctx} />
  ) : (
    <PortraitHero ctx={ctx} />
  );
}

function PortraitHero({ ctx }: { ctx: SectionContext }) {
  const { snapshot, mode } = ctx;

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
          <HeroText ctx={ctx} />
        </div>

        <div className="site:relative site:order-first site:md:order-none site:md:col-start-2 site:md:row-start-1">
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
      </div>
    </Section>
  );
}

/**
 * Variant 2: the portrait fills the hero, the text sits on a dark gradient at the bottom left.
 * Without a portrait the hero is the deep green ground.
 */
function FullBleedHero({ ctx }: { ctx: SectionContext }) {
  const { snapshot, mode } = ctx;
  const hasImage = snapshot.profile_image !== '';
  const focus = snapshot.sections.profileImageFocus;

  return (
    <Section
      section="hero"
      anchor={anchor}
      ground={hasImage ? 'photo' : 'deep'}
      // The photo ground is transparent: while the portrait loads (or fails), the white text
      // would sit on the page's paper. The deeper green keeps it readable until then.
      className="site:relative site:isolate site:bg-[var(--site-palette-deeper)] site:flex site:min-h-[min(88svh,56rem)] site:items-end site:overflow-hidden site:pt-hero site:pb-section"
    >
      {hasImage ? (
        <>
          <SiteImage
            url={snapshot.profile_image}
            slot="heroBackdrop"
            field="profile_image"
            focus={focus}
            // A portrait cut to a wide frame keeps the face: without a chosen point, aim high.
            className={`site:absolute site:inset-0 site:-z-20 ${focus ? '' : 'site:[&_img]:object-[50%_20%]'}`}
          />
          <div
            aria-hidden="true"
            className="site:absolute site:inset-0 site:-z-10 site:bg-[linear-gradient(to_top,rgb(0_0_0/0.72),rgb(0_0_0/0.35)_45%,rgb(0_0_0/0.05)_75%)]"
          />
        </>
      ) : (
        <div
          data-field="profile_image"
          {...(mode === 'preview' ? { 'data-empty': '' } : {})}
          className="site:absolute site:inset-0 site:-z-10"
        />
      )}
      <div className={`${CONTAINER} site:w-full`}>
        <div className="site:max-w-[40rem] site:min-w-0">
          <HeroText ctx={ctx} />
        </div>
      </div>
    </Section>
  );
}
