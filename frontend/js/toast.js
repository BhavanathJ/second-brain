// Shared toast notification system - replaces raw alert() calls across
// every page with a non-blocking, themed notification. Import
// { showToast } wherever a page currently uses alert().

let container = null;

function ensureContainer() {
    if (container) return container;
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
    return container;
}

// type: 'error' | 'success' | 'info'
export function showToast(message, type = 'error') {
    const mount = ensureContainer();

    const toast = document.createElement('div');
    toast.className = `toast-item toast-${type}`;
    toast.textContent = message;

    toast.addEventListener('click', () => dismiss(toast));
    mount.appendChild(toast);

    // Force a reflow so the enter transition actually plays (adding the
    // class in the same tick as insertion would skip the transition).
    requestAnimationFrame(() => toast.classList.add('toast-visible'));

    const timer = setTimeout(() => dismiss(toast), 4000);
    toast.dataset.timerId = timer;
}

function dismiss(toast) {
    clearTimeout(Number(toast.dataset.timerId));
    toast.classList.remove('toast-visible');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
}