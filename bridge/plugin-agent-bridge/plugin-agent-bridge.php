<?php
/**
 * Plugin Name: Plugin Agent Helper
 * Description: Lets the Plugin Agent install and update a local plugin over the REST API using a WordPress application password.
 * Version: 1.0.0
 * Author: Plugin Agent
 * Requires at least: 6.0
 * Requires PHP: 7.4
 * License: GPLv2 or later
 */

defined('ABSPATH') || exit;

add_action('rest_api_init', 'plugin_agent_register_routes');

function plugin_agent_register_routes() {
    register_rest_route(
        'plugin-agent/v1',
        '/status',
        array(
            'methods'             => 'GET',
            'callback'            => 'plugin_agent_status',
            'permission_callback' => 'plugin_agent_can_deploy',
        )
    );

    register_rest_route(
        'plugin-agent/v1',
        '/deploy',
        array(
            'methods'             => 'POST',
            'callback'            => 'plugin_agent_deploy',
            'permission_callback' => 'plugin_agent_can_deploy',
        )
    );
}

function plugin_agent_can_deploy() {
    return current_user_can('install_plugins') && current_user_can('activate_plugins');
}

function plugin_agent_status() {
    if (!function_exists('get_plugins')) {
        require_once ABSPATH . 'wp-admin/includes/plugin.php';
    }

    return array(
        'ok'        => true,
        'bridge'    => 'plugin-agent',
        'version'   => '1.0.0',
        'wordpress' => get_bloginfo('version'),
        'site'      => home_url('/'),
    );
}

function plugin_agent_deploy(WP_REST_Request $request) {
    if (empty($_FILES['file']) || !isset($_FILES['file']['tmp_name'])) {
        return new WP_Error('plugin_agent_no_file', 'Upload the plugin zip as a multipart field named file.', array('status' => 400));
    }

    if (!empty($_FILES['file']['error'])) {
        return new WP_Error('plugin_agent_upload', 'Upload failed (code ' . intval($_FILES['file']['error']) . ').', array('status' => 400));
    }

    require_once ABSPATH . 'wp-admin/includes/file.php';
    require_once ABSPATH . 'wp-admin/includes/plugin.php';
    require_once ABSPATH . 'wp-admin/includes/misc.php';
    require_once ABSPATH . 'wp-admin/includes/class-wp-upgrader.php';

    add_filter('upload_mimes', 'plugin_agent_allow_zip');
    $uploaded = wp_handle_upload(
        $_FILES['file'],
        array(
            'test_form' => false,
            'mimes'     => array('zip' => 'application/zip'),
        )
    );
    remove_filter('upload_mimes', 'plugin_agent_allow_zip');

    if (isset($uploaded['error'])) {
        return new WP_Error('plugin_agent_upload', $uploaded['error'], array('status' => 400));
    }

    $slug    = sanitize_file_name((string) $request->get_param('slug'));
    $existed = $slug && (is_dir(WP_PLUGIN_DIR . '/' . $slug) || file_exists(WP_PLUGIN_DIR . '/' . $slug . '.php'));

    $skin     = new Automatic_Upgrader_Skin();
    $upgrader = new Plugin_Upgrader($skin);
    $result   = $upgrader->install(
        $uploaded['file'],
        array(
            'overwrite_package'  => true,
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
        return new WP_Error('plugin_agent_install', $detail, array('status' => 500));
    }

    wp_clean_plugins_cache(true);
    $plugin_file = $upgrader->plugin_info();
    if (!$plugin_file) {
        return new WP_Error('plugin_agent_unknown', 'Installed, but WordPress could not identify the plugin file.', array('status' => 500));
    }

    $activate = $request->get_param('activate');
    $should_activate = $activate === null || $activate === true || $activate === '1' || $activate === 'true';
    if ($should_activate) {
        $activation = activate_plugin($plugin_file, '', false, false);
        if (is_wp_error($activation)) {
            return new WP_Error(
                'plugin_agent_activate',
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

function plugin_agent_allow_zip($mimes) {
    $mimes['zip'] = 'application/zip';
    return $mimes;
}
