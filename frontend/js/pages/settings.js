import { initLayout } from '../layout.js';
import { apiFetch } from '../api.js';
import { showToast } from '../toast.js';

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}

function populateTimezoneSelect(currentTimezone) {
    const select = document.getElementById('timezoneSelect');
    const zones = Intl.supportedValuesOf('timeZone');
    select.innerHTML = zones
        .map(z => `<option value="${z}"${z === currentTimezone ? ' selected' : ''}>${z}</option>`)
        .join('');
}

async function loadSettings() {
    const { settings } = await apiFetch('/settings');
    populateTimezoneSelect(settings.timezone);
    document.getElementById('weekStartSelect').value = String(settings.week_starts_on);
}

async function loadProfiles(currentProfileId) {
    const { profiles } = await apiFetch('/profiles');
    const mount = document.getElementById('profilesList');
    mount.innerHTML = profiles.map(p => `
    <div class="profile-list-item">
      <span>${escapeHtml(p.name)}</span>
      ${p.id === currentProfileId ? '<span class="text-muted">Active</span>' : ''}
    </div>
  `).join('');
}

async function handleSubmit(e) {
    e.preventDefault();
    const payload = {
        timezone: document.getElementById('timezoneSelect').value,
        week_starts_on: Number(document.getElementById('weekStartSelect').value),
    };

    try {
        await apiFetch('/settings', { method: 'PATCH', body: JSON.stringify(payload) });

        document.documentElement.setAttribute('data-theme', 'light');
        localStorage.setItem('theme', 'light');

        const msg = document.getElementById('saveMsg');
        msg.classList.add('visible');
        setTimeout(() => msg.classList.remove('visible'), 2000);
    } catch (err) {
        showToast('Failed to save settings: ' + err.message);
    }
}

async function handleAddProfile(e) {
    e.preventDefault();
    const nameInput = document.getElementById('newProfileName');
    const name = nameInput.value.trim();
    if (!name) return;

    try {
        await apiFetch('/profiles', { method: 'POST', body: JSON.stringify({ name }) });
        nameInput.value = '';
        window.location.reload();
    } catch (err) {
        showToast('Failed to create profile: ' + err.message);
    }
}

const AI_PROVIDERS = {
    gemini: {
        name: 'Google Gemini',
        endpointUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        authType: 'bearer',
        placeholderKey: 'AIzaSy...',
        hint: 'Official Google Gemini via OpenAI-compatible endpoint.'
    },
    claude: {
        name: 'Anthropic Claude',
        endpointUrl: 'https://api.anthropic.com/v1',
        authType: 'api-key',
        placeholderKey: 'sk-ant-api03-...',
        hint: 'Anthropic Messages API (/v1/messages).'
    },
    grok: {
        name: 'xAI (Grok)',
        endpointUrl: 'https://api.x.ai/v1',
        authType: 'bearer',
        placeholderKey: 'xai-...',
        hint: 'xAI Grok API (https://api.x.ai/v1).'
    },
    groq: {
        name: 'Groq',
        endpointUrl: 'https://api.groq.com/openai/v1',
        authType: 'bearer',
        placeholderKey: 'gsk_...',
        hint: 'Groq Ultra-Fast LPU Cloud (https://api.groq.com/openai/v1).'
    },
    custom: {
        name: 'Custom Endpoint',
        endpointUrl: '',
        authType: 'bearer',
        placeholderKey: 'API key or token',
        hint: 'Any custom OpenAI-compatible server, local LiteLLM, Ollama, or gateway.'
    }
};

function loadAiConfig() {
    try {
        const saved = localStorage.getItem('sb_ai_config');
        return saved ? JSON.parse(saved) : null;
    } catch {
        return null;
    }
}

function saveAiConfig(cfg) {
    localStorage.setItem('sb_ai_config', JSON.stringify(cfg));
}

let cachedModels = [];

