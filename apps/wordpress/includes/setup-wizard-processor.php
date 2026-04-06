<?php
// Verhindert direkten Zugriff auf die Datei
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Generiert den Inhalt für die Landing Page.
 *
 * @return string Der generierte Inhalt der Landing Page.
 */


function gruenerator_process_setup_wizard() {
    gruenerator_log("gruenerator_process_setup_wizard wurde aufgerufen", 'debug');

    $current_step = isset($_POST['step']) ? intval($_POST['step']) : 0;

    switch ($current_step) {
        case 0:
            // Willkommensseite, keine Verarbeitung nötig
            return true;
        case 1:
            return gruenerator_process_content_source();
        case 2:
            gruenerator_process_css_settings();
            break;
        case 3:
            gruenerator_process_social_networks();
            break;
        case 4:
            gruenerator_process_hero_section();
            break;
        case 5:
            gruenerator_process_about_me();
            break;
        case 6:
            gruenerator_process_hero_image_block();
            break;
        case 7:
            gruenerator_process_my_themes();
            break;
        case 8:
            gruenerator_process_image_grid();
            break;
        case 9:
            gruenerator_process_contact_form();
            break;
        case 10:
            gruenerator_process_final_step();
            break;
        default:
            gruenerator_log("Unbekannter Schritt: " . $current_step, 'error');
            return false;
    }

    gruenerator_log("Schritt " . $current_step . " erfolgreich verarbeitet", 'info');
    return true;
}

/**
 * Verarbeitet die Auswahl der Inhaltsquelle
 */
function gruenerator_process_content_source() {
    $content_source = isset($_POST['content_source']) ? sanitize_text_field($_POST['content_source']) : 'default';
    $json_content = isset($_POST['json_content']) ? wp_unslash($_POST['json_content']) : '';

    // Validate JSON format early
    if ($content_source === 'json' && !empty($json_content)) {
        $parsed = json_decode($json_content, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            add_settings_error('gruenerator_messages', 'gruenerator_message',
                __('Ungültiges JSON-Format. Bitte überprüfe deine Eingabe.', 'gruenerator'), 'error');
            return false;
        }
    }

    if ($content_source === 'json') {
        if (empty($json_content)) {
            gruenerator_log("Kein JSON-Inhalt angegeben", 'error');
            return false;
        }

        if (!Gruenerator_Content_Source::validate_json_content($json_content)) {
            gruenerator_log("Ungültiger JSON-Inhalt", 'error');
            return false;
        }
    }

    $result = Gruenerator_Content_Source::set_content_source($content_source, $json_content);
    if ($result) {
        Gruenerator_Content_Source::mark_source_selected();
        gruenerator_log("Inhaltsquelle erfolgreich gesetzt: " . $content_source, 'info');
        return true;
    }

    gruenerator_log("Fehler beim Setzen der Inhaltsquelle", 'error');
    return false;
}

function gruenerator_process_css_settings() {
    $use_css = isset($_POST['gruenerator_use_css']) ? 1 : 0;
    Gruenerator_Options::update_design('css_active', (bool) $use_css);
    gruenerator_log("CSS-Einstellungen aktualisiert: " . $use_css, 'info');
}

function gruenerator_process_social_networks() {
    $social_networks = array('facebook', 'twitter', 'instagram');
    $social_urls = array();
    foreach ($social_networks as $network) {
        $value = isset($_POST['gruenerator_social_' . $network]) ? esc_url_raw($_POST['gruenerator_social_' . $network]) : '';
        $social_urls[$network] = $value;
        gruenerator_log($network . " URL aktualisiert: " . $value, 'info');
    }

    // Sync to pipe-separated format used by Social Media settings page
    $icon_map = array(
        'facebook'  => array('icon' => 'fab fa-facebook-f', 'name' => 'Facebook'),
        'twitter'   => array('icon' => 'fab fa-twitter',    'name' => 'Twitter'),
        'instagram' => array('icon' => 'fab fa-instagram',  'name' => 'Instagram'),
    );

    // Preserve existing profiles not covered by wizard (e.g. LinkedIn, YouTube)
    $existing = Gruenerator_Options::get_social();
    $existing_entries = array();
    $wizard_icons = array_column($icon_map, 'icon');
    foreach (explode("\n", $existing) as $line) {
        $parts = explode(';', $line);
        if (count($parts) >= 3 && !in_array($parts[0], $wizard_icons, true)) {
            $existing_entries[] = $line;
        }
    }

    // Build entries from wizard data
    $wizard_entries = array();
    foreach ($social_networks as $network) {
        $value = $social_urls[$network];
        if (!empty($value)) {
            $wizard_entries[] = $icon_map[$network]['icon'] . ';' . $icon_map[$network]['name'] . ';' . $value;
        }
    }

    $all_entries = array_merge($wizard_entries, $existing_entries);
    Gruenerator_Options::update_social(implode("\n", $all_entries));
}

