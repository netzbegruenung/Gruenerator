<?php
/**
 * Observes the post lifecycle and enqueues push/delete jobs.
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

/**
 * Uses `transition_post_status` (not raw `save_post`) so autosaves, revisions and
 * quick-edits don't leak sends. Every exit from "published" enqueues a delete.
 */
final class PostObserver
{
    public function __construct(private Settings $settings)
    {
    }

    public function register(): void
    {
        add_action('transition_post_status', [$this, 'onTransition'], 10, 3);
        add_action('before_delete_post', [$this, 'onBeforeDelete'], 10, 2);
    }

    /**
     * @param string $new New status.
     * @param string $old Old status.
     */
    public function onTransition(string $new, string $old, WP_Post $post): void
    {
        if (! $this->isSyncablePost($post)) {
            return;
        }

        if ($new === 'publish' && $this->inScope($post)) {
            Queue::enqueue(GRUENERATOR_SYNC_PUSH_HOOK, [$post->ID]);
            return;
        }

        // Left "published" (unpublish, trash, private, draft) → remove from Grünerator.
        if ($old === 'publish' && $new !== 'publish') {
            $permalink = (string) get_permalink($post);
            if ($permalink !== '') {
                Queue::enqueue(GRUENERATOR_SYNC_DELETE_HOOK, [$permalink]);
            }
        }
    }

    /**
     * Permanent deletion (bypasses a publish→trash transition for some flows).
     */
    public function onBeforeDelete(int $postId, WP_Post $post): void
    {
        if (! $this->isSyncablePost($post) || $post->post_status !== 'publish') {
            return;
        }
        $permalink = (string) get_permalink($post);
        if ($permalink !== '') {
            Queue::enqueue(GRUENERATOR_SYNC_DELETE_HOOK, [$permalink]);
        }
    }

    private function isSyncablePost(WP_Post $post): bool
    {
        if (wp_is_post_autosave($post) || wp_is_post_revision($post)) {
            return false;
        }
        if (! $this->settings->isConfigured()) {
            return false;
        }
        return in_array($post->post_type, $this->settings->all()['post_types'], true);
    }

    private function inScope(WP_Post $post): bool
    {
        return $this->settings->categoriesInScope(Payload::categoryNames($post->ID));
    }
}
