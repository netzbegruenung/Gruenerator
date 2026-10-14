import { Link } from 'react-router-dom';

import { PageHero, PageShell } from '../../components/common/PageHero';

const StickerCreatorPlaceholder = () => (
  <PageShell>
    <PageHero
      title="Sticker erstellen"
      description={
        <p className="m-0 text-sm text-foreground-muted">Der Sticker-Creator kommt gleich.</p>
      }
    />
    <Link
      to="/studio/sticker"
      className="text-sm font-medium text-primary-600 hover:underline dark:text-primary-400"
    >
      Zurück zu Sticker & Hintergründe
    </Link>
  </PageShell>
);

export default StickerCreatorPlaceholder;
