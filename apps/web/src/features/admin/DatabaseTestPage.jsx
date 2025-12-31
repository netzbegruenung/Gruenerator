import React from 'react';
import DatabaseTest from './DatabaseTest';
import './DatabaseTestPage.css';

const DatabaseTestPage = () => {
  return (
    <div className="database-test-page">
      <div className="container">
        <header className="page-header">
          <h1>Database Schema Validation</h1>
          <p>
            Diese Seite ermöglicht es, die PostgreSQL-Datenbankstruktur zu überprüfen und
            sicherzustellen, dass alle erforderlichen Tabellen aus der schema.sql vorhanden sind.
          </p>
        </header>

        <main>
          <DatabaseTest />
        </main>
      </div>
    </div>
  );
};

export default DatabaseTestPage;