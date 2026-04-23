<?php
/**
 * Performance: Conditional script loading, settings cache, submission queue
 */

class InsightLead_Performance_Manager {

    private static $has_forms_on_page = false;

    public static function detect_forms_on_page() {
        global $post;
        if (!$post) return false;

        $content = $post->post_content;

        $form_indicators = [
            '<form',
            '[contact-form-7',
            '[wpforms',
            '[gravityform',
            '[ninja_form',
            'elementor-form',
            '[formidable',
            '[fluentform',
        ];

        foreach ($form_indicators as $indicator) {
            if (stripos($content, $indicator) !== false) {
                self::$has_forms_on_page = true;
                return true;
            }
        }

        return false;
    }

    public static function enqueue_scripts() {
        if (is_admin()) return;
        if (!self::detect_forms_on_page()) return;

        wp_enqueue_script(
            'insightlead-universal-capture',
            INSIGHTLEAD_PLUGIN_URL . 'assets/js/universal-capture.js',
            [],
            INSIGHTLEAD_VERSION,
            true
        );

        $config = [
            'apiEndpoint' => get_option('insightlead_api_url'),
            'apiKey'      => get_option('insightlead_api_key'),
            'debug'       => defined('WP_DEBUG') && WP_DEBUG,
        ];

        wp_add_inline_script(
            'insightlead-universal-capture',
            'window.insightLeadConfig = ' . wp_json_encode($config) . ';',
            'before'
        );
    }

    public static function add_defer_attribute($tag, $handle) {
        if ('insightlead-universal-capture' !== $handle) {
            return $tag;
        }
        return str_replace(' src', ' defer src', $tag);
    }

    public static function utm_tracker_inline() {
        if (is_admin() || !self::$has_forms_on_page) return;
        ?>
        <script>
        (function(){
            if (!window.location.search) return;
            var p = new URLSearchParams(window.location.search);
            ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','fbclid'].forEach(function(k){
                var v = p.get(k);
                if (v) document.cookie = k + '=' + v + '; max-age=2592000; path=/';
            });
        })();
        </script>
        <?php
    }
}

class InsightLead_Settings_Cache {

    private static $cache_key      = 'insightlead_settings_cache';
    private static $cache_duration = 3600;

    public static function get_settings() {
        $cached = get_transient(self::$cache_key);
        if ($cached !== false) return $cached;

        $settings = [
            'api_url'        => get_option('insightlead_api_url'),
            'api_key'        => get_option('insightlead_api_key'),
            'enable_logging' => get_option('insightlead_enable_logging'),
        ];

        set_transient(self::$cache_key, $settings, self::$cache_duration);
        return $settings;
    }

    public static function clear_cache() {
        delete_transient(self::$cache_key);
    }
}

class InsightLead_Submission_Queue {

    public static function queue_submission($payload) {
        $queue   = get_option('insightlead_submission_queue', []);
        $queue[] = ['payload' => $payload, 'timestamp' => time(), 'attempts' => 0];

        if (count($queue) > 100) {
            $queue = array_slice($queue, -100);
        }

        update_option('insightlead_submission_queue', $queue, false);

        if (!wp_next_scheduled('insightlead_process_queue')) {
            wp_schedule_single_event(time() + 60, 'insightlead_process_queue');
        }
    }

    public static function process_queue() {
        $queue = get_option('insightlead_submission_queue', []);
        if (empty($queue)) return;

        $remaining = [];

        foreach ($queue as $item) {
            $success = self::send_to_api($item['payload']);
            if (!$success) {
                $item['attempts']++;
                if ($item['attempts'] < 3) {
                    $remaining[] = $item;
                }
            }
        }

        update_option('insightlead_submission_queue', $remaining, false);
    }

    private static function send_to_api($payload) {
        $settings = InsightLead_Settings_Cache::get_settings();

        $response = wp_remote_post($settings['api_url'] . '/api/ingest/lead', [
            'headers' => [
                'Content-Type' => 'application/json',
                'X-Tenant-Key' => $settings['api_key'],
            ],
            'body'     => json_encode($payload),
            'timeout'  => 10,
            'blocking' => true,
        ]);

        return !is_wp_error($response) && wp_remote_retrieve_response_code($response) === 200;
    }
}

add_action('insightlead_process_queue', ['InsightLead_Submission_Queue', 'process_queue']);