async function fetchAndRenderModels(providerKey, endpointUrl, authType, apiKey, selectedModelId = null) {
    const modelSelect = document.getElementById('settingsAiModelSelect');
    const statusEl = document.getElementById('settingsAiModelStatus');
    const fetchBtn = document.getElementById('settingsFetchModelsBtn');
    const customWrap = document.getElementById('settingsCustomModelWrap');
    const customInput = document.getElementById('settingsCustomModelInput');

    if (!modelSelect) return;

    if (!providerKey) {
        modelSelect.innerHTML = '<option value="" disabled selected>-- Select a Provider First --</option>';
        if (statusEl) statusEl.textContent = '';
        customWrap?.classList.add('d-none');
        return;
    }

    if (fetchBtn) {
        fetchBtn.disabled = true;
        fetchBtn.textContent = '⏳ Loading...';
    }
    if (statusEl) {
        statusEl.className = 'form-text mt-1 text-muted';
        statusEl.textContent = 'Fetching available models from endpoint...';
    }

    const payload = {
        preset: providerKey,
        providerKey,
        endpointUrl: endpointUrl?.trim(),
        authType,
        apiKey: apiKey?.trim()
    };

    try {
        const res = await apiFetch('/ai/models', {
            method: 'POST',
            body: JSON.stringify({ providerConfig: payload })
        });

        cachedModels = res.models || [];
        modelSelect.innerHTML = '';

        // Placeholder
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.disabled = true;
        placeholder.textContent = `-- Select a Model (${cachedModels.length} available) --`;
        if (!selectedModelId) placeholder.selected = true;
        modelSelect.appendChild(placeholder);

        let matchFound = false;
        cachedModels.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.name !== m.id ? `${m.name} (${m.id})` : m.id;
            if (selectedModelId && selectedModelId === m.id) {
                opt.selected = true;
                matchFound = true;
            }
            modelSelect.appendChild(opt);
        });

        // Other / Custom option
        const customOpt = document.createElement('option');
        customOpt.value = 'custom_manual';
        customOpt.textContent = '✍️ Other / Enter Custom Model ID...';
        if (selectedModelId && !matchFound) {
            customOpt.selected = true;
            if (customInput) customInput.value = selectedModelId;
            customWrap?.classList.remove('d-none');
        } else {
            customWrap?.classList.add('d-none');
        }
        modelSelect.appendChild(customOpt);

        if (statusEl) {
            statusEl.className = 'form-text mt-1 text-success fw-bold';
            statusEl.textContent = `✓ Successfully loaded ${cachedModels.length} models from endpoint`;
        }
    } catch (err) {
        modelSelect.innerHTML = `
            <option value="" disabled selected>-- Could not load models (${err.message}) --</option>
            <option value="custom_manual">✍️ Enter Model Identifier Manually...</option>
        `;
        if (selectedModelId) {
            if (customInput) customInput.value = selectedModelId;
            customWrap?.classList.remove('d-none');
        }
        if (statusEl) {
            statusEl.className = 'form-text mt-1 text-danger';
            statusEl.textContent = `Endpoint error: ${err.message} (Enter model ID manually or check API key)`;
        }
    } finally {
        if (fetchBtn) {
            fetchBtn.disabled = false;
            fetchBtn.textContent = '🔄 Fetch Live Models';
        }
    }
}

