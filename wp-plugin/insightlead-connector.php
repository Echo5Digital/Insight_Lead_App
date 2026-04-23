<?php
/**
 * Plugin Name: InsightLead Connector
 * Plugin URI: https://insightfulmindpsych.com
 * Description: Lightweight connector that captures submissions from major WordPress form plugins (Elementor Pro, Contact Form 7, WPForms, MetForm, Gravity Forms, Ninja Forms, Formidable, Fluent Forms) and sends them to the InsightLead API for lead management.
 * Version: 1.0.0
 * Author: InsightfulMind Psych
 * Author URI: https://insightfulmindpsych.com
 * License: GPL v2 or later
 * Text Domain: insightlead
 * Requires at least: 6.0
 * Tested up to: 6.6
 * Requires PHP: 7.4
 */

if (!defined('ABSPATH')) {
    exit;
}

define('INSIGHTLEAD_VERSION', '1.0.0');
define('INSIGHTLEAD_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('INSIGHTLEAD_PLUGIN_URL', plugin_dir_url(__FILE__));

class InsightLead_Connector {

    private static $instance = null;

    public static function instance() {
        if (is_null(self::$instance)) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        require_once INSIGHTLEAD_PLUGIN_DIR . 'includes/class-performance.php';

        add_action('admin_menu', [$this, 'add_settings_page']);
        add_action('admin_init', [$this, 'register_settings']);

        add_action('wp_ajax_insightlead_test_connection', [$this, 'ajax_test_connection']);

        add_action('wp_enqueue_scripts', ['InsightLead_Performance_Manager', 'enqueue_scripts']);
        add_filter('script_loader_tag', ['InsightLead_Performance_Manager', 'add_defer_attribute'], 10, 2);
        add_action('wp_head', ['InsightLead_Performance_Manager', 'utm_tracker_inline'], 1);

        add_action('update_option_insightlead_api_url', ['InsightLead_Settings_Cache', 'clear_cache']);
        add_action('update_option_insightlead_api_key', ['InsightLead_Settings_Cache', 'clear_cache']);

        add_action('elementor_pro/forms/new_record', [$this, 'capture_elementor_form'], 10, 2);
        add_action('wpcf7_before_send_mail', [$this, 'capture_cf7_form'], 10, 1);
        add_action('wpforms_process_complete', [$this, 'capture_wpforms_form'], 10, 4);
        add_action('metform_before_store_form_data', [$this, 'capture_metforms_form'], 10, 2);
        add_action('gform_after_submission', [$this, 'capture_gravity_form'], 10, 2);
        add_action('ninja_forms_after_submission', [$this, 'capture_ninja_form'], 10, 1);
        add_action('frm_after_create_entry', [$this, 'capture_formidable_form'], 30, 2);
        add_action('fluentform/submission_inserted', [$this, 'capture_fluent_form'], 10, 3);

        add_filter('plugin_action_links_' . plugin_basename(__FILE__), [$this, 'add_settings_link']);
    }

    public function add_settings_page() {
        add_menu_page(
            'InsightLead',
            'InsightLead',
            'manage_options',
            'insightlead',
            [$this, 'render_settings_page'],
            'dashicons-email-alt',
            26
        );

        add_options_page(
            'InsightLead Settings',
            'InsightLead',
            'manage_options',
            'insightlead-settings',
            [$this, 'render_settings_page']
        );
    }

    public function register_settings() {
        register_setting('insightlead_settings', 'insightlead_api_url');
        register_setting('insightlead_settings', 'insightlead_api_key');
        register_setting('insightlead_settings', 'insightlead_enable_logging');

        register_setting('insightlead_settings', 'insightlead_enable_elementor');
        register_setting('insightlead_settings', 'insightlead_enable_cf7');
        register_setting('insightlead_settings', 'insightlead_enable_wpforms');
        register_setting('insightlead_settings', 'insightlead_enable_metforms');
        register_setting('insightlead_settings', 'insightlead_enable_gravity');
        register_setting('insightlead_settings', 'insightlead_enable_ninja');
        register_setting('insightlead_settings', 'insightlead_enable_formidable');
        register_setting('insightlead_settings', 'insightlead_enable_fluent');
    }

    public function render_settings_page() {
        ?>
        <div class="wrap">
            <h1>InsightLead Connector Settings</h1>
            <p>Configure your InsightLead API connection. Captures form submissions and sends them to your lead management backend.</p>

            <?php if (isset($_GET['settings-updated'])): ?>
                <div class="notice notice-success is-dismissible">
                    <p>Settings saved successfully!</p>
                </div>
            <?php endif; ?>

            <form method="post" action="options.php">
                <?php settings_fields('insightlead_settings'); ?>

                <table class="form-table">
                    <tr>
                        <th scope="row">
                            <label for="insightlead_api_url">API Endpoint URL</label>
                        </th>
                        <td>
                            <input type="url"
                                   id="insightlead_api_url"
                                   name="insightlead_api_url"
                                   value="<?php echo esc_attr(get_option('insightlead_api_url', '')); ?>"
                                   class="regular-text"
                                   placeholder="https://your-backend.vercel.app"
                                   required>
                            <p class="description">
                                Your InsightLead backend API URL (without /api/ingest/lead)<br>
                                <strong>Development:</strong> <code>http://localhost:3001</code><br>
                                <strong>Production:</strong> <code>https://your-backend.vercel.app</code>
                            </p>
                        </td>
                    </tr>

                    <tr>
                        <th scope="row">
                            <label for="insightlead_api_key">API Key</label>
                        </th>
                        <td>
                            <input type="password"
                                   id="insightlead_api_key"
                                   name="insightlead_api_key"
                                   value="<?php echo esc_attr(get_option('insightlead_api_key', '')); ?>"
                                   class="regular-text"
                                   placeholder="il_xxxxxxxxxxxxx"
                                   required>
                            <p class="description">Your tenant-specific API key</p>
                        </td>
                    </tr>

                    <tr>
                        <th scope="row">
                            <label for="insightlead_enable_logging">Enable Error Logging</label>
                        </th>
                        <td>
                            <input type="checkbox"
                                   id="insightlead_enable_logging"
                                   name="insightlead_enable_logging"
                                   value="1"
                                   <?php checked(get_option('insightlead_enable_logging'), 1); ?>>
                            <p class="description">Log failed API submissions to debug.log</p>
                        </td>
                    </tr>
                </table>

                <h2>Form Integrations</h2>
                <p>Enable only the form plugins you use on this site.</p>
                <table class="form-table">
                    <tr>
                        <th scope="row">Elementor Pro Forms</th>
                        <td>
                            <input type="checkbox"
                                   name="insightlead_enable_elementor"
                                   value="1"
                                   <?php checked(get_option('insightlead_enable_elementor', 1), 1); ?>>
                            <span class="description">Capture submissions from Elementor Pro form widget</span>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">Contact Form 7</th>
                        <td>
                            <input type="checkbox"
                                   name="insightlead_enable_cf7"
                                   value="1"
                                   <?php checked(get_option('insightlead_enable_cf7', 1), 1); ?>>
                            <span class="description">Capture submissions from Contact Form 7</span>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">WPForms</th>
                        <td>
                            <input type="checkbox"
                                   name="insightlead_enable_wpforms"
                                   value="1"
                                   <?php checked(get_option('insightlead_enable_wpforms', 1), 1); ?>>
                            <span class="description">Capture submissions from WPForms</span>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">MetForm</th>
                        <td>
                            <input type="checkbox"
                                   name="insightlead_enable_metforms"
                                   value="1"
                                   <?php checked(get_option('insightlead_enable_metforms', 1), 1); ?>>
                            <span class="description">Capture submissions from MetForm (Elementor addon)</span>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">Gravity Forms</th>
                        <td>
                            <input type="checkbox"
                                   name="insightlead_enable_gravity"
                                   value="1"
                                   <?php checked(get_option('insightlead_enable_gravity', 1), 1); ?>>
                            <span class="description">Capture submissions from Gravity Forms</span>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">Ninja Forms</th>
                        <td>
                            <input type="checkbox"
                                   name="insightlead_enable_ninja"
                                   value="1"
                                   <?php checked(get_option('insightlead_enable_ninja', 1), 1); ?>>
                            <span class="description">Capture submissions from Ninja Forms</span>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">Formidable Forms</th>
                        <td>
                            <input type="checkbox"
                                   name="insightlead_enable_formidable"
                                   value="1"
                                   <?php checked(get_option('insightlead_enable_formidable', 1), 1); ?>>
                            <span class="description">Capture submissions from Formidable Forms</span>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">Fluent Forms</th>
                        <td>
                            <input type="checkbox"
                                   name="insightlead_enable_fluent"
                                   value="1"
                                   <?php checked(get_option('insightlead_enable_fluent', 1), 1); ?>>
                            <span class="description">Capture submissions from Fluent Forms</span>
                        </td>
                    </tr>
                </table>

                <?php submit_button(); ?>
            </form>

            <hr>

            <h2>Test API Connection</h2>
            <p>Send a test lead to verify your API configuration is working.</p>
            <button type="button" id="insightlead-test-connection" class="button button-secondary">
                Test Connection
            </button>
            <span id="insightlead-test-result" style="margin-left: 10px;"></span>

            <div id="insightlead-troubleshooting" style="display: none; background: #fff3cd; border-left: 4px solid #ffc107; padding: 12px; margin-top: 15px;">
                <h4 style="margin-top: 0;">Common Connection Errors:</h4>
                <ul style="margin-bottom: 0;">
                    <li><strong>"Connection failed"</strong> — Backend is not running or URL is wrong.</li>
                    <li><strong>"Invalid API Key" (401)</strong> — Check for typos or extra spaces in your API key.</li>
                    <li><strong>"Timeout"</strong> — Backend is unreachable; check firewall or hosting settings.</li>
                </ul>
            </div>

            <script>
            jQuery(document).ready(function($) {
                $('#insightlead-test-connection').on('click', function() {
                    var button = $(this);
                    var result = $('#insightlead-test-result');
                    var troubleshooting = $('#insightlead-troubleshooting');

                    troubleshooting.hide();
                    button.prop('disabled', true).text('Testing...');
                    result.html('<span style="color: #666;">Sending test lead...</span>');

                    $.ajax({
                        url: ajaxurl,
                        type: 'POST',
                        data: {
                            action: 'insightlead_test_connection',
                            nonce: '<?php echo wp_create_nonce('insightlead_test_connection'); ?>'
                        },
                        success: function(response) {
                            button.prop('disabled', false).text('Test Connection');
                            if (response.success) {
                                result.html('<span style="color: #46b450; font-weight: bold;">&#10003; ' + response.data.message + '</span>');
                                troubleshooting.hide();
                            } else {
                                result.html('<span style="color: #dc3232; font-weight: bold;">&#10007; ' + response.data.message + '</span>');
                                troubleshooting.show();
                            }
                        },
                        error: function() {
                            button.prop('disabled', false).text('Test Connection');
                            result.html('<span style="color: #dc3232; font-weight: bold;">&#10007; AJAX Error - Check console</span>');
                            troubleshooting.show();
                        }
                    });
                });
            });
            </script>

            <hr>

            <h2>Supported Form Builders</h2>
            <ul>
                <li>Elementor Pro Forms</li>
                <li>Contact Form 7</li>
                <li>WPForms</li>
                <li>Gravity Forms</li>
                <li>Ninja Forms</li>
                <li>Formidable Forms</li>
                <li>Fluent Forms</li>
                <li>MetForms</li>
                <li>Custom HTML Forms (via JavaScript)</li>
            </ul>

            <hr>

            <h2>Auto-Detected Fields</h2>
            <table class="widefat" style="max-width: 700px;">
                <thead>
                    <tr><th>Field</th><th>Detected Names</th></tr>
                </thead>
                <tbody>
                    <tr><td><strong>First Name</strong></td><td><code>first_name</code>, <code>fname</code>, <code>first-name</code>, <code>given_name</code></td></tr>
                    <tr><td><strong>Last Name</strong></td><td><code>last_name</code>, <code>lname</code>, <code>surname</code>, <code>family_name</code></td></tr>
                    <tr><td><strong>Email</strong></td><td><code>email</code>, <code>e-mail</code>, <code>your-email</code>, <code>email_address</code></td></tr>
                    <tr><td><strong>Phone</strong></td><td><code>phone</code>, <code>telephone</code>, <code>mobile</code>, <code>contact_number</code></td></tr>
                    <tr><td><strong>City</strong></td><td><code>city</code>, <code>location</code>, <code>town</code></td></tr>
                </tbody>
            </table>
            <p><strong>Minimum required:</strong> Form must have at least email OR phone to be captured.</p>

            <hr>

            <h2>Attribution Tracking (Automatic)</h2>
            <ul>
                <li>UTM Source, Medium, Campaign, Term, Content</li>
                <li>Google Ads Click ID (gclid)</li>
                <li>Facebook Click ID (fbclid)</li>
                <li>Referrer URL</li>
                <li>Landing Page URL</li>
            </ul>
        </div>
        <?php
    }

    public function add_settings_link($links) {
        $settings_link = '<a href="options-general.php?page=insightlead-settings">Settings</a>';
        array_unshift($links, $settings_link);
        return $links;
    }

    private function detect_field_type($field, $id) {
        $field_type = strtolower($field['type'] ?? '');
        $field_title = strtolower($field['title'] ?? '');
        $field_id = strtolower($id);
        $field_placeholder = strtolower($field['placeholder'] ?? '');
        $value = $field['value'] ?? '';

        $search_text = $field_title . ' ' . $field_id . ' ' . $field_placeholder;

        if ($field_type === 'email' ||
            $this->contains_any($search_text, ['email', 'e-mail', 'mail', 'correo'])) {
            return ['type' => 'email', 'value' => $value];
        }

        if ($field_type === 'tel' ||
            $this->contains_any($search_text, ['phone', 'mobile', 'cell', 'telephone', 'tel', 'contact number'])) {
            return ['type' => 'phone', 'value' => $value];
        }

        if ($field_type === 'number' &&
            $this->contains_any($search_text, ['phone', 'mobile', 'cell', 'tel'])) {
            return ['type' => 'phone', 'value' => $value];
        }

        if ($this->contains_any($search_text, ['first name', 'firstname', 'first_name', 'fname', 'given name'])) {
            return ['type' => 'first_name', 'value' => $value];
        }

        if ($this->contains_any($search_text, ['last name', 'lastname', 'last_name', 'lname', 'surname', 'family name'])) {
            return ['type' => 'last_name', 'value' => $value];
        }

        if ($this->contains_any($search_text, ['full name', 'fullname', 'name', 'your name']) &&
            !$this->contains_any($search_text, ['first', 'last', 'company', 'business'])) {
            return ['type' => 'full_name', 'value' => $value];
        }

        if ($this->contains_any($search_text, ['city', 'location', 'town'])) {
            return ['type' => 'city', 'value' => $value];
        }

        return null;
    }

    private function contains_any($text, $keywords) {
        foreach ($keywords as $keyword) {
            if (strpos($text, $keyword) !== false) {
                return true;
            }
        }
        return false;
    }

    public function capture_elementor_form($record, $handler) {
        if (!get_option('insightlead_enable_elementor', 1)) return;
        if (!class_exists('\ElementorPro\Plugin')) return;

        $form_fields = $record->get('fields');
        if (empty($form_fields)) return;

        if (defined('WP_DEBUG') && WP_DEBUG) {
            error_log('InsightLead Elementor Submission: ' . print_r($form_fields, true));
        }

        $params = [];

        $params['first_name'] = $this->get_elementor_field_value($form_fields, ['first_name', 'firstname', 'fname', 'name']);
        $params['last_name']  = $this->get_elementor_field_value($form_fields, ['last_name', 'lastname', 'lname', 'surname']);
        $params['email']      = $this->get_elementor_field_value($form_fields, ['email', 'email_address', 'mail']);
        $params['phone']      = $this->get_elementor_field_value($form_fields, ['phone', 'telephone', 'phone_number', 'mobile']);
        $params['city']       = $this->get_elementor_field_value($form_fields, ['city', 'location', 'town']);
        $params['interest']   = $this->get_elementor_field_value($form_fields, ['interest', 'interests', 'service', 'program']);
        $params['notes']      = $this->get_elementor_field_value($form_fields, ['message', 'notes', 'comments', 'additional_info']);

        $params['utm_source']   = $this->get_elementor_field_value($form_fields, ['utm_source']);
        $params['utm_medium']   = $this->get_elementor_field_value($form_fields, ['utm_medium']);
        $params['utm_campaign'] = $this->get_elementor_field_value($form_fields, ['utm_campaign']);
        $params['utm_term']     = $this->get_elementor_field_value($form_fields, ['utm_term']);
        $params['utm_content']  = $this->get_elementor_field_value($form_fields, ['utm_content']);
        $params['gclid']        = $this->get_elementor_field_value($form_fields, ['gclid']);
        $params['fbclid']       = $this->get_elementor_field_value($form_fields, ['fbclid']);
        $params['source']       = $this->get_elementor_field_value($form_fields, ['source']);

        if (empty($params['source']) && empty($params['utm_source'])) {
            $params['source'] = 'website';
        }

        $form_name = $record->get_form_settings('form_name');
        $params['form_id'] = 'elementor_' . ($form_name ? sanitize_title($form_name) : 'form');
        $params['referrer'] = wp_get_referer();

        foreach ($form_fields as $fid => $fdata) {
            $params['elementor_field_' . sanitize_key((string) $fid)] = isset($fdata['value']) ? $fdata['value'] : '';
            if (!empty($fdata['title'])) {
                $params['elementor_field_label_' . sanitize_key((string) $fid)] = $fdata['title'];
            }
        }

        if (!$this->has_data($params)) return;

        $this->send_to_api($params);
    }

    private function get_elementor_field_value($form_fields, $field_names) {
        foreach ($field_names as $field_name) {
            if (isset($form_fields[$field_name]) && !empty($form_fields[$field_name]['value'])) {
                return sanitize_text_field($form_fields[$field_name]['value']);
            }
            foreach ($form_fields as $field_id => $field_data) {
                if (isset($field_data['title']) &&
                    strcasecmp($field_data['title'], $field_name) === 0 &&
                    !empty($field_data['value'])) {
                    return sanitize_text_field($field_data['value']);
                }
            }
        }
        return null;
    }

    public function capture_cf7_form($contact_form) {
        if (!get_option('insightlead_enable_cf7', 1)) return;

        $submission = WPCF7_Submission::get_instance();
        if (!$submission) return;

        $posted_data = $submission->get_posted_data();

        if (defined('WP_DEBUG') && WP_DEBUG) {
            error_log('InsightLead CF7 Submission: ' . print_r($posted_data, true));
        }

        $params = [];

        if (isset($posted_data['your-name'])) {
            $name_parts = explode(' ', trim($posted_data['your-name']), 2);
            $params['first_name'] = $name_parts[0] ?? '';
            $params['last_name']  = $name_parts[1] ?? '';
        }
        if (isset($posted_data['first-name']))  $params['first_name'] = $posted_data['first-name'];
        if (isset($posted_data['last-name']))   $params['last_name']  = $posted_data['last-name'];
        if (isset($posted_data['your-email']))  $params['email']      = $posted_data['your-email'];
        if (isset($posted_data['email']))       $params['email']      = $posted_data['email'];
        if (isset($posted_data['your-phone']))  $params['phone']      = $posted_data['your-phone'];
        if (isset($posted_data['phone']))       $params['phone']      = $posted_data['phone'];
        if (isset($posted_data['your-city']))   $params['city']       = $posted_data['your-city'];
        if (isset($posted_data['city']))        $params['city']       = $posted_data['city'];
        if (isset($posted_data['your-message'])) $params['notes']     = $posted_data['your-message'];
        if (isset($posted_data['message']))     $params['notes']      = $posted_data['message'];
        if (isset($posted_data['your-subject'])) $params['interest']  = $posted_data['your-subject'];
        if (isset($posted_data['interest']))    $params['interest']   = $posted_data['interest'];

        foreach (['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','fbclid'] as $p) {
            if (isset($_GET[$p]))         $params[$p] = sanitize_text_field($_GET[$p]);
            if (isset($posted_data[$p]))  $params[$p] = $posted_data[$p];
        }
        if (isset($posted_data['source'])) $params['source'] = $posted_data['source'];

        if (empty($params['source']) && empty($params['utm_source'])) {
            $params['source'] = 'website';
        }

        $params['form_id'] = 'cf7_' . $contact_form->id();
        $params['referrer'] = wp_get_referer();

        foreach ($posted_data as $k => $v) {
            $safe_k = 'cf7_' . sanitize_key((string) $k);
            if (!isset($params[$safe_k])) {
                $params[$safe_k] = is_array($v) ? wp_json_encode($v) : $v;
            }
        }

        if (!$this->has_data($params)) return;

        $this->send_to_api($params);
    }

    public function capture_wpforms_form($fields, $entry, $form_data, $entry_id) {
        if (!get_option('insightlead_enable_wpforms', 1)) return;
        if (empty($fields)) return;

        if (defined('WP_DEBUG') && WP_DEBUG) {
            error_log('InsightLead WPForms Submission: ' . print_r($fields, true));
        }

        $params = [];

        foreach ($fields as $field_id => $field) {
            $name  = isset($field['name'])  ? strtolower(trim($field['name']))  : '';
            $value = isset($field['value']) ? trim($field['value']) : '';
            $type  = isset($field['type'])  ? $field['type'] : '';

            if ($type === 'name') {
                if (isset($field['first'])) $params['first_name'] = trim($field['first']);
                if (isset($field['last']))  $params['last_name']  = trim($field['last']);
            } elseif ($type === 'email' && !empty($value)) {
                $params['email'] = $value;
            } elseif ($type === 'phone' && !empty($value)) {
                $params['phone'] = $value;
            } elseif (!empty($name) && !empty($value)) {
                if (strpos($name, 'first') !== false || $name === 'fname')          $params['first_name'] = $value;
                elseif (strpos($name, 'last') !== false || $name === 'lname')       $params['last_name']  = $value;
                elseif (strpos($name, 'email') !== false)                            $params['email']      = $value;
                elseif (strpos($name, 'phone') !== false || strpos($name, 'mobile') !== false) $params['phone'] = $value;
                elseif (strpos($name, 'city') !== false)                             $params['city']       = $value;
                elseif (strpos($name, 'message') !== false || strpos($name, 'comment') !== false) $params['notes'] = $value;
                elseif (strpos($name, 'interest') !== false)                         $params['interest']   = $value;
            }

            $params['wpforms_field_' . sanitize_key((string) $field_id)] = is_array($value) ? wp_json_encode($value) : $value;
        }

        $params['source']   = 'website';
        $params['form_id']  = 'wpforms_' . ($form_data['id'] ?? 'unknown');
        $params['referrer'] = wp_get_referer();

        if (!$this->has_data($params)) return;

        $this->send_to_api($params);
    }

    public function capture_metforms_form($form_data, $form_id) {
        if (!get_option('insightlead_enable_metforms', 1)) return;

        if (is_numeric($form_data) && is_array($form_id)) {
            $tmp = $form_data; $form_data = $form_id; $form_id = $tmp;
        }

        if (empty($form_data)) return;

        if (defined('WP_DEBUG') && WP_DEBUG) {
            error_log('InsightLead MetForms Submission: ' . print_r($form_data, true));
        }

        $params = [];

        foreach ($form_data as $key => $value) {
            $key_lower     = strtolower($key);
            $value_trimmed = is_string($value) ? trim($value) : $value;
            if (empty($value_trimmed)) continue;

            if (strpos($key_lower, 'first') !== false || strpos($key_lower, 'fname') !== false)          $params['first_name'] = $value_trimmed;
            elseif (strpos($key_lower, 'last') !== false || strpos($key_lower, 'lname') !== false)        $params['last_name']  = $value_trimmed;
            elseif (strpos($key_lower, 'email') !== false)                                                 $params['email']      = $value_trimmed;
            elseif (strpos($key_lower, 'phone') !== false || strpos($key_lower, 'mobile') !== false)      $params['phone']      = $value_trimmed;
            elseif (strpos($key_lower, 'city') !== false)                                                  $params['city']       = $value_trimmed;
            elseif (strpos($key_lower, 'message') !== false || strpos($key_lower, 'comment') !== false)   $params['notes']      = $value_trimmed;
            elseif (strpos($key_lower, 'interest') !== false)                                              $params['interest']   = $value_trimmed;

            $params['metform_' . sanitize_key($key)] = is_array($value) ? wp_json_encode($value) : $value;
        }

        if (empty($params['first_name']) && empty($params['last_name'])) {
            foreach ($form_data as $key => $value) {
                if (stripos($key, 'name') !== false && !empty($value)) {
                    $parts = explode(' ', trim($value), 2);
                    $params['first_name'] = $parts[0] ?? '';
                    $params['last_name']  = $parts[1] ?? '';
                    break;
                }
            }
        }

        $params['source']   = 'website';
        $params['form_id']  = 'metform_' . $form_id;
        $params['referrer'] = wp_get_referer();

        if (!$this->has_data($params)) return;

        $this->send_to_api($params);
    }

    public function capture_gravity_form($entry, $form) {
        if (!get_option('insightlead_enable_gravity', 1)) return;
        if (empty($entry) || empty($form)) return;

        if (defined('WP_DEBUG') && WP_DEBUG) {
            error_log('InsightLead Gravity Forms Submission: ' . print_r($entry, true));
        }

        $params = [];

        if (!empty($form['fields'])) {
            foreach ($form['fields'] as $field) {
                $field_id    = $field->id;
                $field_type  = $field->type;
                $field_label = isset($field->label) ? strtolower($field->label) : '';
                $value       = isset($entry[$field_id]) ? trim($entry[$field_id]) : '';

                if (empty($value)) continue;

                if ($field_type === 'name') {
                    if (isset($entry[$field_id . '.3'])) $params['first_name'] = trim($entry[$field_id . '.3']);
                    if (isset($entry[$field_id . '.6'])) $params['last_name']  = trim($entry[$field_id . '.6']);
                } elseif ($field_type === 'email') {
                    $params['email'] = $value;
                } elseif ($field_type === 'phone') {
                    $params['phone'] = $value;
                } elseif (in_array($field_type, ['text', 'textarea', 'select', 'radio', 'checkbox'])) {
                    if (strpos($field_label, 'first') !== false)                                                  $params['first_name'] = $value;
                    elseif (strpos($field_label, 'last') !== false)                                               $params['last_name']  = $value;
                    elseif (strpos($field_label, 'city') !== false)                                               $params['city']       = $value;
                    elseif (strpos($field_label, 'message') !== false || strpos($field_label, 'comment') !== false) $params['notes']    = $value;
                    elseif (strpos($field_label, 'interest') !== false)                                           $params['interest']   = $value;
                }

                $params['gf_field_' . sanitize_key((string) $field_id)] = is_array($value) ? wp_json_encode($value) : $value;
            }
        }

        $params['source']   = 'website';
        $params['form_id']  = 'gravityforms_' . ($form['id'] ?? 'unknown');
        $params['referrer'] = isset($entry['source_url']) ? $entry['source_url'] : '';

        if (!$this->has_data($params)) return;

        $this->send_to_api($params);
    }

    public function capture_ninja_form($form_data) {
        if (!get_option('insightlead_enable_ninja', 1)) return;
        if (empty($form_data) || empty($form_data['fields'])) return;

        if (defined('WP_DEBUG') && WP_DEBUG) {
            error_log('InsightLead Ninja Forms Submission: ' . print_r($form_data, true));
        }

        $params  = [];
        $fields  = $form_data['fields'];

        foreach ($fields as $field) {
            $key   = isset($field['key'])   ? strtolower($field['key']) : '';
            $value = isset($field['value']) ? trim($field['value']) : '';
            if (empty($value)) continue;

            if (strpos($key, 'first') !== false || strpos($key, 'fname') !== false)          $params['first_name'] = $value;
            elseif (strpos($key, 'last') !== false || strpos($key, 'lname') !== false)        $params['last_name']  = $value;
            elseif (strpos($key, 'email') !== false)                                           $params['email']      = $value;
            elseif (strpos($key, 'phone') !== false || strpos($key, 'mobile') !== false)      $params['phone']      = $value;
            elseif (strpos($key, 'city') !== false)                                            $params['city']       = $value;
            elseif (strpos($key, 'message') !== false || strpos($key, 'comment') !== false)   $params['notes']      = $value;
            elseif (strpos($key, 'interest') !== false)                                        $params['interest']   = $value;

            if (isset($field['label'])) {
                $label = strtolower($field['label']);
                if (empty($params['first_name']) && strpos($label, 'first') !== false) $params['first_name'] = $value;
                elseif (empty($params['last_name']) && strpos($label, 'last') !== false) $params['last_name'] = $value;
            }

            $field_id = isset($field['id']) ? $field['id'] : $key;
            $params['ninja_field_' . sanitize_key((string) $field_id)] = is_array($value) ? wp_json_encode($value) : $value;
        }

        if (empty($params['first_name']) && empty($params['last_name'])) {
            foreach ($fields as $field) {
                $key = isset($field['key']) ? strtolower($field['key']) : '';
                if (strpos($key, 'name') !== false && !empty($field['value'])) {
                    $parts = explode(' ', trim($field['value']), 2);
                    $params['first_name'] = $parts[0] ?? '';
                    $params['last_name']  = $parts[1] ?? '';
                    break;
                }
            }
        }

        $params['source']   = 'website';
        $params['form_id']  = 'ninjaforms_' . ($form_data['form_id'] ?? 'unknown');
        $params['referrer'] = wp_get_referer();

        if (!$this->has_data($params)) return;

        $this->send_to_api($params);
    }

    public function capture_formidable_form($entry_id, $form_id) {
        if (!get_option('insightlead_enable_formidable', 1)) return;
        if (!class_exists('FrmEntry') || !class_exists('FrmField')) return;

        $entry = FrmEntry::getOne($entry_id, true);
        if (!$entry) return;

        if (defined('WP_DEBUG') && WP_DEBUG) {
            error_log('InsightLead Formidable Submission: ' . print_r($entry, true));
        }

        $params = [];

        if (!empty($entry->metas)) {
            foreach ($entry->metas as $field_id => $value) {
                $field = FrmField::getOne($field_id);
                if (!$field) continue;

                $name          = isset($field->name)  ? strtolower($field->name)  : '';
                $label         = isset($field->label) ? strtolower($field->label) : '';
                $value_trimmed = is_string($value) ? trim($value) : $value;
                if (empty($value_trimmed)) continue;

                if (strpos($name, 'first') !== false || strpos($label, 'first') !== false)          $params['first_name'] = $value_trimmed;
                elseif (strpos($name, 'last') !== false || strpos($label, 'last') !== false)         $params['last_name']  = $value_trimmed;
                elseif (strpos($name, 'email') !== false || strpos($label, 'email') !== false)        $params['email']      = $value_trimmed;
                elseif (strpos($name, 'phone') !== false || strpos($label, 'phone') !== false)        $params['phone']      = $value_trimmed;
                elseif (strpos($name, 'city') !== false || strpos($label, 'city') !== false)          $params['city']       = $value_trimmed;
                elseif (strpos($name, 'message') !== false || strpos($label, 'message') !== false)    $params['notes']      = $value_trimmed;
                elseif (strpos($name, 'interest') !== false || strpos($label, 'interest') !== false)  $params['interest']   = $value_trimmed;

                $params['formidable_field_' . sanitize_key((string) $field_id)] = is_array($value) ? wp_json_encode($value) : $value;
            }
        }

        $params['source']   = 'website';
        $params['form_id']  = 'formidable_' . $form_id;
        $params['referrer'] = wp_get_referer();

        if (!$this->has_data($params)) return;

        $this->send_to_api($params);
    }

    public function capture_fluent_form($entry_id, $form_data, $form) {
        if (!get_option('insightlead_enable_fluent', 1)) return;
        if (empty($form_data)) return;

        if (defined('WP_DEBUG') && WP_DEBUG) {
            error_log('InsightLead Fluent Forms Submission: ' . print_r($form_data, true));
        }

        $params = [];

        if (isset($form_data['names']) && is_array($form_data['names'])) {
            if (!empty($form_data['names']['first_name'])) $params['first_name'] = trim($form_data['names']['first_name']);
            if (!empty($form_data['names']['last_name']))  $params['last_name']  = trim($form_data['names']['last_name']);
        }

        foreach ($form_data as $key => $value) {
            $key_lower     = strtolower($key);
            $value_trimmed = is_string($value) ? trim($value) : $value;
            if (empty($value_trimmed)) continue;

            if ($key_lower === 'email' || strpos($key_lower, 'email') !== false)                                      $params['email']      = $value_trimmed;
            elseif ($key_lower === 'phone' || strpos($key_lower, 'phone') !== false)                                  $params['phone']      = $value_trimmed;
            elseif ($key_lower === 'first_name' && empty($params['first_name']))                                       $params['first_name'] = $value_trimmed;
            elseif ($key_lower === 'last_name' && empty($params['last_name']))                                         $params['last_name']  = $value_trimmed;
            elseif (strpos($key_lower, 'city') !== false)                                                              $params['city']       = $value_trimmed;
            elseif (strpos($key_lower, 'message') !== false || strpos($key_lower, 'comment') !== false)               $params['notes']      = $value_trimmed;
            elseif (strpos($key_lower, 'interest') !== false)                                                          $params['interest']   = $value_trimmed;

            $params['fluent_' . sanitize_key($key)] = is_array($value) ? wp_json_encode($value) : $value;
        }

        $params['source']   = 'website';
        $params['form_id']  = 'fluentforms_' . (isset($form->id) ? $form->id : 'unknown');
        $params['referrer'] = wp_get_referer();

        if (!$this->has_data($params)) return;

        $this->send_to_api($params);
    }

    private function has_data($params) {
        foreach ($params as $key => $value) {
            if (!empty($value) && $key !== 'form_id' && $key !== 'source') {
                return true;
            }
        }
        return false;
    }

    private function send_to_api($payload) {
        $api_url = get_option('insightlead_api_url');
        $api_key = get_option('insightlead_api_key');

        if (empty($api_url) || empty($api_key)) {
            $this->log_error('API URL or API Key not configured');
            return;
        }

        // Allow requests to tunnel URLs (loca.lt, ngrok, etc.) that WordPress may block
        add_filter('http_request_host_is_external', '__return_true');
        add_filter('https_ssl_verify', '__return_false');

        $utm_params = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
        foreach ($utm_params as $param) {
            if (isset($_GET[$param])) {
                $payload[$param] = sanitize_text_field($_GET[$param]);
            } elseif (isset($_COOKIE[$param])) {
                $payload[$param] = sanitize_text_field($_COOKIE[$param]);
            }
        }

        if (!empty($_SERVER['HTTP_REFERER'])) {
            $payload['referrer'] = esc_url_raw($_SERVER['HTTP_REFERER']);
        }
        if (isset($_GET['gclid']))  $payload['gclid']  = sanitize_text_field($_GET['gclid']);
        if (isset($_GET['fbclid'])) $payload['fbclid'] = sanitize_text_field($_GET['fbclid']);

        $response = wp_remote_post($api_url . '/api/ingest/lead', [
            'headers' => [
                'Content-Type' => 'application/json',
                'X-Tenant-Key' => $api_key,
            ],
            'body'    => json_encode($payload),
            'timeout' => 15,
        ]);

        if (is_wp_error($response)) {
            $this->log_error('API request failed: ' . $response->get_error_message());
        } else {
            $status_code = wp_remote_retrieve_response_code($response);
            if ($status_code !== 200 && $status_code !== 201) {
                $body = wp_remote_retrieve_body($response);
                $this->log_error('API returned error ' . $status_code . ': ' . $body);
            }
        }
    }

    private function log_error($message) {
        if (get_option('insightlead_enable_logging')) {
            error_log('[InsightLead] ' . $message);
        }
    }

    public function ajax_test_connection() {
        check_ajax_referer('insightlead_test_connection', 'nonce');

        if (!current_user_can('manage_options')) {
            wp_send_json_error(['message' => 'Permission denied']);
            return;
        }

        $api_url = get_option('insightlead_api_url');
        $api_key = get_option('insightlead_api_key');

        if (empty($api_url) || empty($api_key)) {
            wp_send_json_error(['message' => 'Please configure API URL and API Key first']);
            return;
        }

        // Allow tunnel URLs (loca.lt, ngrok, etc.)
        add_filter('http_request_host_is_external', '__return_true');
        add_filter('https_ssl_verify', '__return_false');

        $test_payload = [
            'first_name' => 'Test',
            'last_name'  => 'User',
            'email'      => 'test@insightfulmindpsych.com',
            'phone'      => '555-1234',
            'source'     => 'wordpress-test',
            'form_id'    => 'test-connection',
            'notes'      => 'Test submission from InsightLead WordPress plugin - ' . date('Y-m-d H:i:s'),
        ];

        $response = wp_remote_post($api_url . '/api/ingest/lead', [
            'headers' => [
                'Content-Type' => 'application/json',
                'X-Tenant-Key' => $api_key,
            ],
            'body'    => json_encode($test_payload),
            'timeout' => 15,
        ]);

        if (is_wp_error($response)) {
            wp_send_json_error(['message' => 'Connection failed: ' . $response->get_error_message()]);
            return;
        }

        $status_code = wp_remote_retrieve_response_code($response);
        $body        = wp_remote_retrieve_body($response);

        if ($status_code === 200 || $status_code === 201) {
            $data    = json_decode($body, true);
            $lead_id = isset($data['leadId']) ? substr($data['leadId'], 0, 8) . '...' : 'unknown';
            wp_send_json_success(['message' => "Connection successful! Test lead created (ID: {$lead_id})"]);
        } else {
            wp_send_json_error(['message' => "API returned error {$status_code}: " . substr($body, 0, 100)]);
        }
    }
}

add_action('plugins_loaded', function() {
    InsightLead_Connector::instance();
});
