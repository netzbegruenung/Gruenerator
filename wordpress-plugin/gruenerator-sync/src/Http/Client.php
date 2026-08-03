<?php
/**
 * Thin HTTP client for the Grünerator push API.
 *
 * @package Gruenerator\Sync
 */

declare(strict_types=1);

namespace Gruenerator\Sync\Http;

use Gruenerator\Sync\Settings\Settings;
use WP_Error;

if (! defined('ABSPATH')) {
    exit;
}

/**
 * Result of an API call: ok flag, HTTP status, decoded body, and a message.
 */
final class Response
{
    public function __construct(
        public readonly bool $ok,
        public readonly int $status,
        public readonly array $body,
        public readonly string $message
    ) {
    }
}

final class Client
{
    public function __construct(private Settings $settings)
    {
    }

    public function ping(): Response
    {
        return $this->request('GET', '/api/v1/push/ping');
    }

    /** @param array<string,mixed> $body */
    public function ingest(array $body): Response
    {
        return $this->request('POST', '/api/v1/push/articles', $body);
    }

    /** @param array<string,mixed> $body */
    public function delete(array $body): Response
    {
        return $this->request('POST', '/api/v1/push/articles/delete', $body);
    }

    /**
     * @param array<string,mixed>|null $body
     */
    private function request(string $method, string $path, ?array $body = null): Response
    {
        $settings = $this->settings->all();
        $base     = untrailingslashit($settings['api_base_url']);
        $url      = $base . $path;

        if ($base === '' || $settings['api_key'] === '') {
            return new Response(false, 0, [], __('API base URL or key not configured.', 'gruenerator-sync'));
        }

        $args = [
            'method'  => $method,
            'timeout' => 20,
            'headers' => [
                'Authorization' => 'Bearer ' . $settings['api_key'],
                'Accept'        => 'application/json',
                'User-Agent'    => 'gruenerator-sync/' . GRUENERATOR_SYNC_VERSION . '; ' . home_url('/'),
            ],
        ];
        if ($body !== null) {
            $args['headers']['Content-Type'] = 'application/json';
            $args['body']                    = (string) wp_json_encode($body);
        }

        $res = wp_remote_request($url, $args);
        if ($res instanceof WP_Error) {
            return new Response(false, 0, [], $res->get_error_message());
        }

        $status  = (int) wp_remote_retrieve_response_code($res);
        $decoded = json_decode((string) wp_remote_retrieve_body($res), true);
        $decoded = is_array($decoded) ? $decoded : [];
        $ok      = $status >= 200 && $status < 300;

        $message = $ok
            ? (string) ($decoded['action'] ?? 'ok')
            : (string) ($decoded['error'] ?? sprintf(/* translators: %d: HTTP status code */ __('HTTP %d', 'gruenerator-sync'), $status));

        return new Response($ok, $status, $decoded, $message);
    }
}
