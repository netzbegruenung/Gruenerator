<?php
// Verhindert direkten Zugriff auf die Datei
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Zentralisierte Options-Verwaltung für das Grünerator Plugin.
 *
 * Konsolidiert 80+ individuelle get_option/update_option-Aufrufe in 4 strukturierte Optionen:
 * - gruenerator_content  — alle Seiteninhalte
 * - gruenerator_design   — visuelle Einstellungen
 * - gruenerator_social   — Social-Media-Profile (Pipe-separierter String)
 * - gruenerator_setup    — Setup-Status
 *
 * @since 1.1.0
 */
class Gruenerator_Options {

    /**
     * Standardwerte für Inhalte
     */
    const CONTENT_DEFAULTS = array(
        'hero' => array(
            'heading' => '',
            'text'    => '',
            'image'   => '',
        ),
        'about' => array(
            'title'   => '',
            'content' => '',
        ),
        'hero_image' => array(
            'image'    => '',
            'title'    => '',
            'subtitle' => '',
        ),
        'themes' => array(
            array('image' => '', 'title' => '', 'content' => ''),
            array('image' => '', 'title' => '', 'content' => ''),
            array('image' => '', 'title' => '', 'content' => ''),
        ),
        'actions' => array(
            array('image' => '', 'text' => '', 'link' => ''),
            array('image' => '', 'text' => '', 'link' => ''),
            array('image' => '', 'text' => '', 'link' => ''),
        ),
        'contact' => array(
            'title' => '',
            'email' => '',
            'image' => '',
        ),
    );

    /**
     * Standardwerte für Design-Einstellungen
     */
    const DESIGN_DEFAULTS = array(
        'css_active'       => false,
        'expert_mode'      => false,
        'hide_topbar'      => false,
        'header_color'     => 'original',
        'navbar_color'     => 'sand',
        'title_color'      => 'black',
        'navbar_text_color' => 'tanne',
    );

    /**
     * Standardwerte für Setup-Status
     */
    const SETUP_DEFAULTS = array(
        'landing_page_id'  => null,
        'setup_completed'  => false,
        'content_source'   => 'default',
        'json_content'     => '',
    );

    // ─── Getter ───────────────────────────────────────────────

    /**
     * Holt alle Inhalte mit Standardwerten
     *
     * @return array
     */
    public static function get_content() {
        $stored = get_option('gruenerator_content', array());
        $content = wp_parse_args($stored, self::CONTENT_DEFAULTS);

        // Tief-Merge der verschachtelten Arrays
        foreach (array('hero', 'about', 'hero_image', 'contact') as $section) {
            if (isset($stored[$section]) && is_array($stored[$section])) {
                $content[$section] = wp_parse_args($stored[$section], self::CONTENT_DEFAULTS[$section]);
            }
        }

        // Themes und Actions: sicherstellen, dass 3 Einträge existieren
        foreach (array('themes', 'actions') as $list_key) {
            if (!isset($stored[$list_key]) || !is_array($stored[$list_key])) {
                $content[$list_key] = self::CONTENT_DEFAULTS[$list_key];
            } else {
                for ($i = 0; $i < 3; $i++) {
                    if (!isset($content[$list_key][$i]) || !is_array($content[$list_key][$i])) {
                        $content[$list_key][$i] = self::CONTENT_DEFAULTS[$list_key][$i];
                    } else {
                        $content[$list_key][$i] = wp_parse_args(
                            $content[$list_key][$i],
                            self::CONTENT_DEFAULTS[$list_key][0]
                        );
                    }
                }
            }
        }

        return $content;
    }

    /**
     * Holt alle Design-Einstellungen mit Standardwerten
     *
     * @return array
     */
    public static function get_design() {
        return wp_parse_args(get_option('gruenerator_design', array()), self::DESIGN_DEFAULTS);
    }

    /**
     * Holt alle Setup-Einstellungen mit Standardwerten
     *
     * @return array
     */
    public static function get_setup() {
        return wp_parse_args(get_option('gruenerator_setup', array()), self::SETUP_DEFAULTS);
    }

    /**
     * Holt die Social-Media-Profile (Pipe-separierter String)
     *
     * @return string
     */
    public static function get_social() {
        return get_option('gruenerator_social', '');
    }

    // ─── Setter ───────────────────────────────────────────────

    /**
     * Aktualisiert einen Schlüssel im Content-Array
     *
     * @param string $key   Schlüssel im Content-Array (z.B. 'hero', 'about')
     * @param mixed  $value Neuer Wert
     */
    public static function update_content($key, $value) {
        $content = self::get_content();
        $content[$key] = $value;
        update_option('gruenerator_content', $content);
    }

    /**
     * Aktualisiert einen Schlüssel im Design-Array
     *
     * @param string $key   Schlüssel im Design-Array (z.B. 'css_active')
     * @param mixed  $value Neuer Wert
     */
    public static function update_design($key, $value) {
        $design = self::get_design();
        $design[$key] = $value;
        update_option('gruenerator_design', $design);
    }

    /**
     * Aktualisiert einen Schlüssel im Setup-Array
     *
     * @param string $key   Schlüssel im Setup-Array (z.B. 'landing_page_id')
     * @param mixed  $value Neuer Wert
     */
    public static function update_setup($key, $value) {
        $setup = self::get_setup();
        $setup[$key] = $value;
        update_option('gruenerator_setup', $setup);
    }

