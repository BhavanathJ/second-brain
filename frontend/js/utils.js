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
