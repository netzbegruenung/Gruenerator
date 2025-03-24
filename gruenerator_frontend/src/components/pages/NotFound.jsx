import React from 'react';
import { Link } from 'react-router-dom';
import { FaHome } from 'react-icons/fa';
const NotFound = () => {
  return (
    <div className="not-found-container">
      <div className="not-found-content">
        <h1>404</h1>
        <h2>Seite nicht gefunden</h2>
        <p>
          Ups! Diese Seite scheint nicht zu existieren. 
          Vielleicht wurde sie verschoben oder gelöscht.
        </p>
        <Link to="/" className="home-button">
          <FaHome /> Zurück zur Startseite
        </Link>
      </div>
    </div>
  );
};

export default NotFound; 