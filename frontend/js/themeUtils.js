// Resolves a stored theme preference ('light' | 'dark' | 'system') to
// an actual display value ('light' | 'dark'). 'system' defers to the
// OS/browser's prefers-color-scheme setting.
//
// NOTE: the pre-paint <script> in every page's <head> duplicates this
// exact logic inline — it can't import this module, since it must run
// synchronously before any module loads (that's what prevents the
// flash-of-wrong-theme). Keep both in sync if this logic ever changes.

export function resolveTheme(pref) {
    if (pref === 'system') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return pref;
}

// Applies a raw theme preference ('light'/'dark'/'system') everywhere
// it needs to land: the DOM attribute CSS reads, the localStorage cache
// the pre-paint <head> script reads before this module even loads, and
// the favicon. Was independently reimplemented in layout.js (missing
// the favicon step) and settings.js (had it) — this is the one place
// now, so "apply theme" can't drift out of sync with itself again.
export function applyTheme(rawPref) {
    const resolved = resolveTheme(rawPref);
    document.documentElement.setAttribute('data-theme', resolved);
    localStorage.setItem('theme', rawPref);
    const basePath = window.location.pathname.includes('/pages/') ? '../' : '';
    updateFavicon(resolved, basePath);
    return resolved;
}

// Calls `callback` whenever the OS-level color scheme changes, but
// only while the stored preference is still 'system' — returns an
// unsubscribe function.
export function watchSystemTheme(callback) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => callback();
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
}

// Cross-tab sync: if the theme is changed in another tab, this tab's
// favicon/DOM should follow. Browsers only fire 'storage' in tabs OTHER
// than the one that made the change, which is exactly the gap
// applyTheme()/the navbar selector can't cover on their own.
// callback receives the new raw preference ('light'/'dark'/'system').
export function watchExternalThemeChanges(callback) {
    const handler = (e) => {
        if (e.key === 'theme' && e.newValue) callback(e.newValue);
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
}

// Updates the favicon based on the resolved theme ('light' | 'dark').
// This is called whenever the theme changes so the icon switches
// instantly without a page reload.
// basePath must match how this page already links its own favicon:
// '' for frontend/index.html (root), '../' for anything under frontend/pages/.
export function updateFavicon(resolvedTheme, basePath = '../') {
    // Update existing favicon link by ID (created in pre-paint script)
    const favicon = document.getElementById('favicon');
    if (favicon) {
        favicon.href = resolvedTheme === 'dark' ? `${basePath}favicon-dark.svg` : `${basePath}favicon.svg`;
    }
}