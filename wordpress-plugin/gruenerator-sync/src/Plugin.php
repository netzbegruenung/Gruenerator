<?php
/**
 * Plugin bootstrap.
 *
 * @package Gruenerator\Sync
 */

declare(strict_types=1);

namespace Gruenerator\Sync;

use Gruenerator\Sync\Http\Client;
use Gruenerator\Sync\Settings\Settings;
use Gruenerator\Sync\Settings\SettingsPage;
use Gruenerator\Sync\Sync\PostObserver;
use Gruenerator\Sync\Sync\PushJob;

if (! defined('ABSPATH')) {
    exit;
}

/**
 * Wires the plugin's components together. Single instance; no logic in global scope.
 */
final class Plugin
{
    private static ?Plugin $instance = null;

    private Settings $settings;

    public static function instance(): Plugin
    {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct()
    {
        $this->settings = new Settings();
    }

    public function settings(): Settings
    {
        return $this->settings;
    }

    /**
     * Register all hooks. Called once on `plugins_loaded`.
     */
    public function boot(): void
    {
        load_plugin_textdomain('gruenerator-sync', false, dirname(plugin_basename(GRUENERATOR_SYNC_FILE)) . '/languages');

        $client = new Client($this->settings);

        // Admin settings screen (REST-backed options + page).
        (new SettingsPage($this->settings, $client))->register();

        // Observe post lifecycle → enqueue background jobs.
        (new PostObserver($this->settings))->register();

        // Background workers that actually call the API.
        (new PushJob($this->settings, $client))->register();

        // Self-hosted auto-update (no-op if the library isn't bundled).
        $this->registerUpdateChecker();
    }

    /**
     * Wire yahnis-elsts/plugin-update-checker against GitHub releases, if present.
     */
    private function registerUpdateChecker(): void
    {
        $factory = 'YahnisElsts\\PluginUpdateChecker\\v5\\PucFactory';
        if (! class_exists($factory)) {
            return;
        }
        /** @var callable $build */
        $build  = [$factory, 'buildUpdateChecker'];
        $checker = $build(
            'https://github.com/netzbegruenung/gruenerator-sync/',
            GRUENERATOR_SYNC_FILE,
            'gruenerator-sync'
        );
        if (method_exists($checker, 'getVcsApi') && $checker->getVcsApi()) {
            $checker->getVcsApi()->enableReleaseAssets();
        }
    }

    public static function onActivate(): void
    {
        // Nothing persistent to create; settings default lazily. Reserved for
        // future scheduled maintenance actions.
    }

    public static function onDeactivate(): void
    {
        // Clear any pending background work so we leave no orphaned schedule.
        if (function_exists('as_unschedule_all_actions')) {
            as_unschedule_all_actions(GRUENERATOR_SYNC_PUSH_HOOK);
            as_unschedule_all_actions(GRUENERATOR_SYNC_DELETE_HOOK);
        }
        wp_clear_scheduled_hook(GRUENERATOR_SYNC_PUSH_HOOK);
        wp_clear_scheduled_hook(GRUENERATOR_SYNC_DELETE_HOOK);
    }
}
