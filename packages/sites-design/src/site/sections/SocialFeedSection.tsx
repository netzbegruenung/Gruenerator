/** @jsxRuntime automatic @jsxImportSource react */
import { type ReactNode } from 'react';

import { sectionGround } from '../../model/grounds.js';
import { SECTION_ANCHORS } from '../../model/visibility.js';
import { InstagramConsent } from '../InstagramConsent.js';
import {
  CONTAINER,
  editableText,
  Section,
  type SectionContext,
  SectionHeading,
} from '../layout.js';
import { Placeholder } from '../Placeholder.js';

export function SocialFeedSection({
  ctx,
  renderInstagram,
}: {
  ctx: SectionContext;
  renderInstagram: ((username: string) => ReactNode) | null;
}) {
  const { snapshot, mode, copy } = ctx;
  const anchor = SECTION_ANCHORS.socialFeed;
  const feed = snapshot.sections.socialFeed;
  const username = feed?.instagramUsername ?? '';
  const title = feed?.title.trim() || copy.socialFeedDefault;

  return (
    <Section
      section="socialFeed"
      anchor={anchor}
      ground={sectionGround(snapshot.variant, 'socialFeed', snapshot.locale)}
      className="site:py-section"
    >
      <div className={CONTAINER}>
        <div className="site:mb-8">
          <SectionHeading id={`${anchor}-titel`} field="sections.socialFeed.title">
            {editableText(ctx, 'sections.socialFeed.title', copy.socialFeedDefault, title)}
          </SectionHeading>
        </div>
        {username === '' ? (
          <Placeholder
            field="sections.socialFeed.instagramUsername"
            text={copy.emptyInstagram}
            mode={mode}
          />
        ) : (
          <div data-field="sections.socialFeed.instagramUsername">
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
