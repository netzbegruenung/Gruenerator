<?php
/**
 * Build a Grünerator push payload from a WP_Post.
 *
 * @package Gruenerator\Sync
 */

declare(strict_types=1);

namespace Gruenerator\Sync\Sync;

use Gruenerator\Sync\Settings\Settings;
use WP_Post;

if (! defined('ABSPATH')) {
    exit;
}

final class Payload
{
    public function __construct(private Settings $settings)
    {
    }

    /** @return string[] Category display names for the post. */
    public static function categoryNames(int $postId): array
    {
        $terms = get_the_category($postId);
        if (! is_array($terms)) {
            return [];
        }
        return array_values(array_map(static fn($t) => (string) $t->name, $terms));
    }

    /**
     * Build the ingest body for POST /api/v1/push/articles.
     *
     * @return array<string,mixed>
     */
    public function forIngest(WP_Post $post): array
    {
        $settings   = $this->settings->all();
        $categories = self::categoryNames($post->ID);

        // Render then strip to plain text — the backend chunker expects text, not HTML.
        $rendered = apply_filters('the_content', $post->post_content);
        $text     = trim(wp_strip_all_tags((string) $rendered));

        $common = [
            'title'           => get_the_title($post),
            'contentText'     => $text,
            'sourceUrl'       => (string) get_permalink($post),
            'externalId'      => (string) $post->ID,
            'publishedAt'     => get_post_time('c', true, $post) ?: null,
            'excerpt'         => $this->excerpt($post),
            'categories'      => $categories,
            'author'          => $this->authorName($post),
            'featuredImageUrl' => get_the_post_thumbnail_url($post, 'full') ?: null,
        ];

        if ($settings['target'] === Settings::TARGET_NOTEBOOK) {
            return array_merge($common, [
                'target'     => Settings::TARGET_NOTEBOOK,
                'notebookId' => $settings['notebook_id'],
            ]);
        }

        return array_merge($common, [
            'target'      => Settings::TARGET_LANDESVERBAND,
            'sourceId'    => $settings['source_id'],
            'contentType' => $this->settings->contentTypeForCategories($categories),
        ]);
    }

    /**
     * Build the delete body for POST /api/v1/push/articles/delete.
     *
     * @return array<string,mixed>
     */
    public function forDelete(WP_Post $post): array
    {
        $settings = $this->settings->all();
        $base     = ['sourceUrl' => (string) get_permalink($post)];

        if ($settings['target'] === Settings::TARGET_NOTEBOOK) {
            return array_merge($base, [
                'target'     => Settings::TARGET_NOTEBOOK,
                'notebookId' => $settings['notebook_id'],
            ]);
        }
        return array_merge($base, [
            'target'   => Settings::TARGET_LANDESVERBAND,
            'sourceId' => $settings['source_id'],
        ]);
    }

    private function excerpt(WP_Post $post): ?string
    {
        $excerpt = has_excerpt($post) ? get_the_excerpt($post) : '';
        $excerpt = trim(wp_strip_all_tags((string) $excerpt));
        if ($excerpt === '') {
            return null;
        }
        return mb_substr($excerpt, 0, 2000);
    }

    private function authorName(WP_Post $post): ?string
    {
        $name = get_the_author_meta('display_name', (int) $post->post_author);
        $name = is_string($name) ? trim($name) : '';
        return $name === '' ? null : $name;
    }
}
