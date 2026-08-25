<?php
/**
 * Plugin Name: Hello PressPush
 * Description: Sample plugin so you can try PressPush without wiring your real project first. Edit this file, save, then tell the agent to update.
 * Version: 1.0.0
 * Author: PressPush
 * Requires at least: 6.0
 * License: GPLv2 or later
 */

defined('ABSPATH') || exit;

add_action('admin_notices', 'hello_presspush_notice');

function hello_presspush_notice() {
    if (!current_user_can('activate_plugins')) {
        return;
    }

    $version = '1.0.0';
    echo '<div class="notice notice-success is-dismissible"><p>';
    echo '<strong>Hello PressPush</strong> is running version ' . esc_html($version) . '. ';
    echo 'Edit <code>examples/hello-presspush/hello-presspush.php</code>, save, then tell PressPush to update.';
    echo '</p></div>';
}
