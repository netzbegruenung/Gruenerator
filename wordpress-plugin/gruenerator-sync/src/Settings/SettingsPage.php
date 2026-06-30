<?php
/**
 * Admin settings screen.
 *
 * @package Gruenerator\Sync
 */

declare(strict_types=1);

namespace Gruenerator\Sync\Settings;

use Gruenerator\Sync\Http\Client;
use Gruenerator\Sync\Sync\PushJob;
use Gruenerator\Sync\Sync\Payload;
use Gruenerator\Sync\Sync\Queue;

if (! defined('ABSPATH')) {
    exit;
}

/**
 * Server-rendered options screen (Settings API) plus two admin-post actions:
 * Test Connection and Resync All. Capability-gated and nonce-protected.
 */
final class SettingsPage
{
    private const GROUP   = 'gruenerator_sync';
    private const PAGE     = 'gruenerator-sync';
    private const CAP      = 'manage_options';

    public function __construct(
        private Settings $settings,
        private Client $client
    ) {
    }

    public function register(): void
    {
        add_action('admin_menu', [$this, 'addMenu']);
        add_action('admin_init', [$this, 'registerSetting']);
        add_action('admin_post_gruenerator_sync_test', [$this, 'handleTest']);
        add_action('admin_post_gruenerator_sync_resync', [$this, 'handleResync']);
    }

    public function addMenu(): void
    {
        add_options_page(
            __('Grünerator Sync', 'gruenerator-sync'),
            __('Grünerator Sync', 'gruenerator-sync'),
            self::CAP,
            self::PAGE,
            [$this, 'render']
        );
    }

    public function registerSetting(): void
    {
        register_setting(self::GROUP, Settings::OPTION, [
            'type'              => 'object',
            'sanitize_callback' => [$this, 'sanitize'],
            'default'           => [],
            'show_in_rest'      => false, // Contains the secret API key — never expose via REST.
        ]);
    }

    /**
     * @param mixed $input
     * @return array<string,mixed>
     */
    public function sanitize($input): array
    {
        $input   = is_array($input) ? $input : [];
        $current = $this->settings->all();

        $target = (isset($input['target']) && $input['target'] === Settings::TARGET_NOTEBOOK)
            ? Settings::TARGET_NOTEBOOK
            : Settings::TARGET_LANDESVERBAND;

        $contentType = isset($input['default_content_type']) && in_array($input['default_content_type'], Settings::CONTENT_TYPES, true)
            ? $input['default_content_type']
            : 'presse';

        // API key is write-only: keep the stored value when the field is blank.
        $apiKey = isset($input['api_key']) ? trim((string) $input['api_key']) : '';
        if ($apiKey === '') {
            $apiKey = $this->settings->apiKeyIsFromConstant() ? '' : $current['api_key'];
        }

        return [
            'api_base_url'         => esc_url_raw(trim((string) ($input['api_base_url'] ?? ''))),
            'api_key'              => $apiKey,
            'target'               => $target,
            'source_id'            => sanitize_text_field((string) ($input['source_id'] ?? '')),
            'notebook_id'          => sanitize_text_field((string) ($input['notebook_id'] ?? '')),
            'default_content_type' => $contentType,
            'category_map'         => $this->parseCategoryMap((string) ($input['category_map'] ?? '')),
            'post_types'           => $this->parsePostTypes($input['post_types'] ?? ['post']),
        ];
    }

    /** Parse the "Category = content_type" textarea into a validated map. */
    private function parseCategoryMap(string $raw): array
    {
        $map = [];
        foreach (preg_split('/\r\n|\r|\n/', $raw) ?: [] as $line) {
            $line = trim($line);
            if ($line === '' || ! str_contains($line, '=')) {
                continue;
            }
            [$cat, $type] = array_map('trim', explode('=', $line, 2));
            $type         = strtolower($type);
            if ($cat !== '' && in_array($type, Settings::CONTENT_TYPES, true)) {
                $map[sanitize_text_field($cat)] = $type;
            }
        }
        return $map;
    }

    /** @param mixed $raw @return string[] */
    private function parsePostTypes($raw): array
    {
        $raw = is_array($raw) ? $raw : ['post'];
        $out = array_values(array_filter(array_map('sanitize_key', array_map('strval', $raw))));
        return $out === [] ? ['post'] : $out;
    }

