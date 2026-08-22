// Resolves a stored theme preference ('light' | 'dark' | 'system') to
// an actual display value ('light' | 'dark'). 'system' defers to the
// OS/browser's prefers-color-scheme setting.
//
// NOTE: the pre-paint <script> in every page's <head> duplicates this
// exact logic inline - it can't import this module, since it must run
// synchronously before any module loads (that's what prevents the
// flash-of-wrong-theme). Keep both in sync if this logic ever changes.

export function resolveTheme(pref) {
    if (pref === 'system') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return pref;
}

// Calls `callback` whenever the OS-level color scheme changes, but
// only while the stored preference is still 'system' - returns an
// unsubscribe function.
export function watchSystemTheme(callback) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => callback();
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
}