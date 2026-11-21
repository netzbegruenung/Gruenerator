/** @jsxRuntime automatic @jsxImportSource react */
import {
  type PublishedSiteSnapshot,
  type SiteBlock,
  type SiteBlockType,
} from '@gruenerator/contracts';

import { siteCopy } from '../model/copy.js';
import { sectionGround } from '../model/grounds.js';
import { SECTION_ANCHORS } from '../model/visibility.js';

import { CONTAINER } from './layout.js';
import { Sunflower } from './Sunflower.js';

const NAV_TARGETS = [
  ['about', 'navAbout'],
  ['themes', 'navThemes'],
  ['actions', 'navActions'],
  ['contact', 'navContact'],
] as const satisfies readonly (readonly [SiteBlockType, string])[];

const NAV_LINK =
  'site:inline-flex site:min-h-11 site:items-center site:px-3 site:text-[1.125rem] site:font-[700] site:text-heading site:underline-offset-4 site:hover:underline';
const NAV_CTA =
  'site:inline-flex site:min-h-11 site:items-center site:rounded-pill site:bg-action site:px-5 site:font-[700] site:text-action-ink site:underline-offset-4 site:hover:underline';

export function SiteHeader({
  snapshot,
  visible,
  backHome,
}: {
  snapshot: PublishedSiteSnapshot;
  visible: readonly SiteBlock[];
  backHome: string | null;
}) {
  const copy = siteCopy(snapshot.locale);
  // The first block of each type is the one its anchor names.
  const targets = NAV_TARGETS.filter(([type]) => visible.some((block) => block.type === type));
  const name = snapshot.site_title.trim();

  // White by default, as on gruene.de; the variant's colour when the site asks for it.
  const ground =
    snapshot.sections.header === 'farbig'
      ? sectionGround(snapshot.variant, 'header', snapshot.locale)
      : 'paper';
  // As on gruene.de, the sunflower sits in a square flush with the top edge. On the deep header
  // the square turns white so it stays visible. The Austrian party does not use the sunflower.
  const sunflower = snapshot.locale === 'de-DE';
  const blockGround = ground === 'deep' ? 'paper' : 'deep';

  return (
    <header data-ground={ground}>
      <div
        className={`${CONTAINER} site:flex site:flex-wrap site:items-center site:justify-between site:gap-x-8 site:gap-y-3 ${sunflower ? '' : 'site:py-4'}`}
      >
        <div className="site:flex site:min-w-0 site:items-center site:gap-4 site:md:gap-6">
          {sunflower && (
            <span
              data-ground={blockGround}
              className="site:flex site:size-16 site:shrink-0 site:items-center site:justify-center site:md:size-23"
            >
              <Sunflower
                className={`site:size-11 site:md:size-15 ${blockGround === 'deep' ? 'site:text-[#fff17a]' : 'site:text-heading'}`}
              />
            </span>
          )}
          <div className={`site:min-w-0 ${sunflower ? 'site:py-2' : ''}`}>
            {name !== '' && (
              <p className="site:font-display site:text-[1.25rem] site:leading-[1.1] site:text-heading site:line-clamp-2 site:wrap-anywhere site:md:text-[1.5rem]">
                {name}
              </p>
            )}
            <p className="site:text-small">{copy.partyShort}</p>
          </div>
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
