<?php
/**
 * Uninstall cleanup — runs only on plugin deletion.
 *
 * @package Gruenerator\Sync
 */

declare(strict_types=1);

if (! defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

delete_option('gruenerator_sync_settings');
delete_option('gruenerator_sync_status');

// Clear any scheduled background work.
if (function_exists('as_unschedule_all_actions')) {
    as_unschedule_all_actions('gruenerator_sync_push');
    as_unschedule_all_actions('gruenerator_sync_delete');
}
wp_clear_scheduled_hook('gruenerator_sync_push');
wp_clear_scheduled_hook('gruenerator_sync_delete');
