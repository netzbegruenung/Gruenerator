/** @jsxRuntime automatic @jsxImportSource react */
import { type PublishedSiteSnapshot } from '@gruenerator/contracts';

import { siteCopy } from '../model/copy.js';
import { sectionGround } from '../model/grounds.js';
import { type SiteLinks } from '../model/paths.js';

import { CONTAINER } from './layout.js';

const LEGAL_LINK =
  'site:inline-flex site:min-h-11 site:items-center site:text-link site:underline site:underline-offset-4 site:hover:decoration-2';

export function SiteFooter({
  snapshot,
  links,
}: {
  snapshot: PublishedSiteSnapshot;
  links: SiteLinks;
}) {
  const copy = siteCopy(snapshot.locale);
  const name = snapshot.site_title.trim();
  const items = [
    { href: links.impressum, label: copy.impressum },
    { href: links.datenschutz, label: copy.datenschutz },
    ...(links.report !== null ? [{ href: links.report, label: copy.report }] : []),
  ];

  return (
    <footer data-ground={sectionGround(snapshot.variant, 'footer', snapshot.locale)}>
      <div
        className={`${CONTAINER} site:flex site:flex-col site:gap-6 site:py-12 site:md:flex-row site:md:flex-wrap site:md:items-center site:md:justify-between`}
      >
        <p className="site:min-w-0 site:font-[700] site:wrap-anywhere">
          {name === '' ? copy.partyName : `${name} · ${copy.partyName}`}
        </p>
        <nav aria-label={copy.legalNav}>
          <ul className="site:flex site:flex-wrap site:gap-x-6">
            {items.map((item) => (
              <li key={item.label}>
                <a href={item.href} className={LEGAL_LINK}>
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <p className="site:text-small site:md:basis-full">{copy.poweredBy}</p>
      </div>
    </footer>
  );
}
