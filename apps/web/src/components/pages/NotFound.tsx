import { Button } from '@gruenerator/ui';
import { Link } from 'react-router-dom';

import { FaHome } from '@/config/shellIcons.generated';

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
        <Button variant="brand" size="brand" asChild>
          <Link to="/">
            <FaHome /> Zurück zur Startseite
          </Link>
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
