<?php
/**
 * Settings storage & access.
 *
 * @package Gruenerator\Sync
 */

declare(strict_types=1);

namespace Gruenerator\Sync\Settings;

if (! defined('ABSPATH')) {
    exit;
}

/**
 * Typed accessor over the single `gruenerator_sync_settings` option.
 *
 * The API key is write-only from the browser's perspective: it is stored here
 * but never returned to REST/JS (SettingsPage redacts it). A wp-config constant
 * GRUENERATOR_SYNC_API_KEY overrides the stored value for secret-manager setups.
 */
final class Settings
{
    public const OPTION = 'gruenerator_sync_settings';

    public const TARGET_LANDESVERBAND = 'landesverband';
    public const TARGET_NOTEBOOK      = 'notebook';

    /** Allowed Grünerator content types for the landesverband target. */
    public const CONTENT_TYPES = ['presse', 'beschluss', 'antrag', 'blog', 'wahlprogramm'];

    /**
     * @return array{
     *   api_base_url:string, api_key:string, target:string, source_id:string,
     *   notebook_id:string, default_content_type:string,
     *   category_map:array<string,string>, post_types:string[]
     * }
     */
    public function all(): array
    {
        $raw = get_option(self::OPTION, []);
        $raw = is_array($raw) ? $raw : [];

        return [
            'api_base_url'         => isset($raw['api_base_url']) ? (string) $raw['api_base_url'] : 'https://gruenerator.eu',
            'api_key'              => $this->apiKey($raw),
            'target'               => isset($raw['target']) && $raw['target'] === self::TARGET_NOTEBOOK
                ? self::TARGET_NOTEBOOK
                : self::TARGET_LANDESVERBAND,
            'source_id'            => isset($raw['source_id']) ? (string) $raw['source_id'] : '',
            'notebook_id'          => isset($raw['notebook_id']) ? (string) $raw['notebook_id'] : '',
            'default_content_type' => $this->contentType($raw['default_content_type'] ?? 'presse'),
            'category_map'         => $this->categoryMap($raw['category_map'] ?? []),
            'post_types'           => $this->postTypes($raw['post_types'] ?? ['post']),
        ];
    }

    private function apiKey(array $raw): string
    {
        if (defined('GRUENERATOR_SYNC_API_KEY') && is_string(GRUENERATOR_SYNC_API_KEY)) {
            return GRUENERATOR_SYNC_API_KEY;
        }
        return isset($raw['api_key']) ? (string) $raw['api_key'] : '';
    }

    public function apiKeyIsFromConstant(): bool
    {
        return defined('GRUENERATOR_SYNC_API_KEY');
    }

    public function hasApiKey(): bool
    {
        return $this->all()['api_key'] !== '';
    }

    /** True when the plugin is configured enough to push. */
    public function isConfigured(): bool
    {
        $s = $this->all();
        if ($s['api_base_url'] === '' || $s['api_key'] === '') {
            return false;
        }
        return $s['target'] === self::TARGET_NOTEBOOK ? $s['notebook_id'] !== '' : $s['source_id'] !== '';
    }

    /** Map a WP category name to a Grünerator content type, falling back to the default. */
    public function contentTypeForCategories(array $categoryNames): string
    {
        $map = $this->all()['category_map'];
        foreach ($categoryNames as $name) {
            if (isset($map[$name])) {
                return $map[$name];
            }
        }
        return $this->all()['default_content_type'];
    }

    /** True if the post (by its category names) is in scope for syncing. */
    public function categoriesInScope(array $categoryNames): bool
    {
        $map = $this->all()['category_map'];
        // Empty map = sync everything in configured post types; otherwise require a match.
        if ($map === []) {
            return true;
        }
        foreach ($categoryNames as $name) {
            if (isset($map[$name])) {
                return true;
            }
        }
        return false;
    }

    private function contentType(mixed $value): string
    {
        $value = is_string($value) ? $value : 'presse';
        return in_array($value, self::CONTENT_TYPES, true) ? $value : 'presse';
    }

    /** @return array<string,string> category name → content type (validated). */
    private function categoryMap(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }
        $out = [];
        foreach ($value as $cat => $type) {
            if (is_string($cat) && is_string($type) && in_array($type, self::CONTENT_TYPES, true)) {
                $out[$cat] = $type;
            }
        }
        return $out;
    }

    /** @return string[] */
    private function postTypes(mixed $value): array
    {
        if (! is_array($value)) {
            return ['post'];
        }
        $out = array_values(array_filter(array_map('strval', $value)));
        return $out === [] ? ['post'] : $out;
    }
}
