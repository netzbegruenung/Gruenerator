<?php
if (!defined('ABSPATH')) {
    exit; // Exit if accessed directly
}

function gruenerator_get_social_media_data() {
    $social_media_profiles = Gruenerator_Options::get_social();

    $profiles = array();
    $lines = explode("\n", $social_media_profiles);
    foreach ($lines as $line) {
        $parts = explode(';', $line);
        if (count($parts) >= 3) {
            $icon = trim($parts[0]);
            $title = trim($parts[1]);
            $url = trim($parts[2]);
            if (!empty($url)) {
                $profiles[] = array(
                    'icon' => $icon,
                    'title' => $title,
                    'url' => $url
                );
            }
        }
    }

    return $profiles;
}
