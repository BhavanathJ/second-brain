import { escapeHtml } from './utils.js';

export function getActiveProfileId() {
    const token = localStorage.getItem('accessToken');
    if (!token) return null;
    try {
        const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        return payload.profile_id;
    } catch (e) {
        return null;
    }
}

export function renderProfileTargetSelect(profilesCache, defaultProfileId) {
    if (!profilesCache || profilesCache.length === 0) return '';

    let optionsHtml = '';
    let defaultProfile = profilesCache.find(p => p.id === defaultProfileId) || profilesCache[0];

    for (const p of profilesCache) {
        const color = p.color || '#6B7280';
        optionsHtml += `
            <li><a class="dropdown-item profile-target-option d-flex align-items-center" href="#" data-profile-id="${escapeHtml(p.id)}" style="color: var(--sb-ink); font-family: var(--sb-font-body); font-weight: 500; font-size: 0.9rem; padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--sb-border-light);" onmouseover="this.style.backgroundColor='var(--sb-surface-alt)'" onmouseout="this.style.backgroundColor='transparent'">
                <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background-color:${color}; margin-right:8px; border: 1px solid var(--sb-border);"></span>
                ${escapeHtml(p.name)}
            </a></li>
        `;
    }

    const defaultColor = defaultProfile.color || '#6B7280';

    return `
        <div class="mb-3 profile-target-group">
            <label class="form-label">Add to profile</label>
            <div class="dropdown">
                <button class="form-select text-start d-flex align-items-center" type="button" data-bs-toggle="dropdown" aria-expanded="false" style="cursor: pointer;">
                    <span class="selected-color-dot" style="display:inline-block; width:10px; height:10px; border-radius:50%; background-color:${defaultColor}; margin-right:8px; border: 1px solid var(--sb-border);"></span>
                    <span class="selected-profile-name">${escapeHtml(defaultProfile.name)}</span>
                </button>
                <ul class="dropdown-menu w-100" style="background-color: var(--sb-surface); border: var(--sb-border-width) solid var(--sb-border); border-radius: var(--sb-radius-sm); box-shadow: var(--sb-shadow-sm); padding: 0; margin-top: 4px; overflow: hidden;">
                    ${optionsHtml}
                </ul>
            </div>
            <input type="hidden" name="profile_id" id="target_profile_id" value="${escapeHtml(defaultProfile.id)}" />
        </div>
    `;
}

export function bindProfileTargetSelect(containerEl) {
    if (!containerEl) return;
    const items = containerEl.querySelectorAll('.profile-target-option');
    if (!items.length) return;
    
    const hiddenInput = containerEl.querySelector('#target_profile_id');
    const colorDot = containerEl.querySelector('.selected-color-dot');
    const nameSpan = containerEl.querySelector('.selected-profile-name');

    items.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const id = item.dataset.profileId;
            const dot = item.querySelector('span').style.backgroundColor;
            const name = item.textContent.trim();
            
            hiddenInput.value = id;
            colorDot.style.backgroundColor = dot;
            nameSpan.textContent = name;
        });
    });
}

export function getProfileTargetPayload(formEl, profilesCache, defaultProfileId) {
    const input = formEl.querySelector('#target_profile_id');
    if (!input) {
        return { payload: {}, targetName: null, isDifferent: false };
    }

    const targetId = input.value;
    const profile = profilesCache.find(p => p.id === targetId);
    
    return {
        payload: { target_profile_id: targetId },
        targetName: profile ? profile.name : null,
        isDifferent: targetId !== defaultProfileId
    };
}
