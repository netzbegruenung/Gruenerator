/** @jsxRuntime automatic @jsxImportSource react */
import { sectionGround } from '../../model/grounds.js';
import { safeHref } from '../../model/links.js';
import { SECTION_ANCHORS } from '../../model/visibility.js';
import {
  CONTAINER,
  editableText,
  Section,
  type SectionContext,
  SectionHeading,
} from '../layout.js';
import { Placeholder } from '../Placeholder.js';
import { SiteImage } from '../SiteImage.js';

const TILE_LINK =
  'site:after:absolute site:after:inset-0 site:after:z-10 site:focus-visible:outline-none site:focus-visible:after:outline-3 site:focus-visible:after:-outline-offset-3 site:focus-visible:after:outline-solid site:focus-visible:after:outline-[color:var(--site-color-focus)]';

/**
 * The tiles follow "Aktiv werden" on gruene.de: a 4:5 photo under a 30 % black veil, the title
 * centred on it in the display face, the photo easing in on hover. Without a photo the tile is
 * the deep green ground.
 */
export function ActionsSection({ ctx }: { ctx: SectionContext }) {
  const { snapshot, copy, visible } = ctx;
  const liveAnchors = visible.map((id) => `#${SECTION_ANCHORS[id]}`);
  const anchor = SECTION_ANCHORS.actions;
  const actions = snapshot.sections.actions ?? [];

  return (
    <Section
      section="actions"
      anchor={anchor}
      ground={sectionGround(snapshot.variant, 'actions', snapshot.locale)}
      className="site:py-section"
    >
      <div className={CONTAINER}>
        <div className="site:mb-8 site:sm:mb-14">
          <SectionHeading id={`${anchor}-titel`}>{copy.actionsHeading}</SectionHeading>
        </div>
        {actions.length === 0 ? (
          <Placeholder field="sections.actions" text={copy.emptyActions} mode={ctx.mode} />
        ) : (
          <ul
            data-field="sections.actions"
            className="site:grid site:gap-8 site:sm:grid-cols-3 site:sm:gap-14"
          >
            {actions.map((action, i) => {
              const safe = safeHref(action.link);
              // While editing, the tile is no link: its stretched ::after would take every click
              // meant for the text. The link itself is edited in the section form.
              const href =
                ctx.edit || (safe?.startsWith('#') && !liveAnchors.includes(safe)) ? null : safe;
              const text = (
                <span data-field={`sections.actions.${i}.text`}>
                  {editableText(
                    ctx,
                    `sections.actions.${i}.text`,
                    copy.navActions,
                    action.text.trim() || copy.navActions
                  )}
                </span>
              );
              return (
                <li
                  key={i}
                  data-index={i}
                  data-ground={action.imageUrl ? 'photo' : 'deep'}
                  className="site:group/tile site:relative site:isolate site:aspect-[4/5] site:overflow-hidden site:bg-[var(--site-palette-deep)]"
                >
                  <SiteImage
                    url={action.imageUrl}
                    slot="tile"
                    field={`sections.actions.${i}.imageUrl`}
                    focus={action.imageFocus}
                    className="site:absolute site:inset-0 site:-z-10 site:after:absolute site:after:inset-0 site:after:bg-[rgb(0_0_0/0.3)] site:motion-safe:[&_img]:transition-transform site:motion-safe:[&_img]:duration-500 site:motion-safe:group-has-[a:hover]/tile:[&_img]:scale-105"
                  />
                  <div className="site:flex site:size-full site:items-center site:justify-center site:p-5">
                    <p className="site:min-w-0 site:text-center site:font-display site:text-tile site:leading-[1.05] site:hyphens-auto site:break-words site:[text-shadow:0_1px_12px_rgb(0_0_0/0.35)]">
                      {href ? (
                        <a
                          href={href}
                          data-field={`sections.actions.${i}.link`}
                          className={TILE_LINK}
                        >
                          {text}
                        </a>
                      ) : (
                        text
                      )}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Section>
  );
}
