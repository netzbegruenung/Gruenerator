import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import Spinner from '../../../components/common/Spinner';
import { useInstantAuth } from '../../../hooks/useAuth';
import { getCurrentPath } from '../../../utils/authRedirect';

/**
 * Komponente zum Schutz von Routen, die nur für eingeloggte Benutzer zugänglich sein sollen.
 * Leitet nicht eingeloggte Benutzer zur Login-Seite weiter und speichert den ursprünglichen Pfad.
 *
 * @param {Object} props - Komponenten-Props
 * @param {React.ReactNode} props.children - Die zu schützenden React-Komponenten
 * @param {boolean} [props.adminRequired=false] - Optional: Ob der Benutzer Admin sein muss
 * @returns {JSX.Element} Die geschützten Komponenten oder eine Weiterleitung
 */
const ProtectedRoute = ({ children, adminRequired = false }) => {
  const { user, isAuthenticated, loading, hasCachedData } = useInstantAuth();
  const location = useLocation();

  // Zeige Ladeindikator nur wenn kein Cache vorhanden ist
  if (loading && !hasCachedData) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh'
      }}>
        <Spinner size="large" withBackground />
      </div>
    );
  }

  // Wenn kein Benutzer eingeloggt ist, zur Login-Seite weiterleiten
  // und den aktuellen Pfad (mit Search-Parametern) in der Location speichern
  if (!isAuthenticated || !user) {
    const currentPath = getCurrentPath(location);
    return <Navigate to={`/login?redirectTo=${encodeURIComponent(currentPath)}`} state={{ from: location }} replace />;
  }

  // Wenn Admin-Rechte erforderlich sind, aber der Benutzer kein Admin ist
  // TODO: Implementiere Admin-Check basierend auf Benutzerrolle aus Backend
  if (adminRequired) {
    // Hier muss die Logik für die Admin-Überprüfung ergänzt werden
    // z.B.: if (!user.is_admin) { ... }
    return <Navigate to="/unauthorized" replace />;
  }

  // Wenn Benutzer eingeloggt und alle Bedingungen erfüllt sind, zeige die geschützten Komponenten
  return children;
};

export default ProtectedRoute;
