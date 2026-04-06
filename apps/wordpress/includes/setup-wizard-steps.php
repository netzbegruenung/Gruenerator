<?php
// Verhindert direkten Zugriff auf die Datei
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Willkommensseite des Setup-Wizards
 */
function gruenerator_welcome_page() {
    if (!current_user_can('manage_options')) {
        gruenerator_log("Unzureichende Berechtigungen für Benutzer: " . wp_get_current_user()->user_login, 'error');
        wp_die('Unzureichende Berechtigungen');
    }
    ?>
    <div class="gruenerator-welcome-page">
        <h2>Willkommen beim Grünerator Setup-Assistenten</h2>
        <p>In wenigen Schritten erstellen wir gemeinsam deine professionelle politische Landingpage. Der Assistent führt dich durch alle wichtigen Einstellungen und hilft dir dabei, deine Präsenz im Web optimal zu gestalten.</p>

        <div class="gruenerator-welcome-features">
            <div class="feature">
                <span class="dashicons dashicons-admin-appearance"></span>
                <h3>Individuelles Design</h3>
                <p>Gestalte deine Seite im Corporate Design der Grünen.</p>
            </div>
            <div class="feature">
                <span class="dashicons dashicons-share"></span>
                <h3>Social Media Integration</h3>
                <p>Vernetze alle deine Social-Media-Kanäle.</p>
            </div>
            <div class="feature">
                <span class="dashicons dashicons-edit"></span>
                <h3>Einfache Bearbeitung</h3>
                <p>Ändere Inhalte auch später ganz einfach.</p>
            </div>
        </div>

        <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
            <?php wp_nonce_field('gruenerator_setup_nonce'); ?>
            <input type="hidden" name="action" value="gruenerator_process_setup">
            <input type="hidden" name="step" value="0">
            <input type="submit" class="button button-primary" value="Setup starten">
        </form>
    </div>
    <?php
}

/**
 * Inhaltsauswahl des Setup-Wizards
 */
function gruenerator_content_source() {
    if (!current_user_can('manage_options')) {
        gruenerator_log("Unzureichende Berechtigungen für Benutzer: " . wp_get_current_user()->user_login, 'error');
        wp_die('Unzureichende Berechtigungen');
    }
    ?>
    <div class="gruenerator-step-content">
        <h2>Inhaltsquelle wählen</h2>
        <p>Wähle aus, wie du die Inhalte für deine Landingpage bereitstellen möchtest.</p>

        <div class="gruenerator-content-source-options">
            <div class="content-source-option">
                <label>
                    <input type="radio" name="content_source" value="default" checked>
                    <span class="option-title">Beispieltexte verwenden und selbst eingeben</span>
                    <span class="option-description">Verwende unsere vorbereiteten Beispieltexte als Grundlage und passe sie nach deinen Wünschen an.</span>
                </label>
            </div>

            <div class="content-source-option">
                <label>
                    <input type="radio" name="content_source" value="json">
                    <span class="option-title">Grünerator Texte verwenden</span>
                    <span class="option-description">Füge vorgefertigte Inhalte im JSON-Format ein.</span>
                </label>

                <div class="json-content-area" style="display: none;">
                    <textarea name="json_content" rows="10" class="large-text code" placeholder="Füge hier deinen JSON-formatierten Inhalt ein..."><?php echo esc_textarea(Gruenerator_Content_Source::get_json_content()); ?></textarea>
                    <p class="description">Füge hier den JSON-formatierten Inhalt ein. Das Format muss dem folgenden Schema entsprechen:</p>
                    <pre class="json-schema"><?php echo esc_html(json_encode(Gruenerator_Content_Source::get_json_schema(), JSON_PRETTY_PRINT)); ?></pre>
                </div>
            </div>
        </div>

        <script>
        jQuery(document).ready(function($) {
            $('input[name="content_source"]').on('change', function() {
                if ($(this).val() === 'json') {
                    $('.json-content-area').slideDown();
                } else {
                    $('.json-content-area').slideUp();
                }
            });
        });
        </script>

        <style>
        .gruenerator-content-source-options {
            margin: 2rem 0;
        }
        .content-source-option {
            background: #fff;
            border: 1px solid #ddd;
            border-radius: 4px;
            padding: 1.5rem;
            margin-bottom: 1rem;
        }
        .content-source-option label {
            display: block;
            margin-bottom: 1rem;
        }
        .option-title {
            font-weight: bold;
            display: block;
            margin: 0.5rem 0;
        }
        .option-description {
            color: #666;
            display: block;
            margin-bottom: 1rem;
        }
        .json-content-area {
            margin-top: 1rem;
            padding: 1rem;
            background: #f9f9f9;
            border-radius: 4px;
        }
        .json-schema {
            background: #f5f5f5;
            padding: 1rem;
            border-radius: 4px;
            overflow: auto;
            max-height: 300px;
            font-size: 12px;
        }
        </style>
    </div>
    <?php
}

