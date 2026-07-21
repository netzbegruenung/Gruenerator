import { NotebooksIndexContent } from './components/NotebooksIndexPage';
import { NOTEBOOK_MAGENTA_BG } from './notebookTheme';

import { cn } from '@/utils/cn';

// "/wissen" — the notebook hub (chat surface + notebook gallery), formerly the
// workplace "Wissen" tab, now a standalone page reached from the Arbeiten tools
// strip. The notebook chat surface sizes itself against a bounded parent, so the
// full-height flex chain here matters (sidebarOnly layout provides h-dvh).
// Route-level RequireAuth gates access, so no auth wrapper is needed.
const WissenPage = () => (
  <div className={cn('flex h-full min-h-0 flex-col', NOTEBOOK_MAGENTA_BG)} data-tour="wissen">
    <NotebooksIndexContent />
  </div>
);

export default WissenPage;
