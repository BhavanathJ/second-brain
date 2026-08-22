import { apiFetch } from './api.js';
import { showToast } from './toast.js';

export const AI_PROVIDERS = {
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

let overlayMounted = false;
let isDrawerOpen = false;
let isSettingsOpen = false;
let isSending = false;
let contextCounts = null;

function loadConfig() {
    try {
        const saved = localStorage.getItem('sb_ai_config');
        return saved ? JSON.parse(saved) : null;
    } catch {
        return null;
    }
}

function saveConfig(cfg) {
    localStorage.setItem('sb_ai_config', JSON.stringify(cfg));
}

function loadHistory() {
    try {
        const saved = localStorage.getItem('sb_ai_history');
        return saved ? JSON.parse(saved) : [];
    } catch {
        return [];
    }
}

function saveHistory(messages) {
    localStorage.setItem('sb_ai_history', JSON.stringify(messages.slice(-50)));
}

/**
 * Basic markdown parser for chat bubbles
 */
function renderMarkdown(text) {
    if (!text) return '';
    let safe = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // Code blocks
    safe = safe.replace(/```([a-zA-Z0-9]*)\n([\s\S]*?)```/g, (_, lang, code) => {
        return `<pre class="ai-code-block"><code>${code.trim()}</code></pre>`;
    });

    // Inline code
    safe = safe.replace(/`([^`]+)`/g, '<code class="ai-inline-code">$1</code>');

    // Bold & Italic
    safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    safe = safe.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Headers
    safe = safe.replace(/^### (.*$)/gim, '<div class="ai-md-h3">$1</div>');
    safe = safe.replace(/^## (.*$)/gim, '<div class="ai-md-h2">$1</div>');
    safe = safe.replace(/^# (.*$)/gim, '<div class="ai-md-h1">$1</div>');

    // Bullet lists
    safe = safe.replace(/^\s*[-*]\s+(.*)$/gim, '<li class="ai-list-item">$1</li>');
    safe = safe.replace(/(<li class="ai-list-item">.*<\/li>)/gims, '<ul class="ai-list">$1</ul>');

    // Line breaks
    safe = safe.replace(/\n{2,}/g, '<div class="ai-paragraph-break"></div>');
    safe = safe.replace(/\n/g, '<br />');

    return safe;
}

/**
 * Dynamically fetches and renders models from the endpoint into the drawer select
 */
async function fetchAndRenderDrawerModels(providerKey, endpointUrl, authType, apiKey, selectedModelId = null) {
    const modelSelect = document.getElementById('aiModelSelect');
    const customWrap = document.getElementById('aiCustomModelWrap');
    const customInput = document.getElementById('aiCustomModelInput');
    const fetchBtn = document.getElementById('aiDrawerFetchModelsBtn');

    if (!modelSelect) return;

    if (!providerKey) {
        modelSelect.innerHTML = '<option value="" disabled selected>-- Select Provider First --</option>';
        customWrap?.classList.add('d-none');
        return;
    }

    if (fetchBtn) {
        fetchBtn.disabled = true;
        fetchBtn.textContent = '⏳';
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

        const models = res.models || [];
        modelSelect.innerHTML = '';

        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.disabled = true;
        placeholder.textContent = `-- Select Model (${models.length} live) --`;
        if (!selectedModelId) placeholder.selected = true;
        modelSelect.appendChild(placeholder);

        let matchFound = false;
        models.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.name !== m.id ? `${m.name} (${m.id})` : m.id;
            if (selectedModelId && selectedModelId === m.id) {
                opt.selected = true;
                matchFound = true;
            }
            modelSelect.appendChild(opt);
        });

        const customOpt = document.createElement('option');
        customOpt.value = 'custom_manual';
        customOpt.textContent = '✍️ Other / Custom Model ID...';
        if (selectedModelId && !matchFound) {
            customOpt.selected = true;
            if (customInput) customInput.value = selectedModelId;
            customWrap?.classList.remove('d-none');
        } else {
            customWrap?.classList.add('d-none');
        }
        modelSelect.appendChild(customOpt);
    } catch (err) {
        modelSelect.innerHTML = `
            <option value="" disabled selected>-- Could not load models (${err.message}) --</option>
            <option value="custom_manual">✍️ Enter Model ID Manually...</option>
        `;
        if (selectedModelId) {
            if (customInput) customInput.value = selectedModelId;
            customWrap?.classList.remove('d-none');
        }
    } finally {
        if (fetchBtn) {
            fetchBtn.disabled = false;
            fetchBtn.textContent = '🔄';
        }
    }
}

/**
 * Creates and injects the overlay markup into body
 */
function createOverlayElements() {
    if (overlayMounted) return;
    overlayMounted = true;

    const root = document.createElement('div');
    root.id = 'aiOverlayRoot';
    root.innerHTML = `
        <!-- Floating Action Button -->
        <button id="aiOverlayToggleBtn" class="ai-fab-btn" title="Open Second Brain AI Assistant">
            <span class="ai-fab-icon">🧠</span>
            <span class="ai-fab-label">AI Assistant</span>
            <span class="ai-beta-tag">BETA</span>
        </button>

        <!-- Slide-out Backdrop -->
        <div id="aiOverlayBackdrop" class="ai-backdrop"></div>

        <!-- Slide-out Drawer Panel -->
        <aside id="aiOverlayDrawer" class="ai-drawer" aria-label="AI Chat Panel">
            <!-- Header -->
            <header class="ai-drawer-header">
                <div class="d-flex align-items-center gap-2">
                    <span class="ai-header-badge">🧠</span>
                    <div>
                        <div class="ai-header-title d-flex align-items-center gap-1">Second Brain <span>AI</span> <span class="ai-beta-tag">BETA</span></div>
                        <div class="ai-provider-indicator" id="aiProviderIndicator">Not Configured</div>
                    </div>
                </div>
                <div class="d-flex align-items-center gap-1">
                    <button type="button" id="aiSettingsToggleBtn" class="ai-icon-btn" title="AI Provider Settings">⚙️</button>
                    <button type="button" id="aiClearHistoryBtn" class="ai-icon-btn" title="Clear Chat History">🗑️</button>
                    <button type="button" id="aiDrawerCloseBtn" class="ai-icon-btn" title="Close Panel">✖</button>
                </div>
            </header>

            <!-- Context Ribbon -->
            <section class="ai-context-ribbon">
                <div class="d-flex justify-content-between align-items-center w-100">
                    <div class="ai-context-stats" id="aiContextStats">
                        <span class="ai-context-dot"></span> Loading context...
                    </div>
                    <label class="ai-context-switch" title="Attach active tasks, habits, and notes">
                        <input type="checkbox" id="aiContextToggle" checked />
                        <span class="ai-switch-label">Live Context</span>
                    </label>
                </div>
            </section>

            <!-- Settings View (Collapsible) -->
            <div id="aiSettingsPanel" class="ai-settings-panel d-none">
                <div class="ai-settings-header">
                    <span class="fw-bold text-uppercase" style="font-size: 0.82rem;">LLM Provider Settings</span>
                    <button type="button" id="aiSettingsCloseBtn" class="btn-close btn-close-sm"></button>
                </div>
                
                <div class="p-3">
                    <div class="mb-2">
                        <div class="d-flex justify-content-between align-items-center mb-1">
                            <label class="form-label mb-0" for="aiPresetSelect">Provider</label>
                            <a href="../pages/settings.html#aiSettingsCard" class="text-decoration-none" style="font-size: 0.72rem; font-weight: 700;">Full Settings ↗</a>
                        </div>
                        <select id="aiPresetSelect" class="form-select form-select-sm">
                            <option value="" disabled selected>-- Select Provider --</option>
                            <option value="gemini">Google Gemini</option>
                            <option value="claude">Anthropic Claude</option>
                            <option value="grok">xAI (Grok)</option>
                            <option value="groq">Groq (Ultra-Fast)</option>
                            <option value="custom">Custom Endpoint</option>
                        </select>
                    </div>

                    <div class="mb-2">
                        <div class="d-flex justify-content-between align-items-center mb-1">
                            <label class="form-label mb-0" for="aiModelSelect">Model (Live from Endpoint)</label>
                            <button type="button" id="aiDrawerFetchModelsBtn" class="btn btn-outline-secondary btn-sm py-0 px-2" style="font-size: 0.72rem;" title="Fetch Live Models">🔄 Fetch</button>
                        </div>
                        <select id="aiModelSelect" class="form-select form-select-sm">
                            <option value="" disabled selected>-- Select Provider First --</option>
                        </select>
                        <div id="aiCustomModelWrap" class="mt-1 d-none">
                            <input type="text" id="aiCustomModelInput" class="form-control form-control-sm" placeholder="Custom model identifier" />
                        </div>
                    </div>

                    <div class="mb-2">
                        <label class="form-label" for="aiEndpointUrl">Base Endpoint URL</label>
                        <input type="url" id="aiEndpointUrl" class="form-control form-control-sm" placeholder="https://generativelanguage.googleapis.com/v1beta/openai" />
                    </div>

                    <div class="row g-2 mb-2">
                        <div class="col-6">
                            <label class="form-label" for="aiAuthType">Auth Type</label>
                            <select id="aiAuthType" class="form-select form-select-sm">
                                <option value="bearer">Bearer Token</option>
                                <option value="api-key">API Key Header</option>
                                <option value="none">None (Local)</option>
                            </select>
                        </div>
                        <div class="col-6">
                            <label class="form-label" for="aiApiKey">API Key / Token</label>
                            <div class="input-group input-group-sm">
                                <input type="password" id="aiApiKey" class="form-control" placeholder="API Key" autocomplete="off" />
                                <button type="button" class="btn btn-outline-secondary" id="aiToggleKeyBtn">Show</button>
                            </div>
                        </div>
                    </div>

                    <div class="d-flex gap-2">
                        <button type="button" id="aiTestConnectionBtn" class="btn btn-outline-primary btn-sm flex-fill">🔌 Test Connection</button>
                        <button type="button" id="aiSaveSettingsBtn" class="btn btn-primary btn-sm flex-fill">💾 Save</button>
                    </div>
                    <div id="aiTestResultMsg" class="ai-test-status mt-2"></div>
                </div>
            </div>

            <!-- Quick Action Chips -->
            <div class="ai-quick-prompts">
                <button type="button" class="ai-chip" data-prompt="Plan my day based on my urgent tasks and habits.">📋 Plan Today</button>
                <button type="button" class="ai-chip" data-prompt="Review my Eisenhower tasks and tell me what to do first.">🎯 Prioritize Tasks</button>
                <button type="button" class="ai-chip" data-prompt="Check my habit streaks and give me tips to keep up.">⚡ Habits Check</button>
                <button type="button" class="ai-chip" data-prompt="Summarize my notes and suggest new action items.">💡 Convert Notes</button>
            </div>

            <!-- Chat Messages Scroll Area -->
            <div class="ai-messages-container" id="aiMessagesContainer">
                <div class="ai-welcome-box">
                    <div class="ai-welcome-icon">🧠</div>
                    <div class="fw-bold mb-1" style="font-family: var(--sb-font-heading);">Welcome to Second Brain AI</div>
                    <div class="text-muted" style="font-size: 0.82rem;">
                        I have full visibility into your active Eisenhower tasks, habit streaks, notes, and calendar events. Ask me to plan your day or brainstorm!
                    </div>
                </div>
            </div>

            <!-- Input Bar -->
            <footer class="ai-input-bar">
                <form id="aiChatForm" class="d-flex flex-column gap-2 w-100">
                    <div class="position-relative">
                        <textarea id="aiMessageInput" class="form-control ai-textarea" rows="2" placeholder="Ask anything about your tasks, habits, or schedule... (Ctrl+Enter to send)"></textarea>
                    </div>
                    <div class="d-flex justify-content-between align-items-center">
                        <span class="ai-shortcut-hint">Ctrl + Enter</span>
                        <button type="submit" id="aiSendBtn" class="btn btn-primary btn-sm px-3">
                            <span>Send</span> ⚡
                        </button>
                    </div>
                </form>
            </footer>
        </aside>
    `;

    document.body.appendChild(root);
    setupEventListeners();
    applyConfigToUI();
    renderChatHistory();
    refreshContextStats();
}

/**
 * Updates header provider label and settings inputs
 */
function applyConfigToUI() {
    const cfg = loadConfig();
    const indicator = document.getElementById('aiProviderIndicator');
    const presetSelect = document.getElementById('aiPresetSelect');
    const endpointInput = document.getElementById('aiEndpointUrl');
    const authTypeSelect = document.getElementById('aiAuthType');
    const apiKeyInput = document.getElementById('aiApiKey');
    const contextToggle = document.getElementById('aiContextToggle');

    if (!cfg || !cfg.preset || !AI_PROVIDERS[cfg.preset]) {
        if (indicator) indicator.textContent = 'Not Configured (Click ⚙️)';
        if (presetSelect) presetSelect.value = '';
        return;
    }

    const provider = AI_PROVIDERS[cfg.preset];
    if (indicator) {
        indicator.textContent = `${provider.name} · ${cfg.modelName || 'No model'}`;
    }

    if (presetSelect) presetSelect.value = cfg.preset;
    if (endpointInput) endpointInput.value = cfg.endpointUrl || provider.endpointUrl;
    if (authTypeSelect) authTypeSelect.value = cfg.authType || provider.authType;
    if (apiKeyInput) apiKeyInput.value = cfg.apiKey || '';
    if (contextToggle) contextToggle.checked = cfg.includeContext !== false;

    // Fetch live models from endpoint
    fetchAndRenderDrawerModels(cfg.preset, endpointInput.value, authTypeSelect.value, apiKeyInput.value, cfg.modelName);
}

/**
 * Refreshes snapshot of profile tasks, habits, notes
 */
async function refreshContextStats() {
    const statsEl = document.getElementById('aiContextStats');
    if (!statsEl) return;

    try {
        const data = await apiFetch('/ai/context');
        contextCounts = data.counts;
        statsEl.innerHTML = `<span class="ai-context-dot active"></span> Context: <strong>${data.counts.pendingTasks}</strong> tasks · <strong>${data.counts.habits}</strong> habits · <strong>${data.counts.notes}</strong> notes`;
    } catch {
        statsEl.innerHTML = `<span class="ai-context-dot"></span> Context ready`;
    }
}

/**
 * Opens or closes drawer
 */
function toggleDrawer(open) {
    isDrawerOpen = typeof open === 'boolean' ? open : !isDrawerOpen;
    const drawer = document.getElementById('aiOverlayDrawer');
    const backdrop = document.getElementById('aiOverlayBackdrop');
    const fab = document.getElementById('aiOverlayToggleBtn');

    if (!drawer) return;

    if (isDrawerOpen) {
        drawer.classList.add('open');
        backdrop?.classList.add('visible');
        fab?.classList.add('active');
        applyConfigToUI();
        refreshContextStats();
        setTimeout(() => document.getElementById('aiMessageInput')?.focus(), 150);
    } else {
        drawer.classList.remove('open');
        backdrop?.classList.remove('visible');
        fab?.classList.remove('active');
    }
}

function toggleSettings(open) {
    isSettingsOpen = typeof open === 'boolean' ? open : !isSettingsOpen;
    const panel = document.getElementById('aiSettingsPanel');
    if (!panel) return;
    panel.classList.toggle('d-none', !isSettingsOpen);
}

/**
 * Appends message to chat UI
 */
function appendMessage(role, content, persist = true) {
    const container = document.getElementById('aiMessagesContainer');
    if (!container) return;

    const bubble = document.createElement('div');
    bubble.className = `ai-message-bubble ai-message-${role}`;
    bubble.innerHTML = `
        <div class="ai-message-header">
            <span class="ai-message-author">${role === 'user' ? 'You' : 'Second Brain AI'}</span>
            <span class="ai-message-time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div class="ai-message-body">${role === 'user' ? content.replace(/</g, '&lt;').replace(/\n/g, '<br>') : renderMarkdown(content)}</div>
    `;

    container.appendChild(bubble);
    container.scrollTop = container.scrollHeight;

    if (persist) {
        const history = loadHistory();
        history.push({ role, content, timestamp: Date.now() });
        saveHistory(history);
    }
}

function renderChatHistory() {
    const container = document.getElementById('aiMessagesContainer');
    if (!container) return;

    const history = loadHistory();
    if (history.length === 0) return;

    const welcome = container.querySelector('.ai-welcome-box');
    if (welcome) welcome.remove();

    history.forEach(m => {
        appendMessage(m.role, m.content, false);
    });
}

/**
 * Sends a chat message to backend proxy
 */
async function handleSendMessage(userText) {
    const text = (userText || document.getElementById('aiMessageInput')?.value || '').trim();
    if (!text || isSending) return;

    const cfg = loadConfig();
    if (!cfg || !cfg.preset || !cfg.modelName) {
        toggleSettings(true);
        showToast('Please select a Provider & Model in Settings first.', 'warning');
        return;
    }

    const input = document.getElementById('aiMessageInput');
    if (input) input.value = '';

    const welcome = document.querySelector('.ai-welcome-box');
    if (welcome) welcome.remove();

    appendMessage('user', text, true);

    const history = loadHistory();
    const messages = history.map(h => ({
        role: h.role === 'user' ? 'user' : 'assistant',
        content: h.content
    }));

    isSending = true;
    const sendBtn = document.getElementById('aiSendBtn');
    if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.innerHTML = `<span>Thinking...</span> ⏳`;
    }

    const container = document.getElementById('aiMessagesContainer');
    const typingBubble = document.createElement('div');
    typingBubble.className = 'ai-message-bubble ai-message-assistant ai-typing';
    typingBubble.id = 'aiTypingBubble';
    typingBubble.innerHTML = `
        <div class="ai-typing-indicator">
            <span></span><span></span><span></span>
        </div>
    `;
    container.appendChild(typingBubble);
    container.scrollTop = container.scrollHeight;

    try {
        const response = await apiFetch('/ai/chat', {
            method: 'POST',
            body: JSON.stringify({
                messages,
                providerConfig: cfg,
                includeContext: cfg.includeContext !== false
            })
        });

        typingBubble.remove();
        appendMessage('assistant', response.reply || 'No response generated.', true);
    } catch (err) {
        typingBubble.remove();
        appendMessage('assistant', `⚠️ **Error reaching LLM Provider:** ${err.message}\n\n*Check your endpoint URL or API key in Settings (⚙️).*`, true);
    } finally {
        isSending = false;
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.innerHTML = `<span>Send</span> ⚡`;
        }
    }
}

/**
 * Wires up form and click listeners
 */
function setupEventListeners() {
    document.getElementById('aiOverlayToggleBtn')?.addEventListener('click', () => toggleDrawer());
    document.getElementById('aiDrawerCloseBtn')?.addEventListener('click', () => toggleDrawer(false));
    document.getElementById('aiOverlayBackdrop')?.addEventListener('click', () => toggleDrawer(false));

    document.getElementById('aiSettingsToggleBtn')?.addEventListener('click', () => toggleSettings());
    document.getElementById('aiSettingsCloseBtn')?.addEventListener('click', () => toggleSettings(false));

    document.getElementById('aiClearHistoryBtn')?.addEventListener('click', () => {
        localStorage.removeItem('sb_ai_history');
        const container = document.getElementById('aiMessagesContainer');
        if (container) {
            container.innerHTML = `
                <div class="ai-welcome-box">
                    <div class="ai-welcome-icon">🧠</div>
                    <div class="fw-bold mb-1" style="font-family: var(--sb-font-heading);">Chat Cleared</div>
                    <div class="text-muted" style="font-size: 0.82rem;">Ask anything to start a fresh conversation!</div>
                </div>
            `;
        }
        showToast('Chat history cleared', 'info');
    });

    // Preset selector changes
    document.getElementById('aiPresetSelect')?.addEventListener('change', (e) => {
        const key = e.target.value;
        const provider = AI_PROVIDERS[key] || AI_PROVIDERS.custom;
        const endpointInput = document.getElementById('aiEndpointUrl');
        const authTypeSelect = document.getElementById('aiAuthType');
        const apiKeyInput = document.getElementById('aiApiKey');

        if (endpointInput) endpointInput.value = provider.endpointUrl;
        if (authTypeSelect) authTypeSelect.value = provider.authType;
        if (apiKeyInput) apiKeyInput.placeholder = provider.placeholderKey;

        // Fetch live models from endpoint
        fetchAndRenderDrawerModels(key, provider.endpointUrl, provider.authType, apiKeyInput.value, null);
    });

    // Fetch models button in drawer
    document.getElementById('aiDrawerFetchModelsBtn')?.addEventListener('click', () => {
        const key = document.getElementById('aiPresetSelect')?.value;
        const endpoint = document.getElementById('aiEndpointUrl')?.value;
        const authType = document.getElementById('aiAuthType')?.value;
        const apiKey = document.getElementById('aiApiKey')?.value;
        const model = document.getElementById('aiModelSelect')?.value;
        if (!key) {
            showToast('Please select a provider first.', 'warning');
            return;
        }
        fetchAndRenderDrawerModels(key, endpoint, authType, apiKey, model);
    });

    // Model select changes
    document.getElementById('aiModelSelect')?.addEventListener('change', (e) => {
        const customWrap = document.getElementById('aiCustomModelWrap');
        const customInput = document.getElementById('aiCustomModelInput');
        if (e.target.value === 'custom_manual') {
            customWrap?.classList.remove('d-none');
            customInput?.focus();
        } else {
            customWrap?.classList.add('d-none');
        }
    });

    // Toggle API Key visibility
    document.getElementById('aiToggleKeyBtn')?.addEventListener('click', () => {
        const keyInput = document.getElementById('aiApiKey');
        const btn = document.getElementById('aiToggleKeyBtn');
        if (!keyInput || !btn) return;
        const isHidden = keyInput.type === 'password';
        keyInput.type = isHidden ? 'text' : 'password';
        btn.textContent = isHidden ? 'Hide' : 'Show';
    });

    // Save Settings
    document.getElementById('aiSaveSettingsBtn')?.addEventListener('click', () => {
        const preset = document.getElementById('aiPresetSelect')?.value;
        if (!preset) {
            showToast('Please select an AI Provider first.', 'warning');
            return;
        }

        const modelSelect = document.getElementById('aiModelSelect');
        const customInput = document.getElementById('aiCustomModelInput');
        let modelName = modelSelect?.value || '';

        if (!modelName) {
            showToast('Please select a model from the list.', 'warning');
            return;
        }
        if (modelName === 'custom_manual') {
            modelName = customInput?.value.trim() || '';
            if (!modelName) {
                showToast('Please enter your custom model identifier.', 'warning');
                return;
            }
        }

        const endpointUrl = document.getElementById('aiEndpointUrl')?.value.trim() || '';
        const authType = document.getElementById('aiAuthType')?.value || 'bearer';
        const apiKey = document.getElementById('aiApiKey')?.value.trim() || '';
        const includeContext = document.getElementById('aiContextToggle')?.checked ?? true;

        const newConfig = {
            preset,
            providerKey: preset,
            endpointUrl,
            modelName,
            authType,
            apiKey,
            temperature: 0.7,
            includeContext
        };

        saveConfig(newConfig);
        applyConfigToUI();
        toggleSettings(false);
        showToast('AI Provider settings saved', 'success');
    });

    // Test Connection
    document.getElementById('aiTestConnectionBtn')?.addEventListener('click', async () => {
        const preset = document.getElementById('aiPresetSelect')?.value;
        if (!preset) {
            showToast('Please select a Provider first.', 'warning');
            return;
        }

        const btn = document.getElementById('aiTestConnectionBtn');
        const statusEl = document.getElementById('aiTestResultMsg');
        if (!btn || !statusEl) return;

        btn.disabled = true;
        btn.textContent = 'Testing...';
        statusEl.className = 'ai-test-status mt-2 d-block';
        statusEl.textContent = 'Contacting model endpoint...';

        const modelSelect = document.getElementById('aiModelSelect');
        let modelName = modelSelect?.value;
        if (modelName === 'custom_manual') {
            modelName = document.getElementById('aiCustomModelInput')?.value.trim();
        }

        const testConfig = {
            preset,
            providerKey: preset,
            endpointUrl: document.getElementById('aiEndpointUrl')?.value.trim(),
            modelName,
            authType: document.getElementById('aiAuthType')?.value,
            apiKey: document.getElementById('aiApiKey')?.value.trim()
        };

        try {
            const result = await apiFetch('/ai/test', {
                method: 'POST',
                body: JSON.stringify({ providerConfig: testConfig })
            });

            if (result.ok) {
                statusEl.className = 'ai-test-status mt-2 d-block text-success fw-bold';
                statusEl.textContent = `✓ ${result.message}`;
            } else {
                statusEl.className = 'ai-test-status mt-2 d-block text-danger fw-bold';
                statusEl.textContent = `✗ Connection failed: ${result.error}`;
            }
        } catch (err) {
            statusEl.className = 'ai-test-status mt-2 d-block text-danger fw-bold';
            statusEl.textContent = `✗ Error: ${err.message}`;
        } finally {
            btn.disabled = false;
            btn.textContent = '🔌 Test Connection';
        }
    });

    // Context toggle direct save
    document.getElementById('aiContextToggle')?.addEventListener('change', (e) => {
        const cfg = loadConfig() || {};
        cfg.includeContext = e.target.checked;
        saveConfig(cfg);
    });

    // Quick action chips
    document.querySelectorAll('.ai-chip').forEach(btn => {
        btn.addEventListener('click', () => {
            const prompt = btn.dataset.prompt;
            if (prompt) handleSendMessage(prompt);
        });
    });

    // Chat submit
    document.getElementById('aiChatForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        handleSendMessage();
    });

    // Auto-expand textarea & Ctrl+Enter shortcut
    const textarea = document.getElementById('aiMessageInput');
    if (textarea) {
        textarea.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                handleSendMessage();
            }
        });
    }

    // Escape to close
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isDrawerOpen) {
            toggleDrawer(false);
        }
    });
}

/**
 * Public initialization function called on every page
 */
export function initAiOverlay() {
    createOverlayElements();
}
