<?php

/**
 * @package Gruenerator
 * @version 1.0.0
 * 
 * @wordpress-plugin
 * Plugin Name: Grünerator WordPress
 * Description: Erstelle professionelle Kandidatenseiten für grüne Kandidierende mit speziellen Gutenberg-Blöcken. Dieses Plugin wurde speziell für das Sunflower WordPress-Theme entwickelt und erfordert dessen Installation.
 * Version: 1.0.0
 * Author: Moritz Wächter
 * License: GPL v2 oder später
 * License URI: http://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: gruenerator
 * Domain Path: /languages
 * Requires at least: 5.8
 * Requires PHP: 7.4
 * Requires Plugins: 
 * Requires Themes: sunflower
 *
 * Dieses Plugin ist eine Erweiterung für das Sunflower-Theme und fügt spezielle
 * Gutenberg-Blöcke und Funktionen hinzu, die auf das Theme abgestimmt sind.
 *
 * @since 1.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

// Definiere Konstanten für Pfade
define('GRUENERATOR_PATH', plugin_dir_path(__FILE__));
define('GRUENERATOR_URL', plugin_dir_url(__FILE__));

// Lade die Hauptklassen
require_once GRUENERATOR_PATH . 'includes/class-gruenerator-customizer.php';
require_once GRUENERATOR_PATH . 'includes/class-gruenerator-blocks.php';
require_once GRUENERATOR_PATH . 'includes/class-gruenerator-meta-fields.php';
require_once GRUENERATOR_PATH . 'includes/class-gruenerator-social-media.php';
require_once GRUENERATOR_PATH . 'includes/class-gruenerator-settings.php';

// Lade Admin-spezifische Dateien
require_once GRUENERATOR_PATH . 'admin/gruenerator-setup-wizard.php';
require_once GRUENERATOR_PATH . 'admin/social-media-settings-page.php';
require_once GRUENERATOR_PATH . 'admin/gruenerator-settings.php';

// Erforderliche Dateien einbinden
require_once GRUENERATOR_PATH . 'includes/class-gruenerator-default-content.php';
require_once GRUENERATOR_PATH . 'includes/class-gruenerator-content-source.php';

// Hier können weitere Funktionen und Hooks hinzugefügt werden...

/**
 * Initialisiert das Admin-Menü
 * 
 * @since 1.0.0
 * @return void
 */
function gruenerator_add_admin_menu() {
    add_menu_page(
        __('Grünerator', 'gruenerator'),
        __('Grünerator', 'gruenerator'),
        'manage_options',
        'gruenerator-generator',
        'gruenerator_main_page',
        'dashicons-admin-generic'
    );

    add_submenu_page(
        'gruenerator-generator',
        __('Social Media Einstellungen', 'gruenerator'),
        __('Social Media', 'gruenerator'),
        'manage_options',
        'gruenerator-social-media',
        'gruenerator_social_media_settings_page'
    );

    add_submenu_page(
        'gruenerator-generator',
        __('Setup-Assistent', 'gruenerator'),
        __('Setup-Assistent', 'gruenerator'),
        'manage_options',
        'gruenerator-setup-wizard',
        'gruenerator_setup_wizard'
    );

    add_submenu_page(
        'gruenerator-generator',
        __('Einstellungen', 'gruenerator'),
        __('Einstellungen', 'gruenerator'),
        'manage_options',
        'gruenerator-settings',
        'gruenerator_settings_page'
    );
}
add_action('admin_menu', 'gruenerator_add_admin_menu');

