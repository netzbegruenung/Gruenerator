=== Grünerator Sync ===
Contributors: netzbegruenung
Tags: gruenerator, sync, content, push
Requires at least: 6.5
Tested up to: 6.7
Requires PHP: 8.1
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Pushes published articles to Grünerator the instant they go live — no hourly scraping.

== Description ==

Grünerator Sync sends a WordPress post to Grünerator the moment it is published,
updated, or removed. It replaces the slow hourly scraper with an instant push.

A post can target either:

* a **Landesverband collection** (set a Grünerator `sourceId`), or
* a **user notebook** (set the notebook id/slug; the API key's user must have edit access).

Only posts whose category is mapped (or all, if no map is set) are synced. Sending
happens in the background (Action Scheduler, or wp-cron as a fallback) so saving a
post stays instant. Unpublishing, trashing, or deleting a post removes it from
Grünerator.

= External service =

This plugin sends post content (title, body text, excerpt, URL, categories,
author, featured image URL) to the Grünerator API at the configured base URL
(default https://gruenerator.eu) using a Bearer API key you provide. No data is
sent until you enter a key and a target.

== Installation ==

1. Build/obtain the plugin ZIP (run `composer install --no-dev` to bundle Action
   Scheduler and the update checker), then upload it under Plugins → Add New → Upload.
2. Activate, then go to Settings → Grünerator Sync.
3. Enter the API base URL and the API key issued by the Grünerator team.
4. Choose the target (Landesverband or notebook) and fill in the source id / notebook id.
5. Optionally map categories to content types, then click "Test connection".
6. Use "Resync all published" for the initial import.

== Changelog ==

= 1.0.0 =
* Initial release: push on publish/update, remove on unpublish/trash/delete,
  Landesverband and user-notebook targets, settings screen with test + resync,
  Action Scheduler queue with wp-cron fallback, self-hosted auto-update.