    /**
     * Aktualisiert die Social-Media-Profile
     *
     * @param string $value Pipe-separierter String
     */
    public static function update_social($value) {
        update_option('gruenerator_social', $value);
    }

    // ─── Migration ────────────────────────────────────────────

    /**
     * Prüft und führt die Migration durch, falls nötig
     */
    public static function maybe_migrate() {
        if ((int) get_option('gruenerator_options_version', 0) >= 2) {
            return;
        }
        self::migrate_v2();
        update_option('gruenerator_options_version', 2);
    }

    /**
     * Migriert von individuellen Optionen zu strukturierten Arrays (v2)
     */
    private static function migrate_v2() {
        // ── Content ──────────────────────────────────────────
        $content = array(
            'hero' => array(
                'heading' => get_option('gruenerator_hero_heading', ''),
                'text'    => get_option('gruenerator_hero_text', ''),
                'image'   => get_option('gruenerator_hero_image', ''),
            ),
            'about' => array(
                'title'   => get_option('gruenerator_about_me_title', ''),
                'content' => get_option('gruenerator_about_me_content', ''),
            ),
            'hero_image' => array(
                'image'    => get_option('gruenerator_hero_image_block_image', ''),
                'title'    => get_option('gruenerator_hero_image_block_title', ''),
                'subtitle' => get_option('gruenerator_hero_image_subtitle', ''),
            ),
            'themes' => array(),
            'actions' => array(),
            'contact' => array(
                'title' => get_option('gruenerator_contact_form_title', ''),
                'email' => get_option('gruenerator_contact_form_email', ''),
                'image' => get_option('gruenerator_contact_form_image', ''),
            ),
        );

        for ($i = 1; $i <= 3; $i++) {
            $content['themes'][] = array(
                'image'   => get_option('gruenerator_theme_image_' . $i, ''),
                'title'   => get_option('gruenerator_theme_title_' . $i, ''),
                'content' => get_option('gruenerator_theme_content_' . $i, ''),
            );
            $content['actions'][] = array(
                'image' => get_option('gruenerator_action_image_' . $i, ''),
                'text'  => get_option('gruenerator_action_text_' . $i, ''),
                'link'  => get_option('gruenerator_action_link_' . $i, ''),
            );
        }

        update_option('gruenerator_content', $content);

        // ── Design ───────────────────────────────────────────
        $design = array(
            'css_active'        => (bool) get_option('gruenerator_custom_css_active', false),
            'expert_mode'       => (bool) get_option('gruenerator_expert_mode', false),
            'hide_topbar'       => (bool) get_option('gruenerator_hide_topbar', false),
            'header_color'      => get_option('gruenerator_header_color', 'original'),
            'navbar_color'      => get_option('gruenerator_navbar_color', 'sand'),
            'title_color'       => get_option('gruenerator_title_color', 'black'),
            'navbar_text_color' => get_option('gruenerator_navbar_text_color', 'tanne'),
        );

        update_option('gruenerator_design', $design);

        // ── Social ───────────────────────────────────────────
        update_option('gruenerator_social', get_option('gruenerator_social_media_profiles', ''));

        // ── Setup ────────────────────────────────────────────
        $setup = array(
            'landing_page_id' => get_option('gruenerator_landing_page_id', null),
            'setup_completed' => (bool) get_option('gruenerator_setup_completed', false),
            'content_source'  => get_option('gruenerator_content_source', 'default'),
            'json_content'    => get_option('gruenerator_json_content', ''),
        );

        update_option('gruenerator_setup', $setup);

        // ── Alte Optionen entfernen ──────────────────────────
        $old_options = array(
            'gruenerator_hero_heading',
            'gruenerator_hero_text',
            'gruenerator_hero_image',
            'gruenerator_about_me_title',
            'gruenerator_about_me_content',
            'gruenerator_hero_image_block_image',
            'gruenerator_hero_image_block_title',
            'gruenerator_hero_image_subtitle',
            'gruenerator_contact_form_title',
            'gruenerator_contact_form_email',
            'gruenerator_contact_form_image',
            'gruenerator_custom_css_active',
            'gruenerator_expert_mode',
            'gruenerator_hide_topbar',
            'gruenerator_header_color',
            'gruenerator_navbar_color',
            'gruenerator_title_color',
            'gruenerator_navbar_text_color',
            'gruenerator_social_media_profiles',
            'gruenerator_landing_page_id',
            'gruenerator_setup_completed',
            'gruenerator_content_source',
            'gruenerator_json_content',
            'gruenerator_content_source_selected',
        );

        for ($i = 1; $i <= 3; $i++) {
            $old_options[] = 'gruenerator_theme_image_' . $i;
            $old_options[] = 'gruenerator_theme_title_' . $i;
            $old_options[] = 'gruenerator_theme_content_' . $i;
            $old_options[] = 'gruenerator_action_image_' . $i;
            $old_options[] = 'gruenerator_action_text_' . $i;
            $old_options[] = 'gruenerator_action_link_' . $i;
        }

        foreach ($old_options as $opt) {
            delete_option($opt);
        }
    }
}
