import React, { useState } from 'react';
import apiClient from '../../components/utils/apiClient';
import './DatabaseTest.css';

interface DatabaseTestResult {
  success: boolean;
  error?: string;
  database: {
    connection: string;
    pool?: {
      totalCount: number;
      idleCount: number;
      waitingCount: number;
    };
  };
  tables: {
    missing: string[];
    created: string[];
    existing: string[];
  };
  schema: {
    expected_tables_count: number;
    existing_tables_count: number;
    missing_tables_count: number;
  };
  actions?: {
    creation_errors: Array<{ error: string }>;
  };
}

const DatabaseTest = () => {
  const [testResult, setTestResult] = useState<DatabaseTestResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const runDatabaseTest = async (createMissing = false) => {
    setLoading(true);
    setError(null);
    setTestResult(null);

    try {
      console.log('[DatabaseTest] Running database test:', { createMissing });

      const response = await apiClient.get(`/database/test${createMissing ? '?create=true' : ''}`);
      console.log('[DatabaseTest] Test response:', response.data);

      setTestResult(response.data);
    } catch (err) {
      console.error('[DatabaseTest] Error running test:', err);
      const errorMessage = err instanceof Error ? err.message : 'Fehler beim Datenbanktest';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const renderTableStatus = (result: DatabaseTestResult | null): React.ReactElement | null => {
    if (!result) return null;

    const { tables, schema } = result;

    return (
      <div className="table-status">
        <h3>Tabellenstatus</h3>
        <div className="status-summary">
          <div className="status-item">
            <span className="label">Erwartet:</span>
            <span className="value">{schema.expected_tables_count}</span>
          </div>
          <div className="status-item">
            <span className="label">Vorhanden:</span>
            <span className="value success">{schema.existing_tables_count}</span>
          </div>
          <div className="status-item">
            <span className="label">Fehlend:</span>
            <span className="value error">{schema.missing_tables_count}</span>
          </div>
        </div>

        {tables.missing.length > 0 && (
          <div className="missing-tables">
            <h4>Fehlende Tabellen:</h4>
            <ul>
              {tables.missing.map((table: string) => (
                <li key={table} className="missing-table">{table}</li>
              ))}
            </ul>
          </div>
        )}

        {tables.created && tables.created.length > 0 && (
          <div className="created-tables">
            <h4>Erstellt:</h4>
            <ul>
              {tables.created.map((table: string) => (
                <li key={table} className="created-table">{table}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="existing-tables">
          <h4>Vorhandene Tabellen ({tables.existing.length}):</h4>
          <div className="table-list">
            {tables.existing.map((table: string) => (
              <span key={table} className="table-tag">{table}</span>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderDatabaseStatus = (result: DatabaseTestResult | null): React.ReactElement | null => {
    if (!result) return null;

    const { database } = result;

    return (
      <div className="database-status">
        <h3>Datenbankverbindung</h3>
        <div className="status-item">
          <span className="label">Status:</span>
          <span className={`value ${database.connection === 'healthy' ? 'success' : 'error'}`}>
            {database.connection}
          </span>
        </div>
        {database.pool && (
          <div className="pool-status">
            <h4>Connection Pool:</h4>
            <div className="pool-stats">
              <div className="stat">
                <span className="label">Total:</span>
                <span className="value">{database.pool.totalCount}</span>
              </div>
              <div className="stat">
                <span className="label">Idle:</span>
                <span className="value">{database.pool.idleCount}</span>
              </div>
              <div className="stat">
                <span className="label">Waiting:</span>
                <span className="value">{database.pool.waitingCount}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="database-test">
      <h2>Datenbank Schema Test</h2>
      <p>
        Überprüfe, ob alle Tabellen aus schema.sql in der PostgreSQL-Datenbank vorhanden sind.
      </p>

      <div className="test-actions">
        <button
          onClick={() => runDatabaseTest(false)}
          disabled={loading}
          className="test-button"
        >
          {loading ? 'Teste...' : 'Schema Prüfen'}
        </button>

        <button
          onClick={() => runDatabaseTest(true)}
          disabled={loading}
          className="test-button create-button"
        >
          {loading ? 'Teste...' : 'Prüfen & Fehlende Tabellen Erstellen'}
        </button>
      </div>

      {loading && (
        <div className="loading">
          <div className="spinner"></div>
          <span>Führe Datenbanktest durch...</span>
        </div>
      )}

      {error && (
        <div className="error">
          <h3>Fehler</h3>
          <p>{error}</p>
        </div>
      )}

      {testResult && (
        <div className="test-result">
          <h3>Testergebnis</h3>

          {testResult.success ? (
            <div className="success">
              <p>✓ Test erfolgreich durchgeführt</p>
            </div>
          ) : (
            <div className="error">
              <p>✗ Test fehlgeschlagen: {testResult.error || 'Unbekannter Fehler'}</p>
            </div>
          )}

          {testResult.success && (
            <>
              {renderDatabaseStatus(testResult)}
              {renderTableStatus(testResult)}

              {testResult.actions && testResult.actions.creation_errors.length > 0 && (
                <div className="creation-errors">
                  <h4>Fehler beim Erstellen:</h4>
                  {testResult.actions.creation_errors.map((err: { error: string }, idx: number) => (
                    <div key={idx} className="creation-error">
                      <p>{err.error}</p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          <div className="raw-result">
            <details>
              <summary>Raw Response anzeigen</summary>
              <pre>{JSON.stringify(testResult, null, 2)}</pre>
            </details>
          </div>
        </div>
      )}
    </div>
  );
};

export default DatabaseTest;
