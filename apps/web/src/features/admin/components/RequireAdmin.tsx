import { Button } from '@gruenerator/ui';
import { type ReactNode } from 'react';
import { FaLock } from 'react-icons/fa';
import { Link } from 'react-router-dom';

import PageContainer from '../../../components/common/PageContainer';
import { useAuthStore } from '../../../stores/authStore';

/**
 * Shared "is this user allowed here" gate for admin pages — replaces the
 * copy-pasted `is_admin` check + "Kein Zugriff" fallback that used to live
 * inline in AdminDashboardPage/AdminSkillsPage. Only the instance-wide
 * `is_admin` check is implemented here (PR 1) — a `lvAdmin` variant scoped
 * to a specific Landesverband is added in PR 2, once the Landesverband-admin
 * surface (and the "which LV(s) am I admin of" contract it depends on)
 * exists.
 */
interface RequireAdminProps {
  children: ReactNode;
}

function AccessDenied() {
  const user = useAuthStore((s) => s.user);
  return (
    <PageContainer maxWidth="md">
      <div className="flex flex-col items-center justify-center gap-md py-xl text-center">
        <FaLock aria-hidden className="text-5xl text-grey-400" />
        <h1 className="text-3xl font-semibold">Kein Zugriff</h1>
        <p className="text-grey-600 dark:text-grey-400">
          Du hast keine Berechtigung, den Administrationsbereich zu öffnen. Bitte wende dich an eine
          administrierende Person, falls du Zugriff benötigst.
        </p>
        {user?.email && (
          <p className="text-sm text-grey-500">
            Angemeldet als{' '}
            <span className="font-medium text-grey-700 dark:text-grey-300">{user.email}</span>
          </p>
        )}
        <Button variant="brand" size="brand" asChild>
          <Link to="/workplace">Zurück zum Workplace</Link>
        </Button>
      </div>
    </PageContainer>
  );
}

export default function RequireAdmin({ children }: RequireAdminProps) {
  const isAdmin = useAuthStore((s) => s.user?.is_admin === true);
  if (!isAdmin) return <AccessDenied />;
  return <>{children}</>;
}