    public function render(): void
    {
        if (! current_user_can(self::CAP)) {
            return;
        }
        $s        = $this->settings->all();
        $mapText  = '';
        foreach ($s['category_map'] as $cat => $type) {
            $mapText .= $cat . ' = ' . $type . "\n";
        }
        $status     = get_option(PushJob::STATUS_OPTION, []);
        $postTypes  = get_post_types(['public' => true], 'objects');
        ?>
        <div class="wrap">
            <h1><?php echo esc_html__('Grünerator Sync', 'gruenerator-sync'); ?></h1>
            <p><?php echo esc_html__('Push published articles to Grünerator the moment they go live.', 'gruenerator-sync'); ?></p>

            <?php $this->renderNotices(); ?>
            <?php $this->renderHealthPanel($s, is_array($status) ? $status : []); ?>

            <form method="post" action="options.php">
                <?php settings_fields(self::GROUP); ?>
                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row"><label for="gs_api_base_url"><?php echo esc_html__('API base URL', 'gruenerator-sync'); ?></label></th>
                        <td><input name="<?php echo esc_attr(Settings::OPTION); ?>[api_base_url]" id="gs_api_base_url" type="url" class="regular-text" value="<?php echo esc_attr($s['api_base_url']); ?>" placeholder="https://gruenerator.eu" /></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="gs_api_key"><?php echo esc_html__('API key', 'gruenerator-sync'); ?></label></th>
                        <td>
                            <?php if ($this->settings->apiKeyIsFromConstant()) : ?>
                                <em><?php echo esc_html__('Set via the GRUENERATOR_SYNC_API_KEY constant in wp-config.php.', 'gruenerator-sync'); ?></em>
                            <?php else : ?>
                                <input name="<?php echo esc_attr(Settings::OPTION); ?>[api_key]" id="gs_api_key" type="password" class="regular-text" value="" autocomplete="new-password" placeholder="<?php echo $this->settings->hasApiKey() ? esc_attr__('•••••• saved — leave blank to keep', 'gruenerator-sync') : 'grun_…'; ?>" />
                                <p class="description"><?php echo esc_html__('Stored write-only; leave blank to keep the current key.', 'gruenerator-sync'); ?></p>
                            <?php endif; ?>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><?php echo esc_html__('Target', 'gruenerator-sync'); ?></th>
                        <td>
                            <label><input type="radio" name="<?php echo esc_attr(Settings::OPTION); ?>[target]" value="landesverband" <?php checked($s['target'], Settings::TARGET_LANDESVERBAND); ?> /> <?php echo esc_html__('Landesverband collection', 'gruenerator-sync'); ?></label><br />
                            <label><input type="radio" name="<?php echo esc_attr(Settings::OPTION); ?>[target]" value="notebook" <?php checked($s['target'], Settings::TARGET_NOTEBOOK); ?> /> <?php echo esc_html__('User notebook', 'gruenerator-sync'); ?></label>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="gs_source_id"><?php echo esc_html__('Landesverband source id', 'gruenerator-sync'); ?></label></th>
                        <td><input name="<?php echo esc_attr(Settings::OPTION); ?>[source_id]" id="gs_source_id" type="text" class="regular-text" value="<?php echo esc_attr($s['source_id']); ?>" placeholder="sachsen-anhalt-lv" />
                        <p class="description"><?php echo esc_html__('Used when target = Landesverband. Ask the Grünerator team for your source id.', 'gruenerator-sync'); ?></p></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="gs_notebook_id"><?php echo esc_html__('Notebook id / slug', 'gruenerator-sync'); ?></label></th>
                        <td><input name="<?php echo esc_attr(Settings::OPTION); ?>[notebook_id]" id="gs_notebook_id" type="text" class="regular-text" value="<?php echo esc_attr($s['notebook_id']); ?>" />
                        <p class="description"><?php echo esc_html__('Used when target = User notebook. The key user must have edit access to it.', 'gruenerator-sync'); ?></p></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="gs_default_ct"><?php echo esc_html__('Default content type', 'gruenerator-sync'); ?></label></th>
                        <td>
                            <select name="<?php echo esc_attr(Settings::OPTION); ?>[default_content_type]" id="gs_default_ct">
                                <?php foreach (Settings::CONTENT_TYPES as $ct) : ?>
                                    <option value="<?php echo esc_attr($ct); ?>" <?php selected($s['default_content_type'], $ct); ?>><?php echo esc_html($ct); ?></option>
                                <?php endforeach; ?>
                            </select>
                            <p class="description"><?php echo esc_html__('Applied to the Landesverband target when no category mapping matches.', 'gruenerator-sync'); ?></p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="gs_map"><?php echo esc_html__('Category → content type', 'gruenerator-sync'); ?></label></th>
                        <td>
                            <textarea name="<?php echo esc_attr(Settings::OPTION); ?>[category_map]" id="gs_map" rows="5" class="large-text code" placeholder="Pressemitteilungen = presse&#10;Beschlüsse = beschluss"><?php echo esc_textarea(trim($mapText)); ?></textarea>
                            <p class="description"><?php echo esc_html__('One per line: "Category name = content type". Leave empty to sync all categories. Only posts in a listed category are synced when this is set.', 'gruenerator-sync'); ?></p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><?php echo esc_html__('Post types', 'gruenerator-sync'); ?></th>
                        <td>
                            <?php foreach ($postTypes as $pt) : ?>
                                <label style="margin-right:1em"><input type="checkbox" name="<?php echo esc_attr(Settings::OPTION); ?>[post_types][]" value="<?php echo esc_attr($pt->name); ?>" <?php checked(in_array($pt->name, $s['post_types'], true)); ?> /> <?php echo esc_html($pt->labels->singular_name); ?></label>
                            <?php endforeach; ?>
                        </td>
                    </tr>
                </table>
                <?php submit_button(); ?>
            </form>

            <hr />
            <h2><?php echo esc_html__('Actions', 'gruenerator-sync'); ?></h2>
            <p>
                <?php $this->actionButton('gruenerator_sync_test', __('Test connection', 'gruenerator-sync')); ?>
                <?php $this->actionButton('gruenerator_sync_resync', __('Resync all published', 'gruenerator-sync'), 'button'); ?>
            </p>
        </div>
        <?php
    }

