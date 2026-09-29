-- Gruppenzugriff auf einen User-Agent verlangt ab jetzt share_mode <> 'private'
-- (#3784). Die Freigabe per Chat und MCP hat bisher nur die Zeile in
-- group_content_shares geschrieben und den Modus auf 'private' gelassen — diese
-- Agents wären mit dem neuen Filter still entzogen. Stand erhalten: wer heute
-- über eine Freigabe Zugriff hat, behält ihn, und die Eigentümer*in sieht die
-- Projekte ab jetzt im Teilen-Dialog (der listet sie nur bei 'groups') und kann
-- sie dort zurücknehmen.
UPDATE user_agents ua
   SET share_mode = 'groups', updated_at = NOW()
 WHERE ua.share_mode = 'private'
   AND EXISTS (
     SELECT 1
       FROM group_content_shares gcs
      WHERE gcs.content_type = 'user_agents'
        AND gcs.content_id = ua.id::text
   );
