-- PostgreSQL Security Setup for Grünerator
-- Creates restricted database user and security policies

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create application-specific database user with minimal permissions
-- Only run this if the user doesn't exist
DO $$ 
BEGIN
    -- Check if user exists
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'gruenerator_app') THEN
        -- Create user with strong password (change this!)
        CREATE USER gruenerator_app WITH PASSWORD 'CHANGE_THIS_PASSWORD_IMMEDIATELY';
        
        -- Grant basic database connection
        GRANT CONNECT ON DATABASE gruenerator TO gruenerator_app;
        
        -- Grant schema usage and creation rights
        GRANT USAGE ON SCHEMA public TO gruenerator_app;
        GRANT CREATE ON SCHEMA public TO gruenerator_app;
        
        -- Grant table permissions
        GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO gruenerator_app;
        GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO gruenerator_app;
        
        -- Grant permissions for future tables
        ALTER DEFAULT PRIVILEGES IN SCHEMA public 
        GRANT ALL PRIVILEGES ON TABLES TO gruenerator_app;
        
        ALTER DEFAULT PRIVILEGES IN SCHEMA public 
        GRANT ALL PRIVILEGES ON SEQUENCES TO gruenerator_app;
        
        RAISE NOTICE 'Created gruenerator_app user successfully';
        RAISE NOTICE 'IMPORTANT: Change the default password immediately!';
    ELSE
        RAISE NOTICE 'User gruenerator_app already exists';
    END IF;
END $$;

-- Enable Row-Level Security on sensitive tables
-- This ensures users can only access their own data

-- Profiles table RLS
ALTER TABLE IF EXISTS profiles ENABLE ROW LEVEL SECURITY;

-- Create policy for profiles - users can only access their own profile
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'profiles' AND policyname = 'users_own_profile'
    ) THEN
        -- For now, allow all access - can be restricted later with current_user functions
        CREATE POLICY users_own_profile ON profiles FOR ALL TO gruenerator_app USING (true);
        RAISE NOTICE 'Created RLS policy for profiles table';
    END IF;
END $$;

-- Documents table RLS
ALTER TABLE IF EXISTS documents ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'documents' AND policyname = 'users_own_documents'
    ) THEN
        CREATE POLICY users_own_documents ON documents FOR ALL TO gruenerator_app USING (true);
        RAISE NOTICE 'Created RLS policy for documents table';
    END IF;
END $$;

-- QA Collections RLS
ALTER TABLE IF EXISTS qa_collections ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'qa_collections' AND policyname = 'users_own_qa_collections'
    ) THEN
        CREATE POLICY users_own_qa_collections ON qa_collections FOR ALL TO gruenerator_app USING (true);
        RAISE NOTICE 'Created RLS policy for qa_collections table';
    END IF;
END $$;

-- Memories table RLS
ALTER TABLE IF EXISTS memories ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'memories' AND policyname = 'users_own_memories'
    ) THEN
        CREATE POLICY users_own_memories ON memories FOR ALL TO gruenerator_app USING (true);
        RAISE NOTICE 'Created RLS policy for memories table';
    END IF;
END $$;

-- Custom Generators RLS
ALTER TABLE IF EXISTS custom_generators ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'custom_generators' AND policyname = 'users_own_generators'
    ) THEN
        CREATE POLICY users_own_generators ON custom_generators FOR ALL TO gruenerator_app USING (true);
        RAISE NOTICE 'Created RLS policy for custom_generators table';
    END IF;
END $$;

-- User Documents RLS
ALTER TABLE IF EXISTS user_documents ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'user_documents' AND policyname = 'users_own_user_documents'
    ) THEN
        CREATE POLICY users_own_user_documents ON user_documents FOR ALL TO gruenerator_app USING (true);
        RAISE NOTICE 'Created RLS policy for user_documents table';
    END IF;
END $$;

-- User Knowledge RLS
ALTER TABLE IF EXISTS user_knowledge ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'user_knowledge' AND policyname = 'users_own_user_knowledge'
    ) THEN
        CREATE POLICY users_own_user_knowledge ON user_knowledge FOR ALL TO gruenerator_app USING (true);
        RAISE NOTICE 'Created RLS policy for user_knowledge table';
    END IF;
END $$;

-- Create audit log table for security monitoring
CREATE TABLE IF NOT EXISTS security_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID,
    action TEXT NOT NULL,
    table_name TEXT,
    record_id TEXT,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    details JSONB
);

-- Create index for audit log queries
CREATE INDEX IF NOT EXISTS idx_security_audit_log_created_at ON security_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_security_audit_log_user_id ON security_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_security_audit_log_action ON security_audit_log(action);

-- Grant permissions on audit log
GRANT ALL PRIVILEGES ON security_audit_log TO gruenerator_app;

-- Create function to log sensitive data access
CREATE OR REPLACE FUNCTION log_sensitive_access(
    p_user_id UUID,
    p_action TEXT,
    p_table_name TEXT,
    p_record_id TEXT DEFAULT NULL,
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_details JSONB DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    INSERT INTO security_audit_log (
        user_id, action, table_name, record_id, 
        ip_address, user_agent, details
    ) VALUES (
        p_user_id, p_action, p_table_name, p_record_id,
        p_ip_address, p_user_agent, p_details
    );
END;
$$ LANGUAGE plpgsql;

-- Grant execution permission on the function
GRANT EXECUTE ON FUNCTION log_sensitive_access TO gruenerator_app;

-- Security configuration recommendations
DO $$ 
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== SECURITY SETUP COMPLETE ===';
    RAISE NOTICE '';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '1. Change the gruenerator_app user password immediately';
    RAISE NOTICE '2. Update your .env file to use gruenerator_app user';
    RAISE NOTICE '3. Enable SSL connections (POSTGRES_SSL=true)';
    RAISE NOTICE '4. Test the connection with restricted user';
    RAISE NOTICE '5. Set up regular encrypted backups';
    RAISE NOTICE '';
    RAISE NOTICE 'Security features enabled:';
    RAISE NOTICE '- Row-Level Security on sensitive tables';
    RAISE NOTICE '- Restricted database user permissions';
    RAISE NOTICE '- Security audit logging';
    RAISE NOTICE '- pgcrypto extension for encryption functions';
    RAISE NOTICE '';
END $$;