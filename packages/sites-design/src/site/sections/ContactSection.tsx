/** @jsxRuntime automatic @jsxImportSource react */
import { FaEnvelope, FaPhone } from 'react-icons/fa6';

import { sectionGround } from '../../model/grounds.js';
import { safeHref, telHref } from '../../model/links.js';
import { SECTION_ANCHORS } from '../../model/visibility.js';
import { CONTAINER, Section, type SectionContext, SectionHeading } from '../layout.js';
import { Placeholder } from '../Placeholder.js';
import { SiteImage } from '../SiteImage.js';
import { SocialLinks } from '../SocialLinks.js';

const ROW_LINK =
  'site:group site:inline-flex site:min-h-11 site:max-w-full site:items-center site:gap-4 site:py-1 site:text-link site:wrap-anywhere';
const ROW_VALUE =
  'site:block site:text-lead site:underline site:decoration-1 site:underline-offset-[0.2em] site:group-hover:decoration-2';

export function ContactSection({ ctx }: { ctx: SectionContext }) {
  const { snapshot, copy } = ctx;
  const anchor = SECTION_ANCHORS.contact;
  const contact = snapshot.sections.contact;
  const backdrop = contact?.backgroundImageUrl ?? '';
  const title = contact?.title.trim() || copy.contactDefault;
  const email = snapshot.contact_email.trim();
  const mailHref = email === '' ? null : safeHref(`mailto:${email}`);
  const phone = snapshot.contact_phone.trim();
  const phoneHref = phone === '' ? null : telHref(phone);
  const hasRows = mailHref !== null || phoneHref !== null;
  const hasSocial = Object.keys(snapshot.social_links).length > 0;

  return (
    <Section
      section="contact"
      anchor={anchor}
      ground={
        backdrop !== '' ? 'photo' : sectionGround(snapshot.variant, 'contact', snapshot.locale)
      }
      className="site:relative site:isolate site:overflow-hidden site:py-section"
    >
      {backdrop !== '' && (
        <>
          <SiteImage
            url={backdrop}
            slot="backdrop"
            field="sections.contact.backgroundImageUrl"
            focus={contact?.backgroundFocus}
            className="site:absolute site:inset-0 site:-z-20"
          />
          <div
            aria-hidden="true"
            className="site:absolute site:inset-0 site:-z-10 site:bg-ground"
          />
        </>
      )}
      <div className={CONTAINER}>
        <div className="site:mb-8">
          <SectionHeading id={`${anchor}-titel`} field="sections.contact.title">
            {title}
          </SectionHeading>
        </div>
        {hasRows && (
          <ul className="site:flex site:flex-col site:gap-2">
            {mailHref && (
              <li className="site:min-w-0">
                <a href={mailHref} data-field="contact_email" className={ROW_LINK}>
                  <FaEnvelope aria-hidden className="site:size-5 site:shrink-0 site:text-accent" />
                  <span className="site:min-w-0">
                    <span className="site:block site:text-small">{copy.email}</span>
                    <span className={ROW_VALUE}>{email}</span>
                  </span>
                </a>
              </li>
            )}
            {phoneHref && (
              <li>
                <a href={phoneHref} data-field="contact_phone" className={ROW_LINK}>
                  <FaPhone aria-hidden className="site:size-5 site:shrink-0 site:text-accent" />
                  <span className="site:min-w-0">
                    <span className="site:block site:text-small">{copy.phone}</span>
                    <span className={ROW_VALUE}>{phone}</span>
                  </span>
                </a>
              </li>
            )}
          </ul>
        )}
        {!hasRows && !hasSocial && (
          <Placeholder field="contact_email" text={copy.emptyContact} mode={ctx.mode} />
        )}
        <SocialLinks links={snapshot.social_links} copy={copy} className="site:mt-8" />
      </div>
    </Section>
  );
}