/**
 * CSS-Einstellungen des Setup-Wizards
 */
function gruenerator_css_settings() {
    if (!current_user_can('manage_options')) {
        gruenerator_log("Unzureichende Berechtigungen für Benutzer: " . wp_get_current_user()->user_login, 'error');
        wp_die('Unzureichende Berechtigungen');
    }
    $design = Gruenerator_Options::get_design();
    ?>
    <div class="gruenerator-step-content">
        <h2>Design-Einstellungen</h2>
        <p>Wähle die grundlegenden Design-Einstellungen für deine Landingpage.</p>
        <table class="form-table">
            <tr>
                <th scope="row"><label for="gruenerator_use_css">Standard-Design verwenden</label></th>
                <td>
                    <input type="checkbox" id="gruenerator_use_css" name="gruenerator_use_css" value="1" <?php checked($design['css_active']); ?>>
                    <p class="description">Aktiviere diese Option, um das optimierte Grüne Design zu verwenden. Deaktiviere sie nur, wenn du ein komplett eigenes Design einsetzen möchtest.</p>
                </td>
            </tr>
        </table>
    </div>
    <?php
}

/**
 * Soziale Netzwerke Einstellungen des Setup-Wizards
 */
function gruenerator_social_networks() {
    if (!current_user_can('manage_options')) {
        wp_die('Unzureichende Berechtigungen');
    }

    // Parse current social profiles to extract wizard-relevant URLs
    $social_data = Gruenerator_Options::get_social();
    $icon_to_key = array(
        'fab fa-facebook-f' => 'facebook',
        'fab fa-twitter'    => 'twitter',
        'fab fa-instagram'  => 'instagram',
    );
    $current_urls = array('facebook' => '', 'twitter' => '', 'instagram' => '');
    foreach (explode("\n", $social_data) as $line) {
        $parts = explode(';', $line);
        if (count($parts) >= 3 && isset($icon_to_key[$parts[0]])) {
            $current_urls[$icon_to_key[$parts[0]]] = trim($parts[2]);
        }
    }
    ?>
    <div class="gruenerator-step-content">
        <h2>Social Media Einbindung</h2>
        <p>Verknüpfe deine Social-Media-Profile, um deine Online-Präsenz zu stärken.</p>
        <table class="form-table">
            <tr>
                <th scope="row"><label for="gruenerator_social_facebook">Facebook</label></th>
                <td>
                    <input type="url" id="gruenerator_social_facebook" name="gruenerator_social_facebook" value="<?php echo esc_url($current_urls['facebook']); ?>" class="regular-text">
                    <p class="description">z.B. https://facebook.com/IhrName</p>
                </td>
            </tr>
            <tr>
                <th scope="row"><label for="gruenerator_social_twitter">X (Twitter)</label></th>
                <td>
                    <input type="url" id="gruenerator_social_twitter" name="gruenerator_social_twitter" value="<?php echo esc_url($current_urls['twitter']); ?>" class="regular-text">
                    <p class="description">z.B. https://x.com/IhrName</p>
                </td>
            </tr>
            <tr>
                <th scope="row"><label for="gruenerator_social_instagram">Instagram</label></th>
                <td>
                    <input type="url" id="gruenerator_social_instagram" name="gruenerator_social_instagram" value="<?php echo esc_url($current_urls['instagram']); ?>" class="regular-text">
                    <p class="description">z.B. https://instagram.com/IhrName</p>
                </td>
            </tr>
        </table>
    </div>
    <?php
}

