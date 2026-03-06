<?php
if (!defined('ABSPATH')) {
    exit; // Exit if accessed directly
}

// Erforderliche Dateien einbinden
require_once GRUENERATOR_PATH . 'includes/setup-wizard-steps.php';
require_once GRUENERATOR_PATH . 'includes/setup-wizard-processor.php';

function gruenerator_is_setup_complete() {
    return get_option('gruenerator_setup_completed', false);
}

function gruenerator_log($message, $level = 'info') {
    if (WP_DEBUG === true) {
        $log_entry = '[' . date('Y-m-d H:i:s') . '] ' . strtoupper($level) . ': ' . $message;
        if (is_array($message) || is_object($message)) {
            $log_entry .= PHP_EOL . print_r($message, true);
        }
        error_log($log_entry);
    }
}

function gruenerator_setup_wizard() {
    if (!current_user_can('manage_options')) {
        gruenerator_log("Unzureichende Berechtigungen für Benutzer: " . wp_get_current_user()->user_login, 'error');
        wp_die('Unzureichende Berechtigungen');
    }

    // Hole den aktuellen Schritt
    $current_step = isset($_GET['step']) ? intval($_GET['step']) : 1;
    $show_completion = isset($_GET['show_completion']) && $_GET['show_completion'] === 'true';

    // Wenn die Erfolgsseite angezeigt werden soll, zeige sie direkt an
    if ($show_completion) {
        gruenerator_setup_complete_page();
        return;
    }

    // Prüfe, ob das Setup bereits abgeschlossen wurde
    if (gruenerator_is_setup_complete() && $current_step === 1 && !isset($_POST['gruenerator_restart_setup'])) {
        ?>
        <div class="wrap">
            <div class="gruenerator-setup-completed-notice">
                <span class="dashicons dashicons-yes-alt"></span>
                <h1>Setup-Assistent</h1>
                <p>Das Setup wurde bereits abgeschlossen. Möchtest du es erneut durchführen?</p>
                <form method="post">
                    <?php wp_nonce_field('gruenerator_restart_setup'); ?>
                    <div class="gruenerator-action-buttons">
                        <input type="submit" name="gruenerator_restart_setup" class="button button-primary" value="Setup neu starten">
                        <a href="<?php echo admin_url('admin.php?page=gruenerator-generator'); ?>" class="button button-secondary">Zum Dashboard</a>
                    </div>
                </form>
            </div>
        </div>
        <?php
        return;
    }

    // Wenn das Setup neu gestartet werden soll
    if (isset($_POST['gruenerator_restart_setup']) && check_admin_referer('gruenerator_restart_setup')) {
        delete_option('gruenerator_setup_completed');
    }

    $steps = array(
        0 => 'Willkommen',
        1 => 'Inhaltsquelle',
        2 => 'CSS-Einstellungen',
        3 => 'Soziale Netzwerke',
        4 => 'Hero-Bereich',
        5 => 'Über mich',
        6 => 'Hero Image Block',
        7 => 'Meine Themen',
        8 => 'Bildergalerie',
        9 => 'Kontaktformular',
        10 => 'Abschluss'
    );

    gruenerator_log("Anzeige des Setup-Wizard-Schritts: " . $current_step, 'info');

    ?>
    <div class="wrap gruenerator-setup-wizard" data-step="<?php echo esc_attr($current_step); ?>">
        <h1><?php echo esc_html(get_admin_page_title()); ?></h1>
        <?php gruenerator_display_progress_bar($steps, $current_step); ?>
        <?php gruenerator_display_error_messages(); ?>

        <?php if ($current_step != 0): ?>
            <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" class="gruenerator-form">
                <input type="hidden" name="action" value="gruenerator_process_setup">
                <input type="hidden" name="step" value="<?php echo $current_step; ?>">
                <?php wp_nonce_field('gruenerator_setup_nonce'); ?>
        <?php endif; ?>

        <?php gruenerator_display_step_content($current_step); ?>

        <?php if ($current_step != 0): ?>
            <?php gruenerator_display_navigation_buttons($current_step); ?>
            </form>
        <?php endif; ?>
    </div>
    <?php
}

function gruenerator_display_progress_bar($steps, $current_step) {
    ?>
    <div class="gruenerator-progress-bar">
        <?php foreach ($steps as $step_number => $step_name): ?>
            <div class="gruenerator-progress-step <?php echo $step_number <= $current_step ? 'active' : ''; ?>">
                <span class="step-number"><?php echo $step_number; ?></span>
                <span class="step-name"><?php echo $step_name; ?></span>
            </div>
        <?php endforeach; ?>
    </div>
    <?php
}

function gruenerator_display_error_messages() {
    if (isset($_GET['error'])) {
        echo '<div class="error"><p>' . esc_html__('Es ist ein Fehler aufgetreten. Bitte versuche es erneut.', 'gruenerator') . '</p></div>';
    }
}

function gruenerator_display_step_content($current_step) {
    switch ($current_step) {
        case 0:
            gruenerator_welcome_page();
            break;
        case 1:
            gruenerator_content_source();
            break;
        case 2:
            gruenerator_css_settings();
            break;
        case 3:
            gruenerator_social_networks();
            break;
        case 4:
            gruenerator_hero_section();
            break;
        case 5:
            gruenerator_about_me();
            break;
        case 6:
            gruenerator_hero_image_block();
            break;
        case 7:
            gruenerator_my_themes();
            break;
        case 8:
            gruenerator_image_grid();
            break;
        case 9:
            gruenerator_contact_form();
            break;
        case 10:
            gruenerator_final_step();
            break;
        case 11:
            gruenerator_setup_complete_page();
            break;
        default:
            echo '<p>Unbekannter Schritt</p>';
            break;
    }
}

function gruenerator_display_navigation_buttons($current_step) {
    ?>
    <div class="gruenerator-form-actions">
        <?php if ($current_step > 0): ?>
            <a href="<?php echo esc_url(add_query_arg('step', $current_step - 1)); ?>" class="button button-secondary">Zurück</a>
        <?php endif; ?>
        <?php if ($current_step < 10): ?>
            <input type="submit" name="gruenerator_setup_submit" class="button button-primary" value="Weiter">
        <?php elseif ($current_step == 10): ?>
            <input type="submit" name="gruenerator_setup_submit" class="button button-primary" value="Abschließen">
        <?php else: ?>
            <a href="<?php echo admin_url('admin.php?page=gruenerator-generator'); ?>" class="button button-primary">Zum Dashboard</a>
        <?php endif; ?>
    </div>
    <?php
}

function gruenerator_process_setup() {
    gruenerator_log("gruenerator_process_setup wurde aufgerufen", 'debug');
    
    if (!current_user_can('manage_options')) {
        gruenerator_log("Unzureichende Berechtigungen für Benutzer: " . wp_get_current_user()->user_login, 'error');
        wp_die('Unzureichende Berechtigungen');
    }

    if (!check_admin_referer('gruenerator_setup_nonce')) {
        gruenerator_log("Ungültiges Nonce", 'error');
        wp_die('Sicherheitsüberprüfung fehlgeschlagen');
    }

    $current_step = isset($_POST['step']) ? intval($_POST['step']) : 0;
    gruenerator_log("Verarbeite Setup-Schritt: " . $current_step, 'info');
    
    $result = gruenerator_process_setup_wizard();
    
    if ($result === false) {
        gruenerator_log("Fehler bei der Verarbeitung von Schritt " . $current_step, 'error');
        wp_safe_redirect(add_query_arg(['step' => $current_step, 'error' => 1], admin_url('admin.php?page=gruenerator-setup-wizard')));
        exit;
    }

    $next_step = $current_step + 1;
    gruenerator_log("Weiterleitung zum nächsten Schritt: " . $next_step, 'info');
    wp_safe_redirect(add_query_arg('step', $next_step, admin_url('admin.php?page=gruenerator-setup-wizard')));
    exit;
}

add_action('admin_post_gruenerator_process_setup', 'gruenerator_process_setup');

function gruenerator_reset_setup() {
    if (isset($_GET['reset_setup']) && $_GET['reset_setup'] == '1' && current_user_can('manage_options')) {
        if (!isset($_GET['_wpnonce']) || !wp_verify_nonce($_GET['_wpnonce'], 'gruenerator_reset_setup')) {
            wp_die('Sicherheitsüberprüfung fehlgeschlagen');
        }
        gruenerator_log("Setup wird zurückgesetzt", 'info');
        delete_option('gruenerator_setup_completed');
        wp_safe_redirect(menu_page_url('gruenerator-setup-wizard', false));
        exit;
    }
}
add_action('admin_init', 'gruenerator_reset_setup');

function gruenerator_enqueue_setup_wizard_styles($hook) {
    if ('admin_page_gruenerator-setup-wizard' !== $hook) {
        return;
    }
    
    wp_enqueue_media();
}
add_action('admin_enqueue_scripts', 'gruenerator_enqueue_setup_wizard_styles');