function initAiSettingsForm() {
    const cfg = loadAiConfig();
    const providerSelect = document.getElementById('settingsAiProvider');
    const modelSelect = document.getElementById('settingsAiModelSelect');
    const customWrap = document.getElementById('settingsCustomModelWrap');
    const customInput = document.getElementById('settingsCustomModelInput');
    const endpointInput = document.getElementById('settingsAiEndpoint');
    const authTypeSelect = document.getElementById('settingsAiAuthType');
    const apiKeyInput = document.getElementById('settingsAiApiKey');
    const contextSwitch = document.getElementById('settingsAiContext');
    const hintEl = document.getElementById('settingsAiEndpointHint');
    const toggleKeyBtn = document.getElementById('settingsAiToggleKey');
    const testBtn = document.getElementById('settingsAiTestBtn');
    const fetchModelsBtn = document.getElementById('settingsFetchModelsBtn');
    const statusMsg = document.getElementById('settingsAiStatusMsg');
    const form = document.getElementById('aiProviderSettingsForm');

    if (!providerSelect) return;

    if (cfg && cfg.preset && AI_PROVIDERS[cfg.preset]) {
        providerSelect.value = cfg.preset;
        endpointInput.value = cfg.endpointUrl || AI_PROVIDERS[cfg.preset].endpointUrl;
        authTypeSelect.value = cfg.authType || AI_PROVIDERS[cfg.preset].authType;
        apiKeyInput.value = cfg.apiKey || '';
        contextSwitch.checked = cfg.includeContext !== false;
        if (hintEl) hintEl.textContent = AI_PROVIDERS[cfg.preset].hint;

        // Fetch live models on startup for saved provider
        fetchAndRenderModels(cfg.preset, endpointInput.value, authTypeSelect.value, apiKeyInput.value, cfg.modelName);
    } else {
        modelSelect.innerHTML = '<option value="" disabled selected>-- Select a Provider First --</option>';
    }

    // Provider dropdown changed
    providerSelect.addEventListener('change', (e) => {
        const key = e.target.value;
        const p = AI_PROVIDERS[key] || AI_PROVIDERS.custom;
        endpointInput.value = p.endpointUrl;
        authTypeSelect.value = p.authType;
        apiKeyInput.placeholder = p.placeholderKey;
        if (hintEl) hintEl.textContent = p.hint;

        // Automatically fetch live models for selected provider
        fetchAndRenderModels(key, p.endpointUrl, p.authType, apiKeyInput.value, null);
    });

    // Fetch Live Models Button click
    fetchModelsBtn?.addEventListener('click', () => {
        const providerKey = providerSelect.value;
        if (!providerKey) {
            showToast('Please select a provider first.', 'warning');
            return;
        }
        fetchAndRenderModels(providerKey, endpointInput.value, authTypeSelect.value, apiKeyInput.value, modelSelect.value);
    });

    // Model select changed
    modelSelect?.addEventListener('change', (e) => {
        if (e.target.value === 'custom_manual') {
            customWrap?.classList.remove('d-none');
            customInput?.focus();
        } else {
            customWrap?.classList.add('d-none');
        }
    });

    // Toggle API Key visibility
    toggleKeyBtn?.addEventListener('click', () => {
        const isHidden = apiKeyInput.type === 'password';
        apiKeyInput.type = isHidden ? 'text' : 'password';
        toggleKeyBtn.textContent = isHidden ? 'Hide' : 'Show';
    });

    // Save AI Form
    form?.addEventListener('submit', (e) => {
        e.preventDefault();
        const providerKey = providerSelect.value;
        if (!providerKey) {
            showToast('Please select an AI Provider first.', 'danger');
            return;
        }

        let modelValue = modelSelect.value;
        if (!modelValue) {
            showToast('Please select a model from the list.', 'danger');
            return;
        }
        if (modelValue === 'custom_manual') {
            modelValue = customInput.value.trim();
            if (!modelValue) {
                showToast('Please enter your custom model identifier.', 'danger');
                return;
            }
        }

        const updatedConfig = {
            preset: providerKey,
            providerKey,
            endpointUrl: endpointInput.value.trim(),
            modelName: modelValue,
            authType: authTypeSelect.value,
            apiKey: apiKeyInput.value.trim(),
            includeContext: contextSwitch.checked,
            temperature: 0.7
        };

        saveAiConfig(updatedConfig);
        showToast('AI Provider settings saved successfully!', 'success');
        statusMsg.className = 'ai-test-status mt-2 d-block text-success fw-bold';
        statusMsg.textContent = `✓ Saved: ${AI_PROVIDERS[providerKey]?.name} (${modelValue})`;
        setTimeout(() => statusMsg.style.display = 'none', 3500);
    });

    // Test connection
    testBtn?.addEventListener('click', async () => {
        const providerKey = providerSelect.value;
        if (!providerKey) {
            showToast('Please select a Provider first.', 'danger');
            return;
        }

        let modelValue = modelSelect.value;
        if (modelValue === 'custom_manual') {
            modelValue = customInput.value.trim();
        }

        testBtn.disabled = true;
        testBtn.textContent = 'Testing...';
        statusMsg.className = 'ai-test-status mt-2 d-block';
        statusMsg.textContent = 'Contacting provider endpoint...';
        statusMsg.style.display = 'block';

        const testPayload = {
            preset: providerKey,
            providerKey,
            endpointUrl: endpointInput.value.trim(),
            modelName: modelValue,
            authType: authTypeSelect.value,
            apiKey: apiKeyInput.value.trim()
        };

        try {
            const result = await apiFetch('/ai/test', {
                method: 'POST',
                body: JSON.stringify({ providerConfig: testPayload })
            });

            if (result.ok) {
                statusMsg.className = 'ai-test-status mt-2 d-block text-success fw-bold';
                statusMsg.textContent = `✓ ${result.message}`;
            } else {
                statusMsg.className = 'ai-test-status mt-2 d-block text-danger fw-bold';
                statusMsg.textContent = `✗ Connection error: ${result.error}`;
            }
        } catch (err) {
            statusMsg.className = 'ai-test-status mt-2 d-block text-danger fw-bold';
            statusMsg.textContent = `✗ Failed: ${err.message}`;
        } finally {
            testBtn.disabled = false;
            testBtn.textContent = '🔌 Test Connection';
        }
    });
}

async function main() {
    const layoutInfo = await initLayout('settings');
    if (!layoutInfo) return;

    document.getElementById('settingsForm').addEventListener('submit', handleSubmit);
    document.getElementById('addProfileForm').addEventListener('submit', handleAddProfile);

    initAiSettingsForm();

    try {
        await loadSettings();
        await loadProfiles(layoutInfo.profileId);
    } catch (err) {
        console.error('Failed to load settings:', err);
        document.querySelector('.settings-page').insertAdjacentHTML('beforeend',
            `<div class="alert alert-danger">Failed to load settings: ${escapeHtml(err.message)}</div>`);
    }
}

main();