/**
 * Hero-Bereich Einstellungen des Setup-Wizards
 */
function gruenerator_hero_section() {
    if (!current_user_can('manage_options')) {
        wp_die('Unzureichende Berechtigungen');
    }
    $content = Gruenerator_Options::get_content();
    $hero = $content['hero'];
    ?>
    <div class="gruenerator-step-content">
        <h2>Dein persönlicher Hero-Bereich</h2>
        <p>Gestalte den ersten Eindruck deiner Landingpage mit einem professionellen Header-Bereich.</p>
        <table class="form-table">
            <tr>
                <th scope="row"><label for="gruenerator_hero_image">Dein Porträtfoto</label></th>
                <td>
                    <input type="hidden" id="gruenerator_hero_image" name="gruenerator_hero_image" value="<?php echo esc_attr($hero['image']); ?>">
                    <button type="button" class="button gruenerator-image-upload">Foto auswählen</button>
                    <button type="button" class="button gruenerator-image-remove">Foto entfernen</button>
                    <div class="gruenerator-image-preview">
                        <?php
                        if ($hero['image']) {
                            echo wp_get_attachment_image($hero['image'], 'medium');
                        }
                        ?>
                    </div>
                    <p class="description">Wähle ein professionelles Porträtfoto im Querformat (empfohlen: 1200x800 Pixel).</p>
                </td>
            </tr>
            <tr>
                <th scope="row"><label for="gruenerator_hero_heading">Deine Begrüßung</label></th>
                <td>
                    <input type="text" id="gruenerator_hero_heading" name="gruenerator_hero_heading" value="<?php echo esc_attr($hero['heading'] ? $hero['heading'] : 'Hallo, ich bin Maxi Mustermensch'); ?>" class="regular-text">
                    <p class="description">Eine persönliche Begrüßung macht deine Seite einladend.</p>
                </td>
            </tr>
            <tr>
                <th scope="row"><label for="gruenerator_hero_text">Kurze Vorstellung</label></th>
                <td>
                    <textarea id="gruenerator_hero_text" name="gruenerator_hero_text" rows="3" class="large-text"><?php echo esc_textarea($hero['text'] ? $hero['text'] : 'Kandidat*in für den Wahlkreis Musterstadt-Nord. Ich setze mich für eine nachhaltige und gerechte Zukunft ein.'); ?></textarea>
                    <p class="description">Ein kurzer, prägnanter Text über deine politische Rolle und Motivation.</p>
                </td>
            </tr>
        </table>
    </div>
    <?php
}

/**
 * Über mich Einstellungen des Setup-Wizards
 */
function gruenerator_about_me() {
    if (!current_user_can('manage_options')) {
        wp_die('Unzureichende Berechtigungen');
    }
    $content = Gruenerator_Options::get_content();
    $about = $content['about'];
    ?>
    <div class="gruenerator-step-content">
        <h2>Über mich</h2>
        <p>Erzähle deine Geschichte und teile deine politische Vision.</p>
        <table class="form-table">
            <tr>
                <th scope="row"><label for="gruenerator_about_me_title">Überschrift</label></th>
                <td>
                    <input type="text" id="gruenerator_about_me_title" name="gruenerator_about_me_title" value="<?php echo esc_attr($about['title'] ? $about['title'] : 'Wer ich bin'); ?>" class="regular-text">
                    <p class="description">Eine einladende Überschrift für deinen persönlichen Bereich.</p>
                </td>
            </tr>
            <tr>
                <th scope="row"><label for="gruenerator_about_me_content">Deine Geschichte</label></th>
                <td>
                    <?php
                    $default_content = "Verwurzelt im Herzen von Musterstadt, mit einem festen Blick in die Zukunft: Dies beschreibt den Kern meiner Kandidatur für das Musterparlament. Als Musterberuf und langjährig engagierte Person in Musterorganisation habe ich stets die Bedeutung von Gemeinschaft, nachhaltiger Entwicklung und solidarischem Handeln aus nächster Nähe miterlebt. Mit einem offenen Ohr für alle Bürger*innen, einer lösungsorientierten Herangehensweise und dem festen Glauben an unsere gemeinsame Zukunft. Es geht darum, heute die Entscheidungen zu treffen, die morgen den Unterschied machen können. Für eine Politik, die auf Ausgleich und Nachhaltigkeit setzt, und für ein Musterstadt, in dem jede Stimme zählt.";

                    wp_editor(
                        $about['content'] ? $about['content'] : $default_content,
                        'gruenerator_about_me_content',
                        array(
                            'textarea_name' => 'gruenerator_about_me_content',
                            'media_buttons' => false,
                            'textarea_rows' => 10,
                            'teeny' => true,
                            'quicktags' => array('buttons' => 'strong,em'),
                        )
                    );
                    ?>
                    <p class="description">Erzähle von deinem Werdegang, deiner Motivation und deinen Zielen. Sei authentisch und persönlich.</p>
                </td>
            </tr>
        </table>
    </div>
    <?php
}


