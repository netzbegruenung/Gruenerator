import { SectionHeader } from '../../packages/ui/src/index';

import { WorkplaceCreator } from './WorkplaceCreator';
import { WorkplaceRecent } from './WorkplaceRecent';
import { WorkplaceNotebooks } from './WorkplaceNotebooks';
import { WorkplaceTools } from './WorkplaceTools';
import { WorkplaceFavorites } from './WorkplaceFavorites';

// Full recreation of the Grünerator workplace home (WorkplacePage): the
// time-aware greeting, the creator/composer, recently-created content, notebooks,
// the tools grid, and the favorites — composed from @gruenerator/ui primitives.
export function WorkplacePage() {
  return (
    <div style={{ width: '100%', maxWidth: 960, margin: '0 auto', padding: '24px 16px 48px' }}>
      <div style={{ textAlign: 'center', marginBottom: 24, paddingTop: 8 }}>
        <h1
          style={{
            fontSize: 34,
            fontWeight: 600,
            margin: 0,
            color: 'var(--color-foreground-heading, #464646)',
          }}
        >
          Was stricken wir heute, Moritz?
        </h1>
      </div>

      <div style={{ maxWidth: 768, margin: '0 auto 48px' }}>
        <WorkplaceCreator />
      </div>

      <div style={{ marginBottom: 48 }}>
        <WorkplaceRecent />
      </div>

      <div style={{ marginBottom: 48 }}>
        <WorkplaceNotebooks />
      </div>

      <section style={{ marginBottom: 48 }}>
        <SectionHeader title="Weitere Tools" />
        <div style={{ marginTop: 16 }}>
          <WorkplaceTools />
        </div>
      </section>

      <section>
        <SectionHeader title="Grünerators Favoriten" />
        <div style={{ marginTop: 16 }}>
          <WorkplaceFavorites />
        </div>
      </section>
    </div>
  );
}
