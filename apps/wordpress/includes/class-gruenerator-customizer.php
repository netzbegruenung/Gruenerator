<?php
if (!defined('ABSPATH')) {
    exit; // Exit if accessed directly
}

// Funktion, um benutzerdefiniertes CSS in den Customizer einzufügen
function gruenerator_custom_css_inject() {
    // Das CSS, das eingefügt werden soll
    $custom_css = '
    .topmenu {
        display: none !important;
    }
    .site-header > .bloginfo.bg-primary {
        background-color: #005437 !important;    
    }
    .navbar.navbar-main.navbar-expand-lg.bg-white {
        background-color: #F5F1E9 !important;
        font-weight: bold;
    }
    .navbar.navbar-main.navbar-expand-lg.bg-white a {
        color: #005437 !important;
        text-transform: none;
    }';

    // CSS in den Customizer einfügen
    if (!get_theme_mod('gruenerator_custom_css')) {
        set_theme_mod('gruenerator_custom_css', $custom_css);
    }
}

// Funktion, um das benutzerdefinierte CSS auf der Website auszugeben
function gruenerator_apply_custom_css() {
    $expert_mode = (bool)get_option('gruenerator_expert_mode', false);
    $css_active = (bool)get_option('gruenerator_custom_css_active', false);
    
    if ($expert_mode) {
        // Im Expertenmodus individuelle Einstellungen anwenden
        $hide_topbar = (bool)get_option('gruenerator_hide_topbar', false);
        $header_color = get_option('gruenerator_header_color', 'original');
        $navbar_color = get_option('gruenerator_navbar_color', 'sand');
        $title_color = get_option('gruenerator_title_color', 'black');
        $navbar_text_color = get_option('gruenerator_navbar_text_color', 'tanne');
        
        $css = '';
        
        if ($hide_topbar) {
            $css .= '.topmenu { display: none !important; }';
        }
        
        if ($header_color !== 'original') {
            if ($header_color === 'tanne') {
                $css .= '.site-header > .bloginfo.bg-primary { background-color: var(--gruenerator-tanne, #005437) !important; }';
            } elseif ($header_color === 'white') {
                $css .= '.site-header > .bloginfo.bg-primary { background-color: #ffffff !important; }';
            }
        }

        // Navbar-Farbe
        if ($navbar_color === 'sand') {
            $css .= '.navbar.navbar-main.navbar-expand-lg.bg-white { background-color: #F5F1E9 !important; }';
        } elseif ($navbar_color === 'white') {
            $css .= '.navbar.navbar-main.navbar-expand-lg.bg-white { background-color: #ffffff !important; }';
        } elseif ($navbar_color === 'tanne') {
            $css .= '.navbar.navbar-main.navbar-expand-lg.bg-white { background-color: var(--gruenerator-tanne, #005437) !important; }';
        }

        // Navbar-Schriftfarbe
        switch ($navbar_text_color) {
            case 'white':
                $css .= '.navbar-light .navbar-nav .nav-link { color: #ffffff !important; }';
                break;
            case 'sand':
                $css .= '.navbar-light .navbar-nav .nav-link { color: #F5F1E9 !important; }';
                break;
            case 'tanne':
                $css .= '.navbar-light .navbar-nav .nav-link { color: var(--gruenerator-tanne, #005437) !important; }';
                break;
            case 'black':
                $css .= '.navbar-light .navbar-nav .nav-link { color: #000000 !important; }';
                break;
        }

        // Titel-Farbe
        switch ($title_color) {
            case 'white':
                $css .= '.theme--default .bloginfo-name { color: #ffffff !important; }';
                break;
            case 'sand':
                $css .= '.theme--default .bloginfo-name { color: #F5F1E9 !important; }';
                break;
            case 'tanne':
                $css .= '.theme--default .bloginfo-name { color: var(--gruenerator-tanne, #005437) !important; }';
                break;
            case 'black':
                $css .= '.theme--default .bloginfo-name { color: #000000 !important; }';
                break;
        }
        
        if ($css !== '') {
            echo '<style type="text/css">' . wp_strip_all_tags($css) . '</style>';
        }
    } else if ($css_active) {
        // Normaler Modus mit komplettem CSS
        $custom_css = (string)get_theme_mod('gruenerator_custom_css', '');
        if ($custom_css !== '') {
            echo '<style type="text/css">' . wp_strip_all_tags($custom_css) . '</style>';
        }
    }
}
add_action('wp_head', 'gruenerator_apply_custom_css');