function gruenerator_process_hero_section() {
    $hero_image = isset($_POST['gruenerator_hero_image']) ? intval($_POST['gruenerator_hero_image']) : 0;
    $hero_heading = isset($_POST['gruenerator_hero_heading']) ? sanitize_text_field($_POST['gruenerator_hero_heading']) : '';
    $hero_text = isset($_POST['gruenerator_hero_text']) ? wp_kses_post($_POST['gruenerator_hero_text']) : '';

    Gruenerator_Options::update_content('hero', array(
        'heading' => $hero_heading,
        'text'    => $hero_text,
        'image'   => $hero_image,
    ));

    gruenerator_log("Hero-Bereich aktualisiert", 'info');
}

function gruenerator_process_about_me() {
    $about_title = isset($_POST['gruenerator_about_me_title']) ? sanitize_text_field($_POST['gruenerator_about_me_title']) : '';
    $about_content = isset($_POST['gruenerator_about_me_content']) ? wp_kses_post($_POST['gruenerator_about_me_content']) : '';

    Gruenerator_Options::update_content('about', array(
        'title'   => $about_title,
        'content' => $about_content,
    ));

    gruenerator_log("Über mich Bereich aktualisiert - Titel: " . $about_title, 'info');
}

function gruenerator_process_hero_image_block() {
    $hero_image_block_image = isset($_POST['gruenerator_hero_image_block_image']) ? intval($_POST['gruenerator_hero_image_block_image']) : 0;
    $hero_image_block_title = isset($_POST['gruenerator_hero_image_title']) ? sanitize_text_field($_POST['gruenerator_hero_image_title']) : '';
    $hero_image_subtitle = isset($_POST['gruenerator_hero_image_subtitle']) ? wp_kses_post($_POST['gruenerator_hero_image_subtitle']) : '';

    Gruenerator_Options::update_content('hero_image', array(
        'image'    => $hero_image_block_image,
        'title'    => $hero_image_block_title,
        'subtitle' => $hero_image_subtitle,
    ));

    gruenerator_log("Hero Image Block aktualisiert", 'info');
}

function gruenerator_process_my_themes() {
    $themes = array();
    for ($i = 1; $i <= 3; $i++) {
        $theme_image = isset($_POST['gruenerator_theme_image_' . $i]) ? intval($_POST['gruenerator_theme_image_' . $i]) : 0;
        $theme_title = isset($_POST['gruenerator_theme_title_' . $i]) ? sanitize_text_field($_POST['gruenerator_theme_title_' . $i]) : '';
        $theme_content = isset($_POST['gruenerator_theme_content_' . $i]) ? wp_kses_post($_POST['gruenerator_theme_content_' . $i]) : '';

        $themes[] = array(
            'image'   => $theme_image,
            'title'   => $theme_title,
            'content' => $theme_content,
        );
    }

    Gruenerator_Options::update_content('themes', $themes);
    gruenerator_log("Meine Themen aktualisiert", 'info');
}

function gruenerator_process_image_grid() {
    $actions = array();
    for ($i = 1; $i <= 3; $i++) {
        $action_image = isset($_POST['gruenerator_action_image_' . $i]) ? intval($_POST['gruenerator_action_image_' . $i]) : 0;
        $action_text = isset($_POST['gruenerator_action_text_' . $i]) ? sanitize_text_field($_POST['gruenerator_action_text_' . $i]) : '';
        $action_link = isset($_POST['gruenerator_action_link_' . $i]) ? esc_url_raw($_POST['gruenerator_action_link_' . $i]) : '';

        $actions[] = array(
            'image' => $action_image,
            'text'  => $action_text,
            'link'  => $action_link,
        );
    }

    Gruenerator_Options::update_content('actions', $actions);
    gruenerator_log("Aktionsbereich aktualisiert", 'info');
}

function gruenerator_process_contact_form() {
    $contact_form_title = isset($_POST['gruenerator_contact_form_title']) ? sanitize_text_field($_POST['gruenerator_contact_form_title']) : '';
    $contact_form_email = isset($_POST['gruenerator_contact_form_email']) ? sanitize_email($_POST['gruenerator_contact_form_email']) : '';
    $contact_form_image = isset($_POST['gruenerator_contact_form_image']) ? intval($_POST['gruenerator_contact_form_image']) : 0;

    Gruenerator_Options::update_content('contact', array(
        'title' => $contact_form_title,
        'email' => $contact_form_email,
        'image' => $contact_form_image,
    ));

    gruenerator_log("Kontaktformular aktualisiert - Titel: " . $contact_form_title, 'info');
}

