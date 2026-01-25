import { FaHome } from 'react-icons/fa';
import { Link } from 'react-router-dom';
const NotFound = () => {
  return (
    <div className="not-found-container">
      <div className="not-found-content">
        <h1>404</h1>
        <h2>Seite nicht gefunden</h2>
        <p>
          Ups! Diese Seite scheint nicht zu existieren. Vielleicht wurde sie verschoben oder
          gelöscht.
        </p>
        <Link to="/" className="btn-primary">
          <FaHome /> Zurück zur Startseite
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
