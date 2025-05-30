import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Seite die nach erfolgreichem Logout angezeigt wird
 * Leitet automatisch nach 3 Sekunden zur Startseite weiter
 */
const LoggedOutPage = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => {
      navigate('/');
    }, 3000);

    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="logged-out-container">
      <div className="logged-out-content">
        <h1>Erfolgreich abgemeldet</h1>
        <p>Du wurdest erfolgreich abgemeldet.</p>
        <p className="redirect-info">Du wirst in wenigen Sekunden zur Startseite weitergeleitet...</p>
      </div>
    </div>
  );
};

export default LoggedOutPage; 