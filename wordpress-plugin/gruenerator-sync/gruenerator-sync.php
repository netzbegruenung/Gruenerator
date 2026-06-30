<?php
/**
 * Plugin Name:       Grünerator Sync
 * Plugin URI:        https://gruenerator.eu
 * Description:       Pushes published articles to Grünerator the moment they go live — no hourly scraping. Targets a Landesverband collection or a user notebook.
 * Version:           1.0.0
 * Requires at least: 6.5
 * Requires PHP:      8.1
 * Author:            netzbegrünung e.V.
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       gruenerator-sync
 * Domain Path:       /languages
 *
 * @package Gruenerator\Sync
 */

declare(strict_types=1);

namespace Gruenerator\Sync;

if (! defined('ABSPATH')) {
    exit; // No direct access.
}

define('GRUENERATOR_SYNC_VERSION', '1.0.0');
define('GRUENERATOR_SYNC_FILE', __FILE__);
define('GRUENERATOR_SYNC_DIR', plugin_dir_path(__FILE__));
define('GRUENERATOR_SYNC_PUSH_HOOK', 'gruenerator_sync_push');
define('GRUENERATOR_SYNC_DELETE_HOOK', 'gruenerator_sync_delete');

/**
 * Hard guard: deactivate gracefully on unsupported PHP instead of fatal-erroring.
 */
if (version_compare(PHP_VERSION, '8.1', '<')) {
    add_action('admin_notices', static function (): void {
        echo '<div class="notice notice-error"><p>';
        echo esc_html__('Grünerator Sync requires PHP 8.1 or newer and has been deactivated.', 'gruenerator-sync');
        echo '</p></div>';
    });
    add_action('admin_init', static function (): void {
        deactivate_plugins(plugin_basename(__FILE__));
    });
    return;
}

// Composer autoload (PSR-4 + bundled deps: Action Scheduler, plugin-update-checker).
// The plugin still functions without it (wp-cron fallback, no auto-update), but a
// production build should always ship vendor/.
$gruenerator_sync_autoload = GRUENERATOR_SYNC_DIR . 'vendor/autoload.php';
if (is_readable($gruenerator_sync_autoload)) {
    require_once $gruenerator_sync_autoload;
}

// Minimal PSR-4 fallback so the plugin loads even without `composer install`
// (vendor autoload, when present, takes precedence and is a no-op here).
spl_autoload_register(static function (string $class): void {
    $prefix = 'Gruenerator\\Sync\\';
    if (strncmp($class, $prefix, strlen($prefix)) !== 0) {
        return;
    }
    $relative = substr($class, strlen($prefix));
    $path     = GRUENERATOR_SYNC_DIR . 'src/' . str_replace('\\', '/', $relative) . '.php';
    if (is_readable($path)) {
        require_once $path;
    }
});

// Action Scheduler ships its own loader (functions, not a class) — load if present.
$gruenerator_sync_as = GRUENERATOR_SYNC_DIR . 'vendor/woocommerce/action-scheduler/action-scheduler.php';
if (is_readable($gruenerator_sync_as)) {
    require_once $gruenerator_sync_as;
}

register_activation_hook(__FILE__, [Plugin::class, 'onActivate']);
register_deactivation_hook(__FILE__, [Plugin::class, 'onDeactivate']);

add_action('plugins_loaded', static function (): void {
    Plugin::instance()->boot();
});
