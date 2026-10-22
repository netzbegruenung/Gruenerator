-- Infografik-Illustrationen (FLUX, eine je Punkt) sind Bausteine einer Infografik,
-- keine Mediathek-Einträge: seit dieser Version schreibt illustrations.ts sie als
-- `sharepic-illustration` mit is_library_item = FALSE. Die bisher abgelegten
-- ziehen hier nach. Zeilen und Dateien bleiben — die `ki:<token>`-Refs in
-- gespeicherten Specs und Canvases lösen weiter über /api/share/<token>/download auf.
UPDATE shared_media
   SET upload_source = 'sharepic-illustration',
       is_library_item = FALSE
 WHERE upload_source = 'ai_generated'
   AND original_filename = 'infografik-illustration.png'
   AND title = 'Infografik-Illustration (KI)';
