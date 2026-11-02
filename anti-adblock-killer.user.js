// ==UserScript==
// @name         Anti-Adblock Killer
// @namespace    https://github.com/RealCrazyAnonymous/anti-adblock-killer-user
// @version      1.0.0
// @description  Neutralises anti-adblock detection, removes overlays, and restores page functionality.
// @author       RealCrazyAnonymous
// @match        *://*/*
// @run-at       document-start
// @grant        none
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    /* ------------------------------------------------------------------ */
    /*  Configuration – tweak to your liking                              */
    /* ------------------------------------------------------------------ */
    const CONFIG = {
        // Fake values for common ad‑detection flags
        fakeFlags: {
            adsbygoogle: [],
            adsBlocked: false,
            canRunAds: true,
            showAds: true,
            adblock: false,
            adBlockDetected: false,
            adblockDetected: false,
            blockAdBlock: false,
            isAdBlockActive: false,
            hasAdBlocker: false,
            adblocker: false
        },
        // CSS selectors for typical anti‑adblock overlays
        overlaySelectors: [
            '.adblock-notice',
            '.adblock-warning',
            '.adblock-popup',
            '.adblock-overlay',
            '.anti-adblock',
            '.adblock-detected',
            '#adblock-modal',
            '#adblock-overlay',
            '[class*="adblock"]',
            '[id*="adblock"]',
            '[class*="anti-adblock"]',
            '[id*="anti-adblock"]'
        ],
        // Domains that often serve ad‑detection scripts (optional blocking)
        adScriptDomains: [
            'pagead2.googlesyndication.com',
            'securepubads.g.doubleclick.net',
            'ads.pubmatic.com',
            'static.criteo.net',
            'cdn.taboola.com'
        ]
    };

    /* ------------------------------------------------------------------ */
    /*  Utility: make a function look native (stealth)                    */
    /* ------------------------------------------------------------------ */
    const nativeToString = Function.prototype.toString;
    const fakeNative = function (fn) {
        fn.toString = function () {
            return nativeToString.call(fn).replace(/\[native code\]/, '');
        };
        return fn;
    };

    /* ------------------------------------------------------------------ */
    /*  1. Inject fake ad‑detection flags before page scripts run         */
    /* ------------------------------------------------------------------ */
    try {
        Object.keys(CONFIG.fakeFlags).forEach(key => {
            if (!(key in window)) {
                Object.defineProperty(window, key, {
                    value: CONFIG.fakeFlags[key],
                    writable: false,
                    configurable: false
                });
            }
        });
    } catch (e) {
        // Silent fail – some sites may have frozen the window object
    }

    /* ------------------------------------------------------------------ */
    /*  2. Intercept fetch & XHR to block known ad‑detection requests     */
    /* ------------------------------------------------------------------ */
    const shouldBlock = url =>
        CONFIG.adScriptDomains.some(domain => url.includes(domain));

    // ---- fetch ----
    const originalFetch = window.fetch;
    window.fetch = fakeNative(function (...args) {
        const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
        if (shouldBlock(url)) {
            return Promise.resolve(new Response('', { status: 200 }));
        }
        return originalFetch.apply(this, args);
    });

    // ---- XMLHttpRequest ----
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = fakeNative(function (method, url, ...rest) {
        if (shouldBlock(url)) {
            // Redirect to a harmless endpoint
            url = 'about:blank';
        }
        return originalOpen.call(this, method, url, ...rest);
    });

    /* ------------------------------------------------------------------ */
    /*  3. Spoof bait elements that detection scripts look for            */
    /* ------------------------------------------------------------------ */
    function createBaitElement() {
        const bait = document.createElement('div');
        bait.className = 'ad-bait';
        bait.id = 'ad-bait';
        bait.style.cssText =
            'position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;';
        // Some detectors check for “adsbox” or similar
        bait.innerHTML = '<div class="adsbox">&nbsp;</div>';
        document.documentElement.appendChild(bait);
    }

    if (document.documentElement) {
        createBaitElement();
    } else {
        new MutationObserver((_, obs) => {
            if (document.documentElement) {
                createBaitElement();
                obs.disconnect();
            }
        }).observe(document, { childList: true, subtree: true });
    }

    /* ------------------------------------------------------------------ */
    /*  4. Remove anti‑adblock overlays and restore page interaction       */
    /* ------------------------------------------------------------------ */
    const removeOverlays = () => {
        CONFIG.overlaySelectors.forEach(sel => {
            document.querySelectorAll(sel).forEach(el => el.remove());
        });

        // Un‑lock scrolling
        document.documentElement.style.overflow = '';
        document.body.style.overflow = '';
        document.documentElement.style.position = '';
        document.body.style.position = '';

        // Remove blur / pointer‑events blocks
        document.body.style.filter = '';
        document.body.style.pointerEvents = '';
    };

    // Run once now and then continuously via MutationObserver
    if (document.body) {
        removeOverlays();
    }

    const observer = new MutationObserver(() => {
        // Debounce to avoid excessive calls
        if (observer._timer) clearTimeout(observer._timer);
        observer._timer = setTimeout(removeOverlays, 100);
    });

    observer.observe(document.documentElement || document, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class']
    });

    /* ------------------------------------------------------------------ */
    /*  5. Periodic reinforcement (helps with late‑loading scripts)       */
    /* ------------------------------------------------------------------ */
    setInterval(() => {
        // Re‑apply fake flags if a site tries to overwrite them
        Object.keys(CONFIG.fakeFlags).forEach(key => {
            if (window[key] !== CONFIG.fakeFlags[key]) {
                try {
                    Object.defineProperty(window, key, {
                        value: CONFIG.fakeFlags[key],
                        writable: false,
                        configurable: false
                    });
                } catch (_) { /* ignore */ }
            }
        });
        // Keep bait element alive
        if (!document.getElementById('ad-bait')) createBaitElement();
        // Cleanup in case new overlays appeared
        removeOverlays();
    }, 3000);

    /* ------------------------------------------------------------------ */
    /*  6. Optional: block window.open pop‑ups used by some detectors      */
    /* ------------------------------------------------------------------ */
    const originalOpen = window.open;
    window.open = fakeNative(function (...args) {
        // Only block if the call originates from an ad‑related context
        // (simple heuristic: block if URL contains known ad domains)
        const url = args[0] || '';
        if (shouldBlock(url)) {
            console.warn('Anti-Adblock Killer blocked pop‑up:', url);
            return null;
        }
        return originalOpen.apply(this, args);
    });

    /* ------------------------------------------------------------------ */
    /*  Done                                                              */
    /* ------------------------------------------------------------------ */
    console.info('🛡️ Anti-Adblock Killer active');
})();
