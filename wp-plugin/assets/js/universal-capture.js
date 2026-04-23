/**
 * InsightLead Universal Form Capture
 * Async, zero-lag form capture for any HTML form with email or phone.
 */

(function () {
    'use strict';

    const config = {
        apiEndpoint: window.insightLeadConfig?.apiEndpoint || '',
        apiKey:      window.insightLeadConfig?.apiKey      || '',
        debug:       window.insightLeadConfig?.debug       || false,
        timeout:     5000,
    };

    const formCache         = new Map();
    const recentSubmissions = new Set();

    document.addEventListener('submit', function (e) {
        const form   = e.target;
        const formId = form.id || form.name || generateFormId(form);

        if (formCache.has(formId) && !formCache.get(formId).isLeadForm) return;

        captureFormAsync(form, formId);
    }, true);

    function captureFormAsync(form, formId) {
        setTimeout(function () {
            try {
                captureForm(form, formId);
            } catch (err) {
                if (config.debug) console.error('[InsightLead] Capture error:', err);
            }
        }, 0);
    }

    function captureForm(form, formId) {
        if (recentSubmissions.has(formId)) return;
        recentSubmissions.add(formId);
        setTimeout(() => recentSubmissions.delete(formId), 2000);

        const formData = new FormData(form);
        const data     = {};

        for (let [key, value] of formData.entries()) {
            if (value && value.toString().trim()) {
                data[key] = value.toString();
            }
        }

        const hasEmail = detectEmail(data);
        const hasPhone = detectPhone(data);

        if (!hasEmail && !hasPhone) {
            formCache.set(formId, { isLeadForm: false });
            return;
        }

        formCache.set(formId, { isLeadForm: true });

        const payload = {
            ...data,
            form_id:  formId,
            source:   'website-universal',
            ...getUTMParams(),
            referrer: document.referrer || null,
            page_url: window.location.href,
        };

        sendToAPI(payload);
    }

    function detectEmail(data) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        for (let v of Object.values(data)) {
            if (re.test(v)) return v;
        }
        return null;
    }

    function detectPhone(data) {
        const re = /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;
        for (let v of Object.values(data)) {
            if (re.test(v)) return v;
        }
        return null;
    }

    function getUTMParams() {
        const params = {};
        ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid'].forEach(k => {
            const v = getCookie(k);
            if (v) params[k] = v;
        });
        return params;
    }

    function getCookie(name) {
        const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
        return match ? decodeURIComponent(match[2]) : null;
    }

    function generateFormId(form) {
        return form.id || form.name || 'form_' + Math.random().toString(36).substr(2, 9);
    }

    function sendToAPI(payload) {
        if (!config.apiEndpoint || !config.apiKey) {
            if (config.debug) console.warn('[InsightLead] API not configured');
            return;
        }

        const controller = new AbortController();
        const timeoutId  = setTimeout(() => controller.abort(), config.timeout);

        fetch(config.apiEndpoint + '/api/ingest/lead', {
            method:    'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Tenant-Key': config.apiKey,
            },
            body:      JSON.stringify(payload),
            signal:    controller.signal,
            keepalive: true,
        })
        .then(response => {
            clearTimeout(timeoutId);
            if (config.debug) {
                if (response.ok) console.log('[InsightLead] Lead captured:', payload.email || payload.phone);
                else             console.warn('[InsightLead] API error:', response.status);
            }
        })
        .catch(err => {
            clearTimeout(timeoutId);
            if (config.debug && err.name !== 'AbortError') console.error('[InsightLead] Network error:', err);
        });
    }

})();
