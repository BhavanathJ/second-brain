import { apiFetch } from './api.js';

/**
 * Initializes the cross-profile filter bar.
 * @param {Function} onChange - Callback invoked when selection changes.
 *   Receives: null (active profile only), 'all' (all profiles), or array of profile IDs.
 * @returns {Promise<Object>} Object with destroy() method to clean up.
 */
export async function initProfileFilter(onChange) {
    // Create container if it doesn't exist
    let container = document.getElementById('profileFilterContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'profileFilterContainer';
        // Insert right after the navbar
        const nav = document.querySelector('.app-navbar') || document.getElementById('app-nav');
        if (nav && nav.parentNode) {
            nav.parentNode.insertBefore(container, nav.nextSibling);
        } else {
            // Fallback: prepend to main
            const main = document.querySelector('main');
            if (main) {
                main.insertBefore(container, main.firstChild);
            }
        }
    }

    // Fetch profiles
    let profiles = [];
    try {
        const { profiles: fetched } = await apiFetch('/profiles');
        profiles = fetched;
    } catch (err) {
        console.error('Failed to load profiles for filter:', err);
        return { destroy: () => {} };
    }

    // Selection state
    let selectedProfileIds = null; // null = active profile only, 'all' = all, array = specific profiles

    // Get active profile ID from token
    const token = localStorage.getItem('accessToken');
    let activeProfileId = null;
    if (token) {
        try {
            const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
            activeProfileId = payload.profile_id;
        } catch (e) {
            // ignore
        }
    }

    // Render filter bar
    function render() {
        const chips = [];

        // "All profiles" chip
        const isAllSelected = selectedProfileIds === 'all';
        chips.push(`
            <button type="button" class="profile-filter-chip${isAllSelected ? ' active' : ''}" data-profile-id="all">
                <span class="profile-filter-chip-dot" style="background: var(--color-primary);"></span>
                <span>All profiles</span>
            </button>
        `);

        // Individual profile chips
        for (const profile of profiles) {
            const isActive = profile.id === activeProfileId;
            const isSelected = selectedProfileIds === 'all' ||
                (Array.isArray(selectedProfileIds) && selectedProfileIds.includes(profile.id)) ||
                (selectedProfileIds === null && isActive);

            const dotColor = profile.color || '#6B7280';
            chips.push(`
                <button type="button" class="profile-filter-chip${isSelected ? ' active' : ''}${isActive ? ' active-profile' : ''}" data-profile-id="${profile.id}">
                    <span class="profile-filter-chip-dot" style="background: ${dotColor};"></span>
                    <span>${escapeHtml(profile.name)}${isActive ? ' <span class="profile-filter-active-badge">(active)</span>' : ''}</span>
                </button>
            `);
        }

        container.innerHTML = `
            <div class="profile-filter-bar" role="group" aria-label="Filter by profile">
                ${chips.join('')}
            </div>
        `;

        // Wire up click handlers
        container.querySelectorAll('.profile-filter-chip').forEach(chip => {
            chip.addEventListener('click', () => handleChipClick(chip.dataset.profileId));
        });
    }

    function handleChipClick(profileId) {
        if (profileId === 'all') {
            selectedProfileIds = selectedProfileIds === 'all' ? null : 'all';
        } else {
            if (selectedProfileIds === 'all') {
                selectedProfileIds = [profileId];
            } else if (selectedProfileIds === null) {
                selectedProfileIds = [profileId];
            } else if (Array.isArray(selectedProfileIds)) {
                const idx = selectedProfileIds.indexOf(profileId);
                if (idx === -1) {
                    selectedProfileIds.push(profileId);
                } else {
                    selectedProfileIds.splice(idx, 1);
                    if (selectedProfileIds.length === 0) {
                        selectedProfileIds = null;
                    }
                }
            }
        }

        render();
        onChange(selectedProfileIds);
    }

    // Initial render
    render();

    // Return cleanup function
    return {
        destroy() {
            container.innerHTML = '';
        },
        getSelectedProfileIds() {
            return selectedProfileIds;
        },
        setSelectedProfileIds(ids) {
            selectedProfileIds = ids;
            render();
        },
    };
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}