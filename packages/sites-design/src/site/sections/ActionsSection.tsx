import { sectionGround } from '../../model/grounds.js';
import { safeHref } from '../../model/links.js';
import { SECTION_ANCHORS } from '../../model/visibility.js';
import { CONTAINER, Section, type SectionContext, SectionHeading } from '../layout.js';
import { Placeholder } from '../Placeholder.js';
import { SiteImage } from '../SiteImage.js';

const TILE_LINK =
  'site:underline-offset-4 site:hover:underline site:after:absolute site:after:inset-0 site:after:z-10 site:focus-visible:outline-none site:focus-visible:after:outline-3 site:focus-visible:after:outline-offset-3 site:focus-visible:after:outline-solid site:focus-visible:after:outline-[color:var(--site-palette-heading)]';

export function ActionsSection({ ctx }: { ctx: SectionContext }) {
  const { snapshot, copy } = ctx;
  const anchor = SECTION_ANCHORS.actions;
  const actions = snapshot.sections.actions ?? [];

  return (
    <Section
      section="actions"
      anchor={anchor}
      ground={sectionGround(snapshot.variant, 'actions')}
      className="site:py-section"
    >
      <div className={CONTAINER}>
        <div className="site:mb-8">
          <SectionHeading id={`${anchor}-titel`}>{copy.actionsHeading}</SectionHeading>
        </div>
        {actions.length === 0 ? (
          <Placeholder field="sections.actions" text={copy.emptyActions} />
        ) : (
          <ul
            data-field="sections.actions"
            className="site:grid site:gap-6 site:sm:grid-cols-2 site:lg:grid-cols-3 site:lg:gap-8"
          >
            {actions.map((action, i) => {
              const href = safeHref(action.link);
              const text = (
                <span data-field={`sections.actions.${i}.text`}>
                  {action.text.trim() || copy.navActions}
                </span>
              );
              return (
                <li
                  key={i}
                  data-index={i}
                  className="site:relative site:flex site:flex-col site:overflow-hidden site:rounded-card site:motion-safe:transition-transform site:motion-safe:duration-[200ms] site:motion-safe:ease-[cubic-bezier(0.2,0,0,1)] site:motion-safe:has-[a:hover]:-translate-y-0.5"
                >
                  <SiteImage
                    url={action.imageUrl}
                    slot="tile"
                    field={`sections.actions.${i}.imageUrl`}
                    className="site:aspect-[3/2] site:sm:aspect-[4/5]"
                  />
                  <div
                    data-ground="deep"
                    className="site:flex site:grow site:items-end site:justify-between site:gap-4 site:px-6 site:py-5"
                  >
                    <p className="site:min-w-0 site:font-display site:text-h3 site:leading-[1.1] site:hyphens-auto site:break-words">
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
                    <span
                      aria-hidden="true"
                      className="site:text-h3 site:leading-[1.1] site:text-accent"
                    >
                      →
                    </span>
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