/**
 * Hero Image Block Einstellungen des Setup-Wizards
 */
function gruenerator_hero_image_block() {
    if (!current_user_can('manage_options')) {
        wp_die('Unzureichende Berechtigungen');
    }
    $content = Gruenerator_Options::get_content();
    $hero_image = $content['hero_image'];
    ?>
    <div class="gruenerator-step-content">
        <h2>Dein Hauptthema</h2>
        <p>Präsentiere dein wichtigstes politisches Anliegen mit einem eindrucksvollen Bild und einer starken Botschaft.</p>
        <table class="form-table">
            <tr>
                <th scope="row"><label for="gruenerator_hero_image_block_image">Themenbild</label></th>
                <td>
                    <input type="hidden" id="gruenerator_hero_image_block_image" name="gruenerator_hero_image_block_image" value="<?php echo esc_attr($hero_image['image']); ?>">
                    <button type="button" class="button gruenerator-image-upload">Bild auswählen</button>
                    <button type="button" class="button gruenerator-image-remove">Bild entfernen</button>
                    <div class="gruenerator-image-preview">
                        <?php
                        if ($hero_image['image']) {
                            echo wp_get_attachment_image($hero_image['image'], 'medium');
                        }
                        ?>
                    </div>
                    <p class="description">Wähle ein ausdrucksstarkes Bild, das dein Hauptthema visualisiert (empfohlen: 1920x1080 Pixel).</p>
                </td>
            </tr>
            <tr>
                <th scope="row"><label for="gruenerator_hero_image_title">Hauptbotschaft</label></th>
                <td>
                    <input type="text" id="gruenerator_hero_image_title" name="gruenerator_hero_image_title" value="<?php echo esc_attr($hero_image['title'] ? $hero_image['title'] : 'Gemeinsam für eine nachhaltige Zukunft!'); ?>" class="regular-text">
                    <p class="description">Eine prägnante Botschaft, die deine politische Vision zusammenfasst.</p>
                </td>
            </tr>
            <tr>
                <th scope="row"><label for="gruenerator_hero_image_subtitle">Erläuterung</label></th>
                <td>
                    <textarea id="gruenerator_hero_image_subtitle" name="gruenerator_hero_image_subtitle" rows="3" class="large-text"><?php echo esc_textarea($hero_image['subtitle'] ? $hero_image['subtitle'] : 'Mit deiner Unterstützung können wir unsere Region nachhaltiger, gerechter und lebenswerter gestalten. Lass uns gemeinsam die Herausforderungen angehen.'); ?></textarea>
                    <p class="description">Ergänze deine Hauptbotschaft mit einem motivierenden Aufruf zum Mitmachen.</p>
                </td>
            </tr>
        </table>
    </div>
    <?php
}


/**
 * Meine Themen Einstellungen des Setup-Wizards
 */
