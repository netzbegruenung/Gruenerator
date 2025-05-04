import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import PropTypes from 'prop-types';
import Spinner from '../../../components/common/Spinner';
import { useSupabaseAuth } from '../../../context/SupabaseAuthContext';

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
  const { user, loading } = useSupabaseAuth();
  const location = useLocation();

  // Zeige Ladeindikator während der Auth-Status geprüft wird
  if (loading) {
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
  // und den aktuellen Pfad in der Location speichern
  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  // Wenn Admin-Rechte erforderlich sind, aber der Benutzer kein Admin ist
  // TODO: Implementiere Admin-Check basierend auf Benutzerrolle aus Supabase
  if (adminRequired) {
    // Hier muss die Logik für die Admin-Überprüfung ergänzt werden
    // z.B.: if (!user.app_metadata?.admin) { ... }
    return <Navigate to="/unauthorized" replace />;
  }

  // Wenn Benutzer eingeloggt und alle Bedingungen erfüllt sind, zeige die geschützten Komponenten
  return children;
};

ProtectedRoute.propTypes = {
  children: PropTypes.node.isRequired,
  adminRequired: PropTypes.bool
};

export default ProtectedRoute; 