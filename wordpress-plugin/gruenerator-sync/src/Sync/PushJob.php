<?php
/**
 * Background workers that call the Grünerator API.
 *
 * @package Gruenerator\Sync
 */

declare(strict_types=1);

namespace Gruenerator\Sync\Sync;

use Gruenerator\Sync\Http\Client;
use Gruenerator\Sync\Http\Response;
use Gruenerator\Sync\Settings\Settings;

if (! defined('ABSPATH')) {
    exit;
}

/**
 * Runs out-of-band (Action Scheduler or wp-cron) so the editor's Save stays
 * instant. Re-checks scope at run time and records a status line for the health
 * panel. Throwing on failure lets Action Scheduler retry.
 */
final class PushJob
{
    public const STATUS_OPTION = 'gruenerator_sync_status';

    public function __construct(
        private Settings $settings,
        private Client $client
    ) {
    }

    public function register(): void
    {
        add_action(GRUENERATOR_SYNC_PUSH_HOOK, [$this, 'runPush'], 10, 1);
        add_action(GRUENERATOR_SYNC_DELETE_HOOK, [$this, 'runDelete'], 10, 1);
    }

    public function runPush(int $postId): void
    {
        $post = get_post($postId);
        if (! $post || $post->post_status !== 'publish') {
            return; // No longer publishable — a delete job will have been enqueued.
        }
        if (! $this->settings->isConfigured()) {
            return;
        }

        $payload  = (new Payload($this->settings))->forIngest($post);
        $response = $this->client->ingest($payload);
        $this->recordStatus('push', $response);

        if (! $response->ok) {
            // Let the scheduler retry transient failures.
            throw new \RuntimeException('Grünerator push failed: ' . $response->message);
        }
    }

    public function runDelete(string $permalink): void
    {
        if (! $this->settings->isConfigured() || $permalink === '') {
            return;
        }

        $settings = $this->settings->all();
        $body     = ['sourceUrl' => $permalink];
        if ($settings['target'] === Settings::TARGET_NOTEBOOK) {
            $body['target']     = Settings::TARGET_NOTEBOOK;
            $body['notebookId'] = $settings['notebook_id'];
        } else {
            $body['target']   = Settings::TARGET_LANDESVERBAND;
            $body['sourceId'] = $settings['source_id'];
        }

        $response = $this->client->delete($body);
        $this->recordStatus('delete', $response);

        if (! $response->ok) {
            throw new \RuntimeException('Grünerator delete failed: ' . $response->message);
        }
    }

    private function recordStatus(string $kind, Response $response): void
    {
        update_option(self::STATUS_OPTION, [
            'kind'    => $kind,
            'ok'      => $response->ok,
            'status'  => $response->status,
            'message' => $response->message,
            'at'      => gmdate('c'),
        ], false);
    }
}