function gruenerator_my_themes() {
    if (!current_user_can('manage_options')) {
        wp_die('Unzureichende Berechtigungen');
    }
    $content = Gruenerator_Options::get_content();
    $themes_data = $content['themes'];
    ?>
    <div class="gruenerator-step-content">
        <h2>Deine politischen Schwerpunkte</h2>
        <p>Stelle deine drei wichtigsten politischen Themen vor.</p>

        <?php
        $default_themes = array(
            array(
                'title' => 'Klimaschutz vor Ort umsetzen',
                'content' => 'Wir setzen uns für konkrete Klimaschutzmaßnahmen in unserer Kommune ein. Von erneuerbaren Energien bis hin zu nachhaltiger Stadtplanung - gemeinsam gestalten wir eine grüne Zukunft.'
            ),
            array(
                'title' => 'Nachhaltige Mobilität fördern',
                'content' => 'Wir machen uns stark für ein modernes Verkehrskonzept: Bessere Radwege, attraktiver ÖPNV und sichere Fußwege für alle. So schaffen wir eine lebenswerte Stadt mit hoher Mobilität.'
            ),
            array(
                'title' => 'Soziale Gerechtigkeit stärken',
                'content' => 'Wir kämpfen für bezahlbares Wohnen, gute Bildung und faire Chancen für alle. Denn eine gerechte Gesellschaft ist die Basis für ein harmonisches Zusammenleben.'
            )
        );

        for ($i = 0; $i < 3; $i++) :
            $theme_image = $themes_data[$i]['image'];
            $theme_title = $themes_data[$i]['title'] ? $themes_data[$i]['title'] : $default_themes[$i]['title'];
            $theme_content = $themes_data[$i]['content'] ? $themes_data[$i]['content'] : $default_themes[$i]['content'];
            $num = $i + 1;
        ?>
            <div class="gruenerator-theme-section">
                <h3>Schwerpunkt <?php echo $num; ?></h3>
                <table class="form-table">
                    <tr>
                        <th scope="row"><label for="gruenerator_theme_image_<?php echo $num; ?>">Bild</label></th>
                        <td>
                            <input type="hidden" id="gruenerator_theme_image_<?php echo $num; ?>" name="gruenerator_theme_image_<?php echo $num; ?>" value="<?php echo esc_attr($theme_image); ?>">
                            <button type="button" class="button gruenerator-image-upload">Bild auswählen</button>
                            <button type="button" class="button gruenerator-image-remove">Bild entfernen</button>
                            <div class="gruenerator-image-preview">
                                <?php if ($theme_image) : ?>
                                    <img src="<?php echo esc_url(wp_get_attachment_url($theme_image)); ?>" style="max-width:100%;">
                                <?php endif; ?>
                            </div>
                            <p class="description">Wähle ein aussagekräftiges Bild für diesen Schwerpunkt.</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="gruenerator_theme_title_<?php echo $num; ?>">Titel</label></th>
                        <td>
                            <input type="text" id="gruenerator_theme_title_<?php echo $num; ?>" name="gruenerator_theme_title_<?php echo $num; ?>" value="<?php echo esc_attr($theme_title); ?>" class="regular-text">
                            <p class="description">Gib deinem Schwerpunkt einen prägnanten Titel.</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="gruenerator_theme_content_<?php echo $num; ?>">Beschreibung</label></th>
                        <td>
                            <textarea id="gruenerator_theme_content_<?php echo $num; ?>" name="gruenerator_theme_content_<?php echo $num; ?>" rows="4" class="large-text"><?php echo esc_textarea($theme_content); ?></textarea>
                            <p class="description">Beschreibe kurz und prägnant, wofür du dich in diesem Bereich einsetzt.</p>
                        </td>
                    </tr>
                </table>
            </div>
        <?php endfor; ?>
    </div>
    <?php
}

/**
 * Bildergalerie Einstellungen des Setup-Wizards
 */
