/** @jsxRuntime automatic @jsxImportSource react */
import { safeHref } from '../../model/links.js';
import {
  CONTAINER,
  editableText,
  itemField,
  type Placement,
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
export function ActionsSection({
  ctx,
  place,
}: {
  ctx: SectionContext;
  place: Placement<'actions'>;
}) {
  const { copy, liveAnchors } = ctx;
  const { anchor, block } = place;
  const actions = block.items;
  const listField = `blocks.${block.id}`;

  return (
    <Section ctx={ctx} place={place} className="site:py-section">
      <div className={CONTAINER}>
        <div className="site:mb-8 site:sm:mb-14">
          <SectionHeading id={`${anchor}-titel`}>{copy.actionsHeading}</SectionHeading>
        </div>
        {actions.length === 0 ? (
          <Placeholder field={listField} text={copy.emptyActions} mode={ctx.mode} />
        ) : (
          <ul
            data-field={listField}
            className="site:grid site:gap-8 site:sm:grid-cols-3 site:sm:gap-14"
          >
            {actions.map((action) => {
              const safe = safeHref(action.link);
              // While editing, the tile is no link: its stretched ::after would take every click
              // meant for the text. The link itself is edited in the section form.
              const href =
                ctx.edit || (safe?.startsWith('#') && !liveAnchors.includes(safe)) ? null : safe;
              const text = (
                <span data-field={itemField(block, action.id, 'text')}>
                  {editableText(
                    ctx,
                    itemField(block, action.id, 'text'),
                    copy.navActions,
                    action.text.trim() || copy.navActions
                  )}
                </span>
              );
              return (
                <li
                  key={action.id}
                  data-item-id={action.id}
                  data-ground={action.imageUrl ? 'photo' : 'deep'}
                  className="site:group/tile site:relative site:isolate site:aspect-[4/5] site:overflow-hidden site:bg-[var(--site-palette-deep)]"
                >
                  <SiteImage
                    url={action.imageUrl}
                    slot="tile"
                    field={itemField(block, action.id, 'imageUrl')}
                    focus={action.imageFocus}
                    className="site:absolute site:inset-0 site:-z-10 site:after:absolute site:after:inset-0 site:after:bg-[rgb(0_0_0/0.3)] site:motion-safe:[&_img]:transition-transform site:motion-safe:[&_img]:duration-500 site:motion-safe:group-has-[a:hover]/tile:[&_img]:scale-105"
                  />
                  <div className="site:flex site:size-full site:items-center site:justify-center site:p-5">
                    <p className="site:min-w-0 site:text-center site:font-display site:text-tile site:leading-[1.05] site:hyphens-auto site:break-words site:[text-shadow:0_1px_12px_rgb(0_0_0/0.35)]">
                      {href ? (
                        <a
                          href={href}
                          data-field={itemField(block, action.id, 'link')}
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
