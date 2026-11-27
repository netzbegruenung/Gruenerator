import { Skeleton } from '@gruenerator/ui';
import { Suspense, useEffect } from 'react';
import { FiGrid } from 'react-icons/fi';
import { Navigate, useParams } from 'react-router-dom';

import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import ErrorBoundary from '../../components/ErrorBoundary';
import { CURRENT_INSTANCE } from '../../config/instance';

import AdminOverview from './AdminOverview';
import { ADMIN_GROUPS, type AdminSectionId, adminSectionsFor } from './adminSections';
import AdminShell, { type AdminNavGroup } from './components/AdminShell';
import { AdminPageHeader } from './components/adminUi';
import RequireAdmin from './components/RequireAdmin';

// Die Instanz steht beim Laden des Bundles fest — der Satz ändert sich nie.
const SECTIONS = adminSectionsFor(CURRENT_INSTANCE);
const AVAILABLE = new Set(SECTIONS.map((s) => s.id as AdminSectionId));

const NAV: AdminNavGroup[] = [
  { key: 'start', items: [{ to: '/admin', label: 'Überblick', icon: FiGrid, end: true }] },
  ...ADMIN_GROUPS.map((group) => ({
    key: group.id,
    label: group.label,
    items: SECTIONS.filter((s) => s.group === group.id).map((s) => ({
      to: `/admin/${s.id}`,
      label: s.label,
      icon: s.icon,
      badge: s.badge,
    })),
  })).filter((group) => group.items.length > 0),
];

/**
 * Lädt die Chunks aller Unterseiten im Leerlauf nach dem ersten Bild. Sonst
 * zeigt jeder erste Klick auf eine Unterseite erst ein Skelett, während ihr
 * Code nachkommt — auch auf dem Handy, wo es kein Überfahren gibt.
 */
function usePreloadSections() {
  useEffect(() => {
    const run = () => SECTIONS.forEach((s) => s.preload());
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(run, { timeout: 3000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(run, 1500);
    return () => window.clearTimeout(id);
  }, []);
}

function SectionFallback() {
  return (
    <div className="flex flex-col gap-sm">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

/**
 * `/admin` (Überblick), `/admin/:section` und `/admin/chunks/:documentId` —
 * alles eine Route, damit die Hülle beim Wechsel stehen bleibt.
 * Welche Unterseiten es gibt, steht in `adminSections.tsx`.
 */
const AdminPage = () => {
  usePreloadSections();
  const { section, documentId } = useParams<{ section?: string; documentId?: string }>();
  const active = section ? SECTIONS.find((s) => s.id === section) : null;

  if (section && !active) return <Navigate to="/admin" replace />;
  if (documentId && active?.id !== 'chunks') return <Navigate to={`/admin/${section}`} replace />;

  return (
    <RequireAdmin type="instanceAdmin">
      <AdminShell
        navLabel="Administration"
        heading={
          <div className="flex flex-col">
            <span className="font-[Raleway] text-lg font-bold text-foreground-heading">
              Administration
            </span>
            <span className="text-xs text-grey-600 dark:text-grey-400">
              {window.location.hostname}
            </span>
          </div>
        }
        nav={NAV}
      >
        <ErrorBoundary key={active?.id ?? 'overview'}>
          {active ? (
            <>
              <AdminPageHeader title={active.title} description={active.description} />
              <Suspense fallback={<SectionFallback />}>
                <active.Component />
              </Suspense>
            </>
          ) : (
            <AdminOverview available={AVAILABLE} />
          )}
        </ErrorBoundary>
      </AdminShell>
    </RequireAdmin>
  );
};

export default withAuthRequired(AdminPage, {
  title: 'Administration',
});