function gruenerator_image_grid() {
    if (!current_user_can('manage_options')) {
        wp_die('Unzureichende Berechtigungen');
    }
    $content = Gruenerator_Options::get_content();
    $actions_data = $content['actions'];
    ?>
    <div class="gruenerator-step-content">
        <h2>Aktionsbereich</h2>
        <p>Gestalte drei Aktionsfelder, die Besucher*innen zum Mitmachen einladen.</p>
        <table class="form-table">
            <?php
            $default_actions = array(
                array(
                    'text' => 'Unterstütze uns',
                    'link' => '#spenden'
                ),
                array(
                    'text' => 'Werde Mitglied',
                    'link' => 'https://www.gruene.de/mitglied-werden'
                ),
                array(
                    'text' => 'Mach mit',
                    'link' => '#kontakt'
                )
            );

            for ($i = 0; $i < 3; $i++):
                $num = $i + 1;
                $action_image = $actions_data[$i]['image'];
                $action_text = $actions_data[$i]['text'] ? $actions_data[$i]['text'] : $default_actions[$i]['text'];
                $action_link = $actions_data[$i]['link'] ? $actions_data[$i]['link'] : $default_actions[$i]['link'];
            ?>
                <tr>
                    <th scope="row"><label for="gruenerator_action_image_<?php echo $num; ?>">Aktion <?php echo $num; ?> - Bild</label></th>
                    <td>
                        <input type="hidden" name="gruenerator_action_image_<?php echo $num; ?>" id="gruenerator_action_image_<?php echo $num; ?>" value="<?php echo esc_attr($action_image); ?>">
                        <button type="button" class="button gruenerator-image-upload">Bild auswählen</button>
                        <button type="button" class="button gruenerator-image-remove">Bild entfernen</button>
                        <div class="gruenerator-image-preview">
                            <?php
                            if ($action_image) {
                                echo wp_get_attachment_image($action_image, 'medium');
                            }
                            ?>
                        </div>
                        <p class="description">Wähle ein aktivierendes Bild (empfohlen: 600x400 Pixel).</p>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><label for="gruenerator_action_text_<?php echo $num; ?>">Aktion <?php echo $num; ?> - Text</label></th>
                    <td>
                        <input type="text" id="gruenerator_action_text_<?php echo $num; ?>" name="gruenerator_action_text_<?php echo $num; ?>" value="<?php echo esc_attr($action_text); ?>" class="regular-text">
                        <p class="description">Ein kurzer, aktivierender Aufruf.</p>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><label for="gruenerator_action_link_<?php echo $num; ?>">Aktion <?php echo $num; ?> - Link</label></th>
                    <td>
                        <input type="text" id="gruenerator_action_link_<?php echo $num; ?>" name="gruenerator_action_link_<?php echo $num; ?>" value="<?php echo esc_attr($action_link); ?>" class="regular-text">
                        <p class="description">Optional: Die Zielseite für die Aktion (z.B. Spendenformular, Mitgliedsantrag). Kann auch später ergänzt werden.</p>
                    </td>
                </tr>
            <?php endfor; ?>
        </table>
    </div>
    <?php
}


/**
 * Kontaktformular Einstellungen des Setup-Wizards
 */
function gruenerator_contact_form() {
    if (!current_user_can('manage_options')) {
        wp_die('Unzureichende Berechtigungen');
    }
    $content = Gruenerator_Options::get_content();
    $contact = $content['contact'];
    ?>
    <div class="gruenerator-step-content">
        <h2>Kontaktbereich</h2>
        <p>Gestalte deinen Kontaktbereich, damit Interessierte dich einfach erreichen können.</p>
        <table class="form-table">
            <tr>
                <th scope="row"><label for="gruenerator_contact_form_title">Überschrift</label></th>
                <td>
                    <input type="text" id="gruenerator_contact_form_title" name="gruenerator_contact_form_title" value="<?php echo esc_attr($contact['title'] ? $contact['title'] : 'Sag Hallo!'); ?>" class="regular-text">
                    <p class="description">Eine einladende Überschrift für den Kontaktbereich.</p>
                </td>
            </tr>
            <tr>
                <th scope="row"><label for="gruenerator_contact_form_image">Hintergrundbild</label></th>
                <td>
                    <input type="hidden" name="gruenerator_contact_form_image" id="gruenerator_contact_form_image" value="<?php echo esc_attr($contact['image']); ?>">
                    <button type="button" class="button gruenerator-image-upload">Bild auswählen</button>
                    <button type="button" class="button gruenerator-image-remove">Bild entfernen</button>
                    <div class="gruenerator-image-preview">
                        <?php
                        if ($contact['image']) {
                            echo wp_get_attachment_image($contact['image'], 'medium');
                        }
                        ?>
                    </div>
                    <p class="description">Wähle ein einladendes Hintergrundbild (empfohlen: 1920x1080 Pixel).</p>
                </td>
            </tr>
            <tr>
                <th scope="row"><label for="gruenerator_contact_form_email">Deine E-Mail-Adresse</label></th>
                <td>
                    <input type="email" id="gruenerator_contact_form_email" name="gruenerator_contact_form_email" value="<?php echo esc_attr($contact['email'] ? $contact['email'] : get_option('admin_email')); ?>" class="regular-text">
                    <p class="description">An diese Adresse werden die Kontaktanfragen gesendet.</p>
                </td>
            </tr>
        </table>
    </div>
    <?php
}

