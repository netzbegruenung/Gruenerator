-- Import users from Supabase to local PostgreSQL
-- Best practice: Use INSERT ... ON CONFLICT to handle duplicates gracefully

-- Import the authenticated user first
INSERT INTO profiles (
    id, 
    email, 
    display_name, 
    first_name, 
    last_name, 
    is_admin, 
    keycloak_id, 
    username, 
    auth_source,
    document_mode
) VALUES (
    '08d57476-924e-48df-a75f-3c827f89aa95',
    'info@moritz-waechter.de',
    'Moritz Wächter',
    'Moritz',
    'Waechter',
    true,  -- Set as admin for development
    'eadd4011-3767-47a1-83e5-de484fc94def',
    'moritz.waechter',
    'gruenerator-login',
    'manual'
) ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    display_name = EXCLUDED.display_name,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    is_admin = EXCLUDED.is_admin,
    keycloak_id = EXCLUDED.keycloak_id,
    username = EXCLUDED.username,
    auth_source = EXCLUDED.auth_source,
    document_mode = COALESCE(profiles.document_mode, EXCLUDED.document_mode),
    updated_at = CURRENT_TIMESTAMP;

-- Import other active users
INSERT INTO profiles (
    id, 
    email, 
    display_name, 
    first_name, 
    last_name, 
    is_admin, 
    keycloak_id, 
    username, 
    auth_source,
    document_mode
) VALUES 
    ('e4ed6c8a-732f-408e-b3e6-7c1e0b2a8d3c', 'moritz.knobel@gruene-sachsen.de', 'Moritz Knobel', NULL, NULL, false, '2149d5a8-6ecc-4187-99b8-fd6aeeedc08b', 'knobelmo', 'gruenes-netz-login', 'manual'),
    ('f5629ca6-889d-4e8c-be67-5b058dc09a36', 'sina.wuebbeling@gmx.de', 'Sina Wübbeling', NULL, NULL, false, 'd5ab71e6-a273-4fcd-a1a8-e6455a86aeda', 'wuebbesi', NULL, 'manual'),
    ('a83fd631-2b4f-4254-bb9b-3ab1688c8a96', 'politik@ralf-schindelasch.de', 'Ralf Schindelasch', NULL, NULL, false, '1fe85fe1-4ff3-4f23-8049-8d9f22e1f639', 'schindra', NULL, 'manual'),
    ('4c2fd720-c8c3-4c05-b6da-c5ad5ae9bd3d', 'wilfried.boehling@posteo.de', 'Wilfried Böhling', 'Wi', 'Bo', false, '4841ea92-8060-46ed-b7aa-a4b4a215eb71', 'boehliwi', 'gruenes-netz-login', 'manual'),
    ('85205659-5989-4b4a-ae47-4775ad306340', 'roesen87@gmail.com', 'Peter Rösen', NULL, NULL, false, '82a4ec45-cd5b-4936-bcba-6b21ee79cf3b', 'roesenpe', NULL, 'manual'),
    ('fc2f0936-f4cf-4e5e-bbe0-37e3473bc084', 'juerko@familie-rykena.de', 'Jürko Rykena', 'Jürko', 'Rykena', false, '0c08f7f5-8037-48f3-87f5-567a0badbc29', 'rykenaju', 'gruenes-netz-login', 'manual'),
    ('14000c1c-72f6-4927-8caa-d36175d1f187', 'leonie.maurer@gruene-saar.de', 'Leonie Maurer', 'Leonie', 'Maurer', false, 'f2804070-8914-4e0a-9c32-7d808eeee022', 'maurerle', 'gruenes-netz-login', 'manual'),
    ('2351461c-568f-42da-807c-2d40cc9aaa1c', 'holger.wenner@mailbox.org', 'Holger Wenner', 'Holger', 'Wenner', false, '7676b868-2890-4a64-a812-6855e732b482', 'wennerho', 'gruenes-netz-login', 'manual'),
    ('523f4156-d4f2-4380-9cae-8c427b8244ef', 'moritz-waechter@outlook.de', 'Moritz Wächter', 'Moritz', 'Waechter', false, '4b31bca3-9b1a-4086-aae2-d920788faf42', 'waechtmo', 'gruenes-netz-login', 'manual')
ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    display_name = EXCLUDED.display_name,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    keycloak_id = EXCLUDED.keycloak_id,
    username = EXCLUDED.username,
    auth_source = EXCLUDED.auth_source,
    document_mode = COALESCE(profiles.document_mode, EXCLUDED.document_mode),
    updated_at = CURRENT_TIMESTAMP;

-- Verify import
SELECT 
    COUNT(*) as total_users,
    COUNT(CASE WHEN is_admin = true THEN 1 END) as admin_users,
    COUNT(CASE WHEN document_mode = 'manual' THEN 1 END) as manual_mode_users,
    COUNT(CASE WHEN auth_source = 'gruenerator-login' THEN 1 END) as gruenerator_login_users,
    COUNT(CASE WHEN auth_source = 'gruenes-netz-login' THEN 1 END) as gruenes_netz_login_users
FROM profiles;

-- Show imported users
SELECT id, email, display_name, is_admin, auth_source, document_mode 
FROM profiles 
ORDER BY display_name;