"use strict";

import { getPostgresInstance } from './PostgresService.js';

class GenerationStatsService {
    constructor() {
        this.postgresService = null;
    }

    getPostgres() {
        if (!this.postgresService) {
            this.postgresService = getPostgresInstance();
        }
        return this.postgresService;
    }

    async logGeneration({ userId, generationType, platform, tokensUsed, success = true }) {
        try {
            const postgres = this.getPostgres();
            if (!postgres.isConnected) {
                await postgres.connect();
            }

            const sql = `
                INSERT INTO generation_logs (user_id, generation_type, platform, tokens_used, success)
                VALUES ($1, $2, $3, $4, $5)
            `;

            await postgres.pool.query(sql, [
                userId || null,
                generationType,
                platform || null,
                tokensUsed || null,
                success
            ]);
        } catch (error) {
            console.error('[GenerationStats] Failed to log generation:', error.message);
        }
    }

    async getGenerationStats({ days = 30, limit = 50 } = {}) {
        try {
            const postgres = this.getPostgres();
            if (!postgres.isConnected) {
                await postgres.connect();
            }

            const sql = `
                SELECT
                    generation_type,
                    platform,
                    COUNT(*) as count,
                    COUNT(DISTINCT user_id) as unique_users,
                    COUNT(*) FILTER (WHERE success = true) as successful,
                    COUNT(*) FILTER (WHERE success = false) as failed
                FROM generation_logs
                WHERE created_at > NOW() - INTERVAL '1 day' * $1
                GROUP BY generation_type, platform
                ORDER BY count DESC
                LIMIT $2
            `;

            const result = await postgres.pool.query(sql, [days, limit]);
            return result.rows;
        } catch (error) {
            console.error('[GenerationStats] Failed to get stats:', error.message);
            return [];
        }
    }

    async getGenerationStatsByType({ days = 30 } = {}) {
        try {
            const postgres = this.getPostgres();
            if (!postgres.isConnected) {
                await postgres.connect();
            }

            const sql = `
                SELECT
                    generation_type,
                    COUNT(*) as count,
                    COUNT(DISTINCT user_id) as unique_users
                FROM generation_logs
                WHERE created_at > NOW() - INTERVAL '1 day' * $1
                GROUP BY generation_type
                ORDER BY count DESC
            `;

            const result = await postgres.pool.query(sql, [days]);
            return result.rows;
        } catch (error) {
            console.error('[GenerationStats] Failed to get stats by type:', error.message);
            return [];
        }
    }

    async getGenerationTimeline({ days = 30, generationType = null } = {}) {
        try {
            const postgres = this.getPostgres();
            if (!postgres.isConnected) {
                await postgres.connect();
            }

            let sql = `
                SELECT
                    DATE_TRUNC('day', created_at)::date as date,
                    generation_type,
                    COUNT(*) as count
                FROM generation_logs
                WHERE created_at > NOW() - INTERVAL '1 day' * $1
            `;

            const params = [days];

            if (generationType) {
                sql += ` AND generation_type = $2`;
                params.push(generationType);
            }

            sql += `
                GROUP BY date, generation_type
                ORDER BY date DESC
            `;

            const result = await postgres.pool.query(sql, params);
            return result.rows;
        } catch (error) {
            console.error('[GenerationStats] Failed to get timeline:', error.message);
            return [];
        }
    }

    async getTotalStats() {
        try {
            const postgres = this.getPostgres();
            if (!postgres.isConnected) {
                await postgres.connect();
            }

            const sql = `
                SELECT
                    COUNT(*) as total_generations,
                    COUNT(DISTINCT user_id) as total_users,
                    COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as last_7_days,
                    COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as last_30_days
                FROM generation_logs
            `;

            const result = await postgres.pool.query(sql);
            return result.rows[0];
        } catch (error) {
            console.error('[GenerationStats] Failed to get total stats:', error.message);
            return null;
        }
    }
}

let instance = null;

export function getGenerationStatsService() {
    if (!instance) {
        instance = new GenerationStatsService();
    }
    return instance;
}

export default GenerationStatsService;