// Fügen Sie diese neue Funktion am Ende der Datei hinzu
function gruenerator_process_final_step() {
    // Erstelle die Landingpage
    $page_title = 'Grünerator Landing Page';

    // Hole alle gespeicherten Werte
    $content = Gruenerator_Options::get_content();

    $hero_image = wp_get_attachment_url($content['hero']['image']);
    $hero_heading = $content['hero']['heading'];
    $hero_text = $content['hero']['text'];

    $about_title = $content['about']['title'];
    $about_content = $content['about']['content'];

    $hero_block_image = wp_get_attachment_url($content['hero_image']['image']);
    $hero_block_title = $content['hero_image']['title'];
    $hero_block_subtitle = $content['hero_image']['subtitle'];

    // Erstelle den Seiteninhalt mit den gespeicherten Werten
    $page_content = '<!-- wp:group {"layout":{"type":"constrained"}} -->
<div class="wp-block-group">

<!-- wp:gruenerator/hero-block {"heroImageUrl":"' . esc_url($hero_image) . '","heroHeading":"' . esc_attr($hero_heading) . '","heroText":"' . esc_attr($hero_text) . '"} /-->

<!-- wp:gruenerator/about-block {
    "title": "' . esc_attr($about_title) . '",
    "content": "' . esc_attr($about_content) . '"
} /-->

<!-- wp:gruenerator/hero-image-block {"align":"full","backgroundImageUrl":"' . esc_url($hero_block_image) . '","title":"' . esc_attr($hero_block_title) . '","subtitle":"' . esc_attr($hero_block_subtitle) . '"} /-->';

    // Füge die Themenbereiche hinzu
    $page_content .= '<!-- wp:gruenerator/meine-themen-block {"themes":[';

    $themes = array();
    for ($i = 0; $i < 3; $i++) {
        $theme = $content['themes'][$i];
        $theme_image = wp_get_attachment_url($theme['image']);
        $theme_title = $theme['title'];
        $theme_content_text = $theme['content'];

        if ($theme_image || $theme_title || $theme_content_text) {
            $themes[] = '{
                "imageUrl":"' . esc_url($theme_image ? $theme_image : '') . '",
                "title":"' . esc_attr($theme_title) . '",
                "content":"' . esc_attr($theme_content_text) . '"
            }';
        }
    }
    $page_content .= implode(',', $themes);
    $page_content .= ']} /-->';

    // Füge die Aktionsbereiche hinzu
    $page_content .= '<!-- wp:gruenerator/image-grid-block {"align":"full","items":[';

    $actions = array();
    for ($i = 0; $i < 3; $i++) {
        $action = $content['actions'][$i];
        $action_image = wp_get_attachment_url($action['image']);
        $action_text = $action['text'];
        $action_link = $action['link'];

        if ($action_image || $action_text) {
            $actions[] = '{
                "imageUrl":"' . esc_url($action_image ? $action_image : '') . '",
                "text":"' . esc_attr($action_text) . '",
                "link":"' . esc_url($action_link) . '"
            }';
        }
    }
    $page_content .= implode(',', $actions);
    $page_content .= ']} /-->';

    // Füge das Kontaktformular hinzu
    $contact_title = $content['contact']['title'];
    $contact_image = wp_get_attachment_url($content['contact']['image']);
    $contact_email = $content['contact']['email'];

    $page_content .= '<!-- wp:gruenerator/contact-form-block {
        "align":"full",
        "backgroundImageUrl":"' . esc_url($contact_image ? $contact_image : '') . '",
        "title":"' . esc_attr($contact_title) . '",
        "email":"' . esc_attr($contact_email) . '"
    } -->
    <div class="wp-block-gruenerator-contact-form-block alignfull">
        <div class="contact-form-block" style="background-image: url(\'' . esc_url($contact_image ? $contact_image : '') . '\');">
            <div class="contact-form-content">
                <div class="contact-form-left">
                    <h2 class="contact-form-title">' . esc_html($contact_title) . '</h2>
                </div>
                <div class="contact-form-right">
                    <!-- wp:sunflower/contact-form /-->
                </div>
            </div>
        </div>
    </div>
    <!-- /wp:gruenerator/contact-form-block -->';

    $page_content .= '</div>
<!-- /wp:group -->';

    $page_id = wp_insert_post(array(
        'post_title'    => $page_title,
        'post_content'  => $page_content,
        'post_status'   => 'publish',
        'post_type'     => 'page',
    ));

    if ($page_id) {
        // Speichere die ID der erstellten Seite
        Gruenerator_Options::update_setup('landing_page_id', $page_id);

        // Markiere das Setup als abgeschlossen
        Gruenerator_Options::update_setup('setup_completed', true);

        // Leite zur Erfolgsseite weiter
        wp_safe_redirect(add_query_arg(
            array(
                'page' => 'gruenerator-setup-wizard',
                'show_completion' => 'true'
            ),
            admin_url('admin.php')
        ));
        exit;
    } else {
        gruenerator_log("Fehler beim Erstellen der Landingpage", 'error');
        wp_die('Fehler beim Erstellen der Landingpage');
    }
}