// AJAX-Handler für das Umschalten des Expertenmodus
function gruenerator_ajax_toggle_expert_mode() {
    check_ajax_referer('gruenerator_toggle_css', 'nonce');
    
    if (!current_user_can('manage_options')) {
        wp_send_json_error('Nicht autorisiert');
    }

    $expert_mode = isset($_POST['expert_mode']) ? (bool)$_POST['expert_mode'] : false;
    update_option('gruenerator_expert_mode', $expert_mode);
    
    if ($expert_mode) {
        update_option('gruenerator_custom_css_active', false);
    }
    
    wp_send_json_success();
}
add_action('wp_ajax_gruenerator_toggle_expert_mode', 'gruenerator_ajax_toggle_expert_mode');

// AJAX-Handler für das Umschalten der Topbar
function gruenerator_ajax_toggle_topbar() {
    check_ajax_referer('gruenerator_toggle_css', 'nonce');
    
    if (!current_user_can('manage_options')) {
        wp_send_json_error('Nicht autorisiert');
    }

    $hide_topbar = isset($_POST['hide_topbar']) ? (bool)$_POST['hide_topbar'] : false;
    update_option('gruenerator_hide_topbar', $hide_topbar);
    
    wp_send_json_success();
}
add_action('wp_ajax_gruenerator_toggle_topbar', 'gruenerator_ajax_toggle_topbar');

// AJAX-Handler für das Umschalten des CSS
function gruenerator_ajax_toggle_css() {
    check_ajax_referer('gruenerator_toggle_css', 'nonce');
    
    if (!current_user_can('manage_options')) {
        wp_send_json_error('Nicht autorisiert');
    }

    $css_active = isset($_POST['toggle_css']) ? (bool)$_POST['toggle_css'] : false;
    update_option('gruenerator_custom_css_active', $css_active);
    
    wp_send_json_success();
}
add_action('wp_ajax_gruenerator_toggle_css', 'gruenerator_ajax_toggle_css');

// Initialisierung der CSS-Einstellungen
function gruenerator_init_css_settings() {
    if (get_option('gruenerator_custom_css_active') === false) {
        add_option('gruenerator_custom_css_active', false);
    }
    if (get_option('gruenerator_expert_mode') === false) {
        add_option('gruenerator_expert_mode', false);
    }
    if (get_option('gruenerator_hide_topbar') === false) {
        add_option('gruenerator_hide_topbar', false);
    }
    gruenerator_custom_css_inject();
}
add_action('admin_init', 'gruenerator_init_css_settings');

// AJAX-Handler für das Ändern der Header-Farbe
function gruenerator_ajax_change_header_color() {
    check_ajax_referer('gruenerator_toggle_css', 'nonce');
    
    if (!current_user_can('manage_options')) {
        wp_send_json_error('Nicht autorisiert');
    }

    $header_color = isset($_POST['header_color']) ? sanitize_text_field($_POST['header_color']) : 'original';
    update_option('gruenerator_header_color', $header_color);
    
    wp_send_json_success();
}
add_action('wp_ajax_gruenerator_change_header_color', 'gruenerator_ajax_change_header_color');

// AJAX-Handler für das Ändern der Navbar-Farbe
function gruenerator_ajax_change_navbar_color() {
    check_ajax_referer('gruenerator_toggle_css', 'nonce');
    
    if (!current_user_can('manage_options')) {
        wp_send_json_error('Nicht autorisiert');
    }

    $navbar_color = isset($_POST['navbar_color']) ? sanitize_text_field($_POST['navbar_color']) : 'sand';
    update_option('gruenerator_navbar_color', $navbar_color);
    
    wp_send_json_success();
}
add_action('wp_ajax_gruenerator_change_navbar_color', 'gruenerator_ajax_change_navbar_color');

// AJAX-Handler für das Ändern der Titelfarbe
function gruenerator_ajax_change_title_color() {
    check_ajax_referer('gruenerator_toggle_css', 'nonce');
    
    if (!current_user_can('manage_options')) {
        wp_send_json_error('Nicht autorisiert');
    }

    $title_color = isset($_POST['title_color']) ? sanitize_text_field($_POST['title_color']) : 'black';
    update_option('gruenerator_title_color', $title_color);
    
    wp_send_json_success();
}
add_action('wp_ajax_gruenerator_change_title_color', 'gruenerator_ajax_change_title_color');

// AJAX-Handler für das Ändern der Navbar-Schriftfarbe
function gruenerator_ajax_change_navbar_text_color() {
    check_ajax_referer('gruenerator_toggle_css', 'nonce');
    
    if (!current_user_can('manage_options')) {
        wp_send_json_error('Nicht autorisiert');
    }

    $navbar_text_color = isset($_POST['navbar_text_color']) ? sanitize_text_field($_POST['navbar_text_color']) : 'tanne';
    update_option('gruenerator_navbar_text_color', $navbar_text_color);
    
    wp_send_json_success();
}
add_action('wp_ajax_gruenerator_change_navbar_text_color', 'gruenerator_ajax_change_navbar_text_color');
