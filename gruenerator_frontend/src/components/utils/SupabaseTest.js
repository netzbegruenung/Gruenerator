import React, { useEffect, useState } from 'react';
import { supabase, checkSupabaseConnection } from './supabaseClient'; // Stellen Sie sicher, dass der Pfad korrekt ist

const SupabaseTest = () => {
  const [testResult, setTestResult] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const testSupabaseConnection = async () => {
      try {
        const isConnected = await checkSupabaseConnection();
        if (!isConnected) {
          throw new Error('Supabase-Verbindung konnte nicht hergestellt werden');
        }

        const uniqueLinkName = `frontend-test-${Date.now()}`;

        // Test-Einfüge- oder Aktualisierungsoperation
        const { error: upsertError } = await supabase
          .from('editor_contents')
          .upsert({ 
            link_name: uniqueLinkName, 
            content: `Dieser Eintrag wurde über das Frontend eingefügt/aktualisiert am ${new Date().toISOString()}.` 
          }, 
          { onConflict: 'link_name' });

        if (upsertError) throw upsertError;

        // Test-Abfrageoperation
        const { data: selectData, error: selectError } = await supabase
          .from('editor_contents')
          .select('*')
          .eq('link_name', uniqueLinkName)
          .single();

        if (selectError) throw selectError;

        setTestResult(JSON.stringify(selectData, null, 2));
      } catch (err) {
        console.error('Fehler beim Testen der Supabase-Verbindung:', err);
        setError(err.message);
      }
    };

    testSupabaseConnection();
  }, []);

  return (
    <div>
      <h2>Supabase Verbindungstest</h2>
      {error && <p style={{ color: 'red' }}>Fehler: {error}</p>}
      {testResult && (
        <div>
          <p>Test erfolgreich!</p>
          <pre>{testResult}</pre>
        </div>
      )}
    </div>
  );
};

export default SupabaseTest;
