-- Agents created with the hard-coded placeholder author get their owner's name.
UPDATE user_agents ua
   SET author = COALESCE(NULLIF(p.display_name, ''), p.first_name)
  FROM profiles p
 WHERE p.id = ua.user_id
   AND ua.author IN ('Eigener Agent', 'Eigener Grünerator-Agent', 'Eigene*r Agent*in')
   AND COALESCE(NULLIF(p.display_name, ''), p.first_name) IS NOT NULL;
