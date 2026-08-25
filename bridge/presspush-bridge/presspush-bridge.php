<?php
/**
 * Plugin Name: PressPush Bridge
 * Plugin URI: https://github.com
 * Description: Receives plugin zip deploys from the PressPush agent so you can install and update local plugins without leaving Cursor.
 * Version: 1.0.0
 * Author: PressPush
 * Requires at least: 6.0
 * Requires PHP: 7.4
 * License: GPLv2 or later
 * Text Domain: presspush-bridge
 */

defined('ABSPATH') || exit;

add_action('rest_api_init', 'presspush_register_routes');

function presspush_register_routes() {
    register_rest_route(
        'presspush/v1',
        '/status',
        array(
            'methods'             => 'GET',
            'callback'            => 'presspush_status',
            'permission_callback' => 'presspush_can_deploy',
        )
    );

    register_rest_route(
        'presspush/v1',
        '/deploy',
        array(
            'methods'             => 'POST',
            'callback'            => 'presspush_deploy',
            'permission_callback' => 'presspush_can_deploy',
        )
    );
}

function presspush_can_deploy() {
    return current_user_can('install_plugins') && current_user_can('activate_plugins');
}

function presspush_status() {
    if (!function_exists('get_plugins')) {
        require_once ABSPATH . 'wp-admin/includes/plugin.php';
    }

    $plugins = array();
    foreach (get_plugins() as $basename => $data) {
        $plugins[] = array(
            'file'    => $basename,
            'name'    => $data['Name'],
            'version' => $data['Version'],
            'active'  => is_plugin_active($basename),
        );
    }

    return array(
        'ok'         => true,
        'bridge'     => 'presspush',
        'version'    => '1.0.0',
        'wordpress'  => get_bloginfo('version'),
        'site'       => home_url('/'),
        'canInstall' => current_user_can('install_plugins'),
        'plugins'    => $plugins,
    );
}

function presspush_deploy(WP_REST_Request $request) {
    if (empty($_FILES['file']) || !isset($_FILES['file']['tmp_name'])) {
        return new WP_Error('presspush_no_file', 'Upload the plugin zip as a multipart field named file.', array('status' => 400));
    }

    if (!empty($_FILES['file']['error'])) {
        return new WP_Error('presspush_upload', 'PHP rejected the upload (code ' . intval($_FILES['file']['error']) . '). Check upload_max_filesize.', array('status' => 400));
    }

    require_once ABSPATH . 'wp-admin/includes/file.php';
    require_once ABSPATH . 'wp-admin/includes/plugin.php';
    require_once ABSPATH . 'wp-admin/includes/misc.php';
    require_once ABSPATH . 'wp-admin/includes/class-wp-upgrader.php';

    $overrides = array(
        'test_form' => false,
        'mimes'     => array(
            'zip' => 'application/zip',
        ),
    );

    add_filter('upload_mimes', 'presspush_allow_zip');
    $uploaded = wp_handle_upload($_FILES['file'], $overrides);
    remove_filter('upload_mimes', 'presspush_allow_zip');

    if (isset($uploaded['error'])) {
        return new WP_Error('presspush_upload', $uploaded['error'], array('status' => 400));
    }

    $slug = sanitize_file_name((string) $request->get_param('slug'));
    $existed = false;
    if ($slug) {
        $existed = is_dir(WP_PLUGIN_DIR . '/' . $slug) || file_exists(WP_PLUGIN_DIR . '/' . $slug . '.php');
    } else {
        $existed = true;
    }

    $skin     = new Automatic_Upgrader_Skin();
    $upgrader = new Plugin_Upgrader($skin);
    $result   = $upgrader->install(
        $uploaded['file'],
        array(
            'overwrite_package' => true,
            'clear_update_cache' => true,
        )
    );

    if (file_exists($uploaded['file'])) {
        wp_delete_file($uploaded['file']);
    }

    if (is_wp_error($result)) {
        return $result;
    }

    if (!$result) {
        $messages = $skin->get_upgrade_messages();
        $detail   = $messages ? implode(' ', $messages) : 'WordPress could not install the zip.';
        return new WP_Error('presspush_install', $detail, array('status' => 500));
    }

    wp_clean_plugins_cache(true);
    $plugin_file = $upgrader->plugin_info();

    if (!$plugin_file) {
        return new WP_Error('presspush_unknown', 'The zip installed but WordPress could not identify the plugin file.', array('status' => 500));
    }

    $activate = $request->get_param('activate');
    $should_activate = $activate === null || $activate === true || $activate === '1' || $activate === 'true';

    if ($should_activate) {
        $activation = activate_plugin($plugin_file, '', false, false);
        if (is_wp_error($activation)) {
            return new WP_Error(
                'presspush_activate',
                'Installed, but activation failed: ' . $activation->get_error_message(),
                array('status' => 500)
            );
        }
    }

    $plugins = get_plugins();
    $meta    = isset($plugins[$plugin_file]) ? $plugins[$plugin_file] : array();

    return array(
        'ok'      => true,
        'action'  => $existed ? 'updated' : 'installed',
        'plugin'  => $plugin_file,
        'name'    => isset($meta['Name']) ? $meta['Name'] : $plugin_file,
        'version' => isset($meta['Version']) ? $meta['Version'] : '',
        'active'  => is_plugin_active($plugin_file),
        'message' => $existed
            ? 'Updated the plugin from the latest local files.'
            : 'Installed and activated the plugin.',
    );
}

function presspush_allow_zip($mimes) {
    $mimes['zip'] = 'application/zip';
    return $mimes;
}
