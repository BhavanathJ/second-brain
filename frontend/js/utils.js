export function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}

// Shared profile-badge markup. Was independently reimplemented (byte-
// identical) in calendar.js, reminders.js, dashboard.js, bin.js,
// habits.js, and notes.js, with tasks.js inlining the same markup with
// no named function at all. Each page still decides FOR ITSELF whether
// a badge should show at all (that "should I show badges on this page"
// logic legitimately differs by page — see the per-page wrapper), but
// once a page decides yes, this is the one place that knows what a
// badge actually looks like.
export function renderProfileBadge(profile) {
    if (!profile) return '';
    return `
        <span class="bin-badge" style="border-color: ${profile.color}; color: ${profile.color};">
            <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${profile.color};margin-right:0.3rem;"></span>
            ${escapeHtml(profile.name)}
        </span>
    `;
}

/**
 * Determines whether profile badges should be displayed for records.
 * Badges are displayed when:
 * 1. The active filter includes multiple profiles (e.g. 'all' when user has >1 profile, or an array with >1 profile IDs).
 * 2. OR the items currently displayed span >1 profile.
 *
 * @param {string|Array|null} profileFilter - Current profile filter ('all', array of IDs, comma-separated string, or null).
 * @param {Array} profiles - List of available profiles for the user.
 * @param {Array} itemProfileIds - Array of profile IDs from displayed items.
 * @returns {boolean} Whether profile badges should be shown.
 */
export function shouldShowProfileBadge(profileFilter, profiles = [], itemProfileIds = []) {
    // If the filter includes multiple profiles
    if (profileFilter === 'all' && (profiles?.length ?? 0) > 1) {
        return true;
    }
    if (Array.isArray(profileFilter) && profileFilter.length > 1) {
        return true;
    }
    if (typeof profileFilter === 'string' && profileFilter !== 'all' && profileFilter.split(',').filter(Boolean).length > 1) {
        return true;
    }
    // If the displayed items themselves span multiple profiles
    const distinctItemProfiles = new Set(itemProfileIds.filter(Boolean));
    return distinctItemProfiles.size > 1;
}

