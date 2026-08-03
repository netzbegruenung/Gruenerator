<?php
/**
 * Background-job enqueue helper.
 *
 * @package Gruenerator\Sync
 */

declare(strict_types=1);

namespace Gruenerator\Sync\Sync;

if (! defined('ABSPATH')) {
    exit;
}

/**
 * Prefers Action Scheduler (reliable queue with retries/visibility) and falls
 * back to wp-cron when it isn't bundled — so the plugin works either way.
 */
final class Queue
{
    public const GROUP = 'gruenerator-sync';

    /** @param array<int,mixed> $args */
    public static function enqueue(string $hook, array $args): void
    {
        if (function_exists('as_enqueue_async_action')) {
            // Skip if an identical job is already queued (rapid re-saves collapse).
            if (function_exists('as_has_scheduled_action') && as_has_scheduled_action($hook, $args, self::GROUP)) {
                return;
            }
            as_enqueue_async_action($hook, $args, self::GROUP);
            return;
        }

        if (! wp_next_scheduled($hook, $args)) {
            wp_schedule_single_event(time() + 5, $hook, $args);
        }
    }
}