/**
 * Finaler Schritt des Setup-Wizards
 */
function gruenerator_final_step() {
    if (!current_user_can('manage_options')) {
        wp_die('Unzureichende Berechtigungen');
    }
    ?>
    <div class="gruenerator-step-content">
        <h2>Fertigstellung</h2>
        <p>Herzlichen Glückwunsch! Du hast alle Einstellungen vorgenommen. Klicke auf "Abschließen", um deine Landingpage zu erstellen.</p>

        <div class="gruenerator-final-summary">
            <h3>Was als Nächstes passiert:</h3>
            <ul>
                <li>Deine Landingpage wird mit allen eingegebenen Inhalten erstellt</li>
                <li>Du kannst die Seite sofort nach der Erstellung ansehen und bearbeiten</li>
                <li>Alle Einstellungen können später über das Grünerator-Dashboard angepasst werden</li>
            </ul>
        </div>

        <table class="form-table">
            <tr>
                <th scope="row"><label for="gruenerator_set_as_frontpage">Als Startseite festlegen</label></th>
                <td>
                    <input type="checkbox" id="gruenerator_set_as_frontpage" name="gruenerator_set_as_frontpage" value="1">
                    <p class="description">Aktiviere diese Option, um die erstellte Landingpage als Startseite deiner Website festzulegen.</p>
                </td>
            </tr>
        </table>
    </div>
    <?php
}

/**
 * Abschlussseite des Setup-Wizards
 */
function gruenerator_setup_complete_page() {
    if (!current_user_can('manage_options')) {
        gruenerator_log("Unzureichende Berechtigungen für Benutzer: " . wp_get_current_user()->user_login, 'error');
        wp_die('Unzureichende Berechtigungen');
    }

    gruenerator_log("Anzeigen der Erfolgsseite", 'info');
    $setup = Gruenerator_Options::get_setup();
    $landing_page_id = $setup['landing_page_id'];
    $landing_page_url = $landing_page_id ? get_permalink($landing_page_id) : '';
    ?>
    <div class="gruenerator-setup-complete">
        <div class="gruenerator-success-message">
            <span class="dashicons dashicons-yes-alt"></span>
            <h2>Glückwunsch! Dein Grünerator Setup ist abgeschlossen.</h2>
            <p>Deine personalisierte Landingpage wurde erfolgreich erstellt und ist jetzt bereit für die Veröffentlichung.</p>
        </div>
        <div class="gruenerator-action-buttons">
            <?php if ($landing_page_url): ?>
                <a href="<?php echo esc_url($landing_page_url); ?>" class="button button-primary" target="_blank">Landingpage anzeigen</a>
            <?php endif; ?>
            <a href="<?php echo admin_url('admin.php?page=gruenerator-generator'); ?>" class="button button-secondary">Zum Grünerator Dashboard</a>
        </div>
        <div class="gruenerator-next-steps">
            <h3>Nächste Schritte:</h3>
            <ul>
                <li>Überprüfe deine Landingpage und nimm bei Bedarf weitere Anpassungen vor.</li>
                <li>Füge zusätzliche Inhalte oder Blöcke hinzu, um deine Seite zu vervollständigen.</li>
                <li>Teile deine neue Landingpage in deinen sozialen Netzwerken.</li>
            </ul>
        </div>
    </div>
    <?php
}
