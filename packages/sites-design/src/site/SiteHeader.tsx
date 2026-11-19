/** @jsxRuntime automatic @jsxImportSource react */
import { type PublishedSiteSnapshot, type SiteSectionId } from '@gruenerator/contracts';

import { siteCopy } from '../model/copy.js';
import { sectionGround } from '../model/grounds.js';
import { SECTION_ANCHORS } from '../model/visibility.js';

import { CONTAINER } from './layout.js';

const NAV_TARGETS = [
  ['about', 'navAbout'],
  ['themes', 'navThemes'],
  ['actions', 'navActions'],
  ['contact', 'navContact'],
] as const satisfies readonly (readonly [SiteSectionId, string])[];

const NAV_LINK =
  'site:inline-flex site:min-h-11 site:items-center site:rounded-pill site:px-3 site:font-[700] site:text-link site:underline-offset-4 site:hover:underline';
const NAV_CTA =
  'site:inline-flex site:min-h-11 site:items-center site:rounded-pill site:bg-action site:px-5 site:font-[700] site:text-action-ink site:underline-offset-4 site:hover:underline';

export function SiteHeader({
  snapshot,
  visible,
  backHome,
}: {
  snapshot: PublishedSiteSnapshot;
  visible: readonly SiteSectionId[];
  backHome: string | null;
}) {
  const copy = siteCopy(snapshot.locale);
  const targets = NAV_TARGETS.filter(([id]) => visible.includes(id));
  const name = snapshot.site_title.trim();

  return (
    <header data-ground={sectionGround(snapshot.variant, 'header', snapshot.locale)}>
      <div
        className={`${CONTAINER} site:flex site:flex-wrap site:items-center site:justify-between site:gap-x-8 site:gap-y-3 site:py-4`}
      >
        <div className="site:min-w-0">
          {name !== '' && (
            <p className="site:font-display site:text-[1.25rem] site:leading-[1.1] site:text-heading site:line-clamp-2 site:wrap-anywhere">
              {name}
            </p>
          )}
          <p className="site:text-small">{copy.partyShort}</p>
        </div>
        {backHome !== null ? (
          <a href={backHome} className={NAV_LINK}>
            {copy.backHome}
          </a>
        ) : (
          targets.length > 0 && (
            <nav aria-label={copy.sectionNav}>
              <ul className="site:flex site:flex-wrap site:items-center site:gap-x-1 site:gap-y-1">
                {targets.map(([id, label]) => (
                  <li key={id} className={id === 'contact' ? '' : 'site:hidden site:md:block'}>
                    <a
                      href={`#${SECTION_ANCHORS[id]}`}
                      className={id === 'contact' ? `${NAV_CTA} site:ml-2` : NAV_LINK}
                    >
                      {copy[label]}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          )
        )}
      </div>
    </header>
  );
}
