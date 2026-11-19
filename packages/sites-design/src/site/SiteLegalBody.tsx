import { type PublishedSiteSnapshot } from '@gruenerator/contracts';

import { legalTemplate } from '../legal/index.js';
import { LEGAL_DRAFT_NOTICE, type LegalBlock, type LegalDocumentKind } from '../legal/types.js';
import { safeHref, telHref } from '../model/links.js';
import { type SiteLinks } from '../model/paths.js';

import { CONTAINER } from './layout.js';
import { SiteShell } from './SiteBody.js';

const TEXT_LINK = 'site:text-link site:underline site:underline-offset-4 site:wrap-anywhere';

function Block({ block, legal }: { block: LegalBlock; legal: PublishedSiteSnapshot['legal'] }) {
  switch (block.kind) {
    case 'text':
      return <p>{block.text}</p>;
    case 'address':
      return (
        <address className="site:not-italic site:wrap-anywhere">
          {legal.name}
          {block.lines === 'full' && (
            <>
              <br />
              {legal.street}
              <br />
              {`${legal.postal_code} ${legal.city}`}
            </>
          )}
          {block.lines === 'name-and-city' && (
            <>
              <br />
              {legal.city}
            </>
          )}
        </address>
      );
    case 'contact': {
      const mail = legal.email ? safeHref(`mailto:${legal.email}`) : null;
      const tel = legal.phone ? telHref(legal.phone) : null;
      return (
        <p>
          {mail && (
            <>
              {'E-Mail: '}
              <a href={mail} className={TEXT_LINK}>
                {legal.email}
              </a>
            </>
          )}
          {mail && tel && <br />}
          {tel && (
            <>
              {'Telefon: '}
              <a href={tel} className={TEXT_LINK}>
                {legal.phone}
              </a>
            </>
          )}
        </p>
      );
    }
    case 'pending':
      return (
        <p className="site:rounded-card site:border-2 site:border-dashed site:border-current site:px-4 site:py-3">
          {`Noch offen: ${block.note}`}
        </p>
      );
  }
}

export function SiteLegalBody({
  snapshot,
  links,
  document,
}: {
  snapshot: PublishedSiteSnapshot;
  links: SiteLinks;
  document: LegalDocumentKind;
}) {
  const template = legalTemplate(snapshot.locale, document);

  return (
    <SiteShell snapshot={snapshot} links={links} visible={[]} backHome={links.home}>
      <div data-ground="paper" className="site:py-section">
        <div className={CONTAINER}>
          <div className="site:max-w-prose">
            <span
              aria-hidden="true"
              className="site:mb-5 site:block site:h-1.5 site:w-16 site:bg-accent"
            />
            <h1 className="site:text-h2 site:text-heading site:hyphens-auto">{template.title}</h1>
            {template.status === 'draft' && (
              <p
                role="note"
                data-ground="surface"
                className="site:mt-8 site:rounded-card site:border-s-4 site:border-accent site:px-5 site:py-4 site:font-[700]"
              >
                {LEGAL_DRAFT_NOTICE}
              </p>
            )}
            {template.sections.map((section) => (
              <section key={section.heading} className="site:mt-12">
                <h2 className="site:mb-4 site:text-[1.75rem] site:leading-[1.1] site:text-heading site:hyphens-auto">
                  {section.heading}
                </h2>
                <div className="site:flex site:flex-col site:gap-4">
                  {section.blocks.map((block, i) => (
                    <Block key={i} block={block} legal={snapshot.legal} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </SiteShell>
  );
}
