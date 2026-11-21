/** @jsxRuntime automatic @jsxImportSource react */
import { type ReactNode } from 'react';

import { InstagramConsent } from '../InstagramConsent.js';
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

export function SocialFeedSection({
  ctx,
  place,
  renderInstagram,
}: {
  ctx: SectionContext;
  place: Placement<'socialFeed'>;
  renderInstagram: ((username: string) => ReactNode) | null;
}) {
  const { mode, copy } = ctx;
  const { anchor, block: feed } = place;
  const username = feed.instagramUsername ?? '';
  const title = feed.title.trim() || copy.socialFeedDefault;
  const titleField = blockField(feed, 'title');
  const userField = blockField(feed, 'instagramUsername');

  return (
    <Section ctx={ctx} place={place} className="site:py-section">
      <div className={CONTAINER}>
        <div className="site:mb-8">
          <SectionHeading id={`${anchor}-titel`} field={titleField}>
            {editableText(ctx, titleField, copy.socialFeedDefault, title)}
          </SectionHeading>
        </div>
        {username === '' ? (
          <Placeholder field={userField} text={copy.emptyInstagram} mode={mode} />
        ) : (
          <div data-field={userField}>
            {mode === 'preview' && renderInstagram ? (
              renderInstagram(username)
            ) : (
              <InstagramConsent username={username} loaded={false} />
            )}
          </div>
        )}
      </div>
    </Section>
  );
}
