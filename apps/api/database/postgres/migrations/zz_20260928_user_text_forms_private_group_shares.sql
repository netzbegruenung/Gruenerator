-- Gruppenzugriff auf ein Rezept verlangt ab jetzt share_mode <> 'private'
-- (#3803). Die Teilen-Route des Rezept-Vertrags hat bisher nur die Zeile in
-- group_content_shares geschrieben und den Modus auf 'private' gelassen — diese
-- Rezepte wären mit dem neuen Filter still entzogen. Stand erhalten: wer heute
-- über eine Freigabe Zugriff hat, behält ihn, und die Eigentümer*in sieht die
-- Projekte ab jetzt im Teilen-Dialog (der listet sie nur bei 'groups') und kann
-- sie dort zurücknehmen. Alle Arten, nicht nur 'custom': auch die Freigaben von
-- Presets und Rezept-Stilen aus der Zeit vor der Teilbarkeitsregel wirken heute
-- (siehe `unshareTextFormFromGroup`). is_public bleibt unberührt — eine private
-- Zeile ist nie gelistet.
UPDATE user_text_forms tf
   SET share_mode = 'groups', updated_at = NOW()
 WHERE tf.share_mode = 'private'
   AND EXISTS (
     SELECT 1
       FROM group_content_shares gcs
      WHERE gcs.content_type = 'user_text_forms'
        AND gcs.content_id = tf.id::text
   );