function gruenerator_main_page() {
    ?>
    <div class="wrap gruenerator-dashboard">
        <div class="gruenerator-header">
            <h1>
                <span class="dashicons dashicons-admin-generic"></span>
                Willkommen beim Grünerator
            </h1>
            <p class="about-description">
                Erstelle eine professionelle politische Landingpage in wenigen Minuten.
            </p>
        </div>

        <div class="gruenerator-grid">
            <div class="gruenerator-card">
                <div class="gruenerator-card-header">
                    <span class="dashicons dashicons-admin-settings"></span>
                    <h2>Setup-Assistent</h2>
                </div>
                <p>Starte den Setup-Assistenten, um deine Landingpage Schritt für Schritt zu erstellen.</p>
                <a href="<?php echo admin_url('admin.php?page=gruenerator-setup-wizard'); ?>" class="button button-primary">
                    Zum Setup-Assistenten
                </a>
            </div>

            <div class="gruenerator-card">
                <div class="gruenerator-card-header">
                    <span class="dashicons dashicons-share"></span>
                    <h2>Social Media</h2>
                </div>
                <p>Verwalte deine Social Media Links und Einstellungen.</p>
                <a href="<?php echo admin_url('admin.php?page=gruenerator-social-media'); ?>" class="button button-primary">
                    Social Media verwalten
                </a>
            </div>

            <div class="gruenerator-card">
                <div class="gruenerator-card-header">
                    <span class="dashicons dashicons-admin-tools"></span>
                    <h2>Einstellungen</h2>
                </div>
                <p><?php echo Gruenerator_Settings::get_dashboard_description(); ?></p>
                <a href="<?php echo admin_url('admin.php?page=gruenerator-settings'); ?>" class="button button-primary">
                    Einstellungen verwalten
                </a>
            </div>

            <div class="gruenerator-footer">
                <h3>Hilfe & Support</h3>
                <p>
                    Benötigst du Hilfe? Besuche unsere <a href="https://github.com/netzbegruenung/Gruenerator_Wordpress" target="_blank">GitHub-Seite</a> 
                    oder schreibe eine E-Mail an <a href="mailto:info@moritz-waechter.de">info@moritz-waechter.de</a>.
                </p>
            </div>
        </div>
    </div>
    <?php
}

/**
 * Definiere die Block-Kategorie
 */
function gruenerator_block_category( $categories, $post ) {
    return array_merge(
        $categories,
        array(
            array(
                'slug'  => 'gruenerator-category',
                'title' => __( 'Grünerator Blöcke', 'gruenerator' ),
                'icon'  => null,
            ),
        )
    );
}
add_filter('block_categories_all', 'gruenerator_block_category', 10, 2);

/**
 * Modifiziert den Output des Kontaktformular-Blocks, um ein Hintergrundbild hinzuzufügen
 */
function gruenerator_modify_contact_form_output($block_content, $block) {
    if ($block['blockName'] === 'sunflower/contact-form') {
        $background_image = isset($block['attrs']['grueneratorBackgroundImage']) ? $block['attrs']['grueneratorBackgroundImage'] : '';
        $title = isset($block['attrs']['grueneratorTitle']) ? $block['attrs']['grueneratorTitle'] : '';
        
        if ($background_image || $title) {
            $wrapper_start = '<div class="wp-block-sunflower-contact-form-wrapper"' . ($background_image ? ' style="background-image: url(\'' . esc_url($background_image) . '\');"' : '') . '>';
            $wrapper_end = '</div>';
            
            if ($title) {
                $title_html = '<h2 class="wp-block-sunflower-contact-form-title">' . esc_html($title) . '</h2>';
                $block_content = $title_html . $block_content;
            }
            
            $block_content = $wrapper_start . $block_content . $wrapper_end;
        }
    }
    return $block_content;
}
add_filter('render_block', 'gruenerator_modify_contact_form_output', 10, 2);

function gruenerator_enqueue_admin_scripts($hook) {
    // Lade Media-Scripts auf allen Admin-Seiten, die sie benötigen könnten
    if (strpos($hook, 'gruenerator') !== false || 
        $hook == 'post.php' || 
        $hook == 'post-new.php' || 
        $hook == 'page.php' || 
        $hook == 'page-new.php') {
        wp_enqueue_media();
        wp_enqueue_script('jquery');
        wp_enqueue_script('gruenerator-admin-js', GRUENERATOR_URL . 'admin/js/gruenerator-admin.js', array('jquery'), '1.0.0', true);
    }
}
add_action('admin_enqueue_scripts', 'gruenerator_enqueue_admin_scripts');

/**
 * Enqueue Admin Styles
 */
function gruenerator_enqueue_admin_styles($hook) {
    // Fügen Sie hier Bedingungen hinzu, um die Styles nur auf bestimmten Admin-Seiten zu laden
    wp_enqueue_style('gruenerator-admin-styles', GRUENERATOR_URL . 'build/index.css', array(), '1.0.0');
}
add_action('admin_enqueue_scripts', 'gruenerator_enqueue_admin_styles');
?>