    private function actionButton(string $action, string $label, string $class = 'button button-primary'): void
    {
        ?>
        <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" style="display:inline">
            <input type="hidden" name="action" value="<?php echo esc_attr($action); ?>" />
            <?php wp_nonce_field($action); ?>
            <button type="submit" class="<?php echo esc_attr($class); ?>"><?php echo esc_html($label); ?></button>
        </form>
        <?php
    }

    private function renderHealthPanel(array $s, array $status): void
    {
        $configured = $this->settings->isConfigured();
        echo '<div class="card" style="max-width:none;padding:1em 1.5em">';
        echo '<h2 style="margin-top:0">' . esc_html__('Status', 'gruenerator-sync') . '</h2><ul style="margin:0">';
        echo '<li>' . esc_html__('Configured:', 'gruenerator-sync') . ' <strong>' . ($configured ? '✅' : '⚠️') . '</strong></li>';
        echo '<li>' . esc_html__('Queue:', 'gruenerator-sync') . ' ' . (function_exists('as_enqueue_async_action')
            ? esc_html__('Action Scheduler', 'gruenerator-sync')
            : esc_html__('wp-cron (install Action Scheduler for reliability)', 'gruenerator-sync')) . '</li>';
        if (! empty($status)) {
            $icon = ! empty($status['ok']) ? '✅' : '❌';
            echo '<li>' . esc_html__('Last result:', 'gruenerator-sync') . ' ' . esc_html((string) ($status['kind'] ?? '')) . ' ' . $icon . ' '
                . esc_html((string) ($status['message'] ?? '')) . ' (' . esc_html((string) ($status['at'] ?? '')) . ')</li>';
        }
        echo '</ul></div>';
    }

    private function renderNotices(): void
    {
        // phpcs:ignore WordPress.Security.NonceVerification.Recantation -- read-only notice flag set by our own redirect.
        $notice = isset($_GET['gs_notice']) ? sanitize_text_field(wp_unslash((string) $_GET['gs_notice'])) : '';
        if ($notice === '') {
            return;
        }
        $map = [
            'test_ok'      => ['updated', __('Connection OK — API key is valid.', 'gruenerator-sync')],
            'test_fail'    => ['error', __('Connection failed. Check the URL and API key.', 'gruenerator-sync')],
            'resync_done'  => ['updated', __('Resync queued for all published posts in scope.', 'gruenerator-sync')],
        ];
        if (! isset($map[$notice])) {
            return;
        }
        [$cls, $msg] = $map[$notice];
        printf('<div class="notice notice-%s is-dismissible"><p>%s</p></div>', esc_attr($cls), esc_html($msg));
    }

    public function handleTest(): void
    {
        $this->guard('gruenerator_sync_test');
        $res = $this->client->ping();
        $this->redirect($res->ok ? 'test_ok' : 'test_fail');
    }

    public function handleResync(): void
    {
        $this->guard('gruenerator_sync_resync');

        $query = new \WP_Query([
            'post_type'      => $this->settings->all()['post_types'],
            'post_status'    => 'publish',
            'fields'         => 'ids',
            'posts_per_page' => 500,
            'no_found_rows'  => true,
        ]);
        foreach ($query->posts as $postId) {
            $postId = (int) $postId;
            if ($this->settings->categoriesInScope(Payload::categoryNames($postId))) {
                Queue::enqueue(GRUENERATOR_SYNC_PUSH_HOOK, [$postId]);
            }
        }
        $this->redirect('resync_done');
    }

    private function guard(string $action): void
    {
        if (! current_user_can(self::CAP)) {
            wp_die(esc_html__('Insufficient permissions.', 'gruenerator-sync'));
        }
        check_admin_referer($action);
    }

    private function redirect(string $notice): void
    {
        wp_safe_redirect(add_query_arg('gs_notice', $notice, admin_url('options-general.php?page=' . self::PAGE)));
        exit;
    }
}
