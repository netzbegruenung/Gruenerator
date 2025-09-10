#!/usr/bin/env node

/**
 * Migration script to add labor_enabled column to profiles table
 * Run this script to add the missing column to your local PostgreSQL database
 */

import dotenv from 'dotenv';
import pkg from 'pg';
const { Client } = pkg;
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env') });

async function addLaborEnabledColumn() {
    const client = new Client({
        host: process.env.POSTGRES_HOST,
        port: process.env.POSTGRES_PORT,
        user: process.env.POSTGRES_USER,
        password: process.env.POSTGRES_PASSWORD,
        database: process.env.POSTGRES_DATABASE,
        ssl: process.env.POSTGRES_SSL === 'true'
    });

    try {
        await client.connect();
        console.log('📚 Connected to PostgreSQL database');

        // Check if column already exists
        const checkQuery = `
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'profiles' AND column_name = 'labor_enabled'
        `;
        
        const checkResult = await client.query(checkQuery);
        
        if (checkResult.rows.length > 0) {
            console.log('✅ Column labor_enabled already exists in profiles table');
            return;
        }

        // Add the column
        const addColumnQuery = 'ALTER TABLE profiles ADD COLUMN labor_enabled BOOLEAN DEFAULT FALSE';
        await client.query(addColumnQuery);
        
        console.log('✅ Successfully added labor_enabled column to profiles table');
        
        // Verify the column was added
        const verifyResult = await client.query(checkQuery);
        if (verifyResult.rows.length > 0) {
            console.log('✅ Verified: labor_enabled column exists in profiles table');
        } else {
            console.error('❌ Error: Column was not added successfully');
        }

    } catch (error) {
        console.error('❌ Error adding labor_enabled column:', error.message);
        process.exit(1);
    } finally {
        await client.end();
        console.log('📚 Disconnected from PostgreSQL database');
    }
}

// Run the migration
addLaborEnabledColumn();