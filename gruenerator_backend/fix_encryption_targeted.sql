-- Targeted Fix for Encryption Issues
-- This script specifically addresses the mixed encryption problems identified in the logs
-- Run this script to resolve the "Unexpected token 'i', 'info@morit'" and similar errors

-- Begin transaction for safety
BEGIN;

-- Show current state before cleanup
SELECT 
    'BEFORE TARGETED CLEANUP - Profile info:' as status,
    id,
    email,
    CASE 
        WHEN nextcloud_share_links IS NOT NULL THEN 'HAS_SHARE_LINKS'
        ELSE 'NO_SHARE_LINKS'
    END as share_links_status,
    CASE 
        WHEN canva_access_token IS NOT NULL THEN 'HAS_CANVA_TOKEN'
        ELSE 'NO_CANVA_TOKEN'  
    END as canva_status,
    updated_at
FROM profiles 
WHERE id = '08d57476-924e-48df-a75f-3c827f89aa95';

-- Clear all encrypted fields for the specific user experiencing issues
-- This is targeted to just the user from the logs: '08d57476-924e-48df-a75f-3c827f89aa95'
UPDATE profiles 
SET 
    -- Clear the problematic email field (it shows "info@morit" corrupted in logs)
    email = 'info@moritz-waechter.de',  -- Reset to correct value, unencrypted initially
    
    -- Clear Nextcloud share links (this will be re-added with correct object encryption)
    nextcloud_share_links = NULL,
    
    -- Clear Canva tokens (user will need to reconnect - safe)
    canva_access_token = NULL,
    canva_refresh_token = NULL,
    
    -- Clear custom prompts (user can re-enter if needed)
    custom_antrag_prompt = NULL,
    custom_social_prompt = NULL,
    custom_universal_prompt = NULL,
    custom_gruenejugend_prompt = NULL,
    
    -- Update timestamp
    updated_at = CURRENT_TIMESTAMP
    
WHERE id = '08d57476-924e-48df-a75f-3c827f89aa95';

-- Verify the update worked
SELECT 
    'AFTER TARGETED CLEANUP - Profile cleaned:' as status,
    id,
    email,
    CASE 
        WHEN nextcloud_share_links IS NOT NULL THEN 'HAS_SHARE_LINKS'
        ELSE 'CLEARED_SHARE_LINKS'
    END as share_links_status,
    CASE 
        WHEN canva_access_token IS NOT NULL THEN 'HAS_CANVA_TOKEN'
        ELSE 'CLEARED_CANVA_TOKEN'
    END as canva_status,
    updated_at
FROM profiles 
WHERE id = '08d57476-924e-48df-a75f-3c827f89aa95';

-- Commit the transaction
COMMIT;

-- Post-cleanup instructions:
SELECT 
    'NEXT STEPS:' as instruction_type,
    '1. Restart the backend server' as step_1,
    '2. Try adding Nextcloud share links again' as step_2,
    '3. All new encrypted data will use the correct field-type-based encryption' as step_3,
    '4. User will need to reconnect to Canva (tokens were cleared for safety)' as step_4;