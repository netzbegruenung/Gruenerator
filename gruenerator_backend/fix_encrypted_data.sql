-- Fix Encrypted Data Issues
-- This script cleans corrupted encrypted fields that were encrypted with the wrong method
-- Run this script to resolve Nextcloud share links and other encryption errors

-- Begin transaction for safety
BEGIN;

-- Show current state before cleanup
SELECT 
    'BEFORE CLEANUP - Current encrypted fields:' as status,
    COUNT(*) as total_profiles,
    COUNT(CASE WHEN nextcloud_share_links IS NOT NULL THEN 1 END) as profiles_with_share_links,
    COUNT(CASE WHEN canva_access_token IS NOT NULL THEN 1 END) as profiles_with_canva_tokens
FROM profiles;

-- Clear corrupted encrypted fields
-- This will allow the new encryption method to work properly
UPDATE profiles 
SET 
    -- Clear Nextcloud share links (will be re-added properly)
    nextcloud_share_links = NULL,
    
    -- Clear Canva tokens (users will need to reconnect - this is safe)
    canva_access_token = NULL,
    canva_refresh_token = NULL,
    
    -- Clear custom prompts (users can re-enter if needed)
    custom_antrag_prompt = NULL,
    custom_social_prompt = NULL,
    custom_universal_prompt = NULL,
    custom_gruenejugend_prompt = NULL,
    
    -- Update timestamp
    updated_at = CURRENT_TIMESTAMP
    
WHERE 
    -- Only update rows that have encrypted data
    nextcloud_share_links IS NOT NULL 
    OR canva_access_token IS NOT NULL 
    OR canva_refresh_token IS NOT NULL
    OR custom_antrag_prompt IS NOT NULL
    OR custom_social_prompt IS NOT NULL
    OR custom_universal_prompt IS NOT NULL
    OR custom_gruenejugend_prompt IS NOT NULL;

-- Show results after cleanup
SELECT 
    'AFTER CLEANUP - Cleared encrypted fields:' as status,
    COUNT(*) as total_profiles,
    COUNT(CASE WHEN nextcloud_share_links IS NOT NULL THEN 1 END) as profiles_with_share_links,
    COUNT(CASE WHEN canva_access_token IS NOT NULL THEN 1 END) as profiles_with_canva_tokens
FROM profiles;

-- Show affected users (without showing sensitive data)
SELECT 
    id,
    email,
    'Encrypted fields cleared' as action,
    updated_at
FROM profiles 
WHERE updated_at >= CURRENT_TIMESTAMP - INTERVAL '1 minute'
ORDER BY updated_at DESC;

-- Commit the transaction
COMMIT;

-- Instructions for after running this script:
-- 1. Restart the backend server to ensure clean state
-- 2. Users will need to:
--    - Re-add their Nextcloud/Wolke share links (they will now encrypt properly)
--    - Reconnect to Canva (tokens were cleared for safety)
--    - Re-enter any custom prompts if they had them
-- 3. All new data will use the correct object/string encryption automatically