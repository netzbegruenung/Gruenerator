-- Profilbild lays out on a fixed square sheet, but its documents were created
-- with the default 4:5 format, so the stage stretched the sheet by 1350/1080
-- (#4087). Move them onto the square format the template is now pinned to.
UPDATE canvas_documents
   SET format = 'profile-square'
 WHERE template_type = 'profilbild'
   AND format = 'post-portrait';
