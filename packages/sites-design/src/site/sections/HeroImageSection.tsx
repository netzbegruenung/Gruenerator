/** @jsxRuntime automatic @jsxImportSource react */
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
import { SiteImage } from '../SiteImage.js';

export function HeroImageSection({
  ctx,
  place,
}: {
  ctx: SectionContext;
  place: Placement<'heroImage'>;
}) {
  const { snapshot, mode, copy } = ctx;
  const { anchor, block: band } = place;
  const imageUrl = band.imageUrl;
  const title = band.title.trim();
  const subtitle = band.subtitle.trim();
  const hasImage = imageUrl !== '';
  const imageField = blockField(band, 'imageUrl');
  const titleField = blockField(band, 'title');
  const subtitleField = blockField(band, 'subtitle');

  return (
    <Section
      ctx={ctx}
      place={place}
      className="site:relative site:isolate site:flex site:min-h-[clamp(22rem,50vw,36rem)] site:items-center site:overflow-hidden site:py-section"
    >
      {hasImage && (
        <>
          <SiteImage
            url={imageUrl}
            slot="banner"
            field={imageField}
            focus={band.imageFocus}
            className="site:absolute site:inset-0 site:-z-20"
          />
          <div
            aria-hidden="true"
            className="site:absolute site:inset-0 site:-z-10 site:bg-ground"
          />
        </>
      )}
      <div className={`${CONTAINER} site:text-center`}>
        {title !== '' || ctx.edit ? (
          <SectionHeading
            id={`${anchor}-titel`}
            field={titleField}
            center
            className="site:mx-auto site:max-w-[20ch] site:text-banner"
          >
            {editableText(ctx, titleField, copy.editBannerTitle, title)}
          </SectionHeading>
        ) : (
          <h2 id={`${anchor}-titel`} className="site:sr-only">
            {mode === 'preview' && !hasImage ? copy.emptyHeroImage : snapshot.site_title}
          </h2>
        )}
        {(subtitle !== '' || ctx.edit) && (
          <p
            data-field={subtitleField}
            className="site:mx-auto site:mt-6 site:max-w-[40ch] site:text-lead"
          >
            {editableText(ctx, subtitleField, copy.editBannerSubtitle, subtitle)}
          </p>
        )}
        {!hasImage && title === '' && !ctx.edit && (
          <Placeholder
            field={imageField}
            text={copy.emptyHeroImage}
            mode={ctx.mode}
            className="site:mx-auto site:max-w-prose"
          />
        )}
      </div>
    </Section>
  );
}
