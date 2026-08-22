const taskService = require('./taskService');
const habitService = require('./habitService');
const noteService = require('./noteService');
const reminderService = require('./reminderService');
const calendarEventService = require('./calendarEventService');
const settingsService = require('./settingsService');
const { getLocalDateString } = require('../utils/profileTime');

/**
 * Builds a structured markdown/text summary of the user's second brain
 * including tasks by quadrant, active habits & streaks, notes, reminders,
 * and upcoming events.
 */
async function buildProfileContext(profileId) {
    const settings = await settingsService.getSettings(profileId) || { timezone: 'UTC', week_starts_on: 0 };
    const tz = settings.timezone || 'UTC';
    const weekStartsOn = settings.week_starts_on ?? 0;
    const today = getLocalDateString(tz, new Date());

    const [tasks, habits, notes, reminders, events, logs] = await Promise.all([
        taskService.listTasks(profileId).catch(() => []),
        habitService.listHabits(profileId).catch(() => []),
        noteService.listNotes(profileId).catch(() => []),
        reminderService.listReminders(profileId).catch(() => []),
        calendarEventService.listCalendarEvents(profileId).catch(() => []),
        habitService.getCompletedLogs(profileId).catch(() => []),
    ]);

    const logIndex = habitService.buildHabitLogIndex(logs);
    const habitsWithStreaks = habits.map(h => {
        const dates = logIndex.get(h.id) || new Set();
        const streak = habitService.computeStreakForDates(dates, h.target_per_week, tz, weekStartsOn);
        return { ...h, current_streak: streak };
    });

    const pendingTasks = tasks.filter(t => t.status === 'pending');
    const doneTasks = tasks.filter(t => t.status === 'done');

    const doFirst = pendingTasks.filter(t => t.urgent && t.important);
    const schedule = pendingTasks.filter(t => !t.urgent && t.important);
    const delegate = pendingTasks.filter(t => t.urgent && !t.important);
    const eliminate = pendingTasks.filter(t => !t.urgent && !t.important);

    let summary = `### User Context (Second Brain Snapshot)\n`;
    summary += `- **Date Today:** ${today} (${tz})\n\n`;

    summary += `#### 📋 Tasks (Eisenhower Matrix)\n`;
    summary += `**1. Do First (Urgent & Important):**\n`;
    if (doFirst.length === 0) summary += `  *(None)*\n`;
    else doFirst.forEach(t => summary += `  - [ ] ${t.title}${t.due_at ? ` (Due: ${t.due_at})` : ''}${t.description ? ` — ${t.description}` : ''}\n`);

    summary += `**2. Schedule (Important, Not Urgent):**\n`;
    if (schedule.length === 0) summary += `  *(None)*\n`;
    else schedule.forEach(t => summary += `  - [ ] ${t.title}${t.due_at ? ` (Due: ${t.due_at})` : ''}${t.description ? ` — ${t.description}` : ''}\n`);

    summary += `**3. Delegate (Urgent, Not Important):**\n`;
    if (delegate.length === 0) summary += `  *(None)*\n`;
    else delegate.forEach(t => summary += `  - [ ] ${t.title}${t.due_at ? ` (Due: ${t.due_at})` : ''}\n`);

    summary += `**4. Eliminate (Not Urgent & Not Important):**\n`;
    if (eliminate.length === 0) summary += `  *(None)*\n`;
    else eliminate.forEach(t => summary += `  - [ ] ${t.title}\n`);

    if (doneTasks.length > 0) {
        summary += `**Completed Tasks (${doneTasks.length}):**\n`;
        doneTasks.slice(0, 5).forEach(t => summary += `  - [x] ${t.title}\n`);
    }

    summary += `\n#### ⚡ Habits & Streaks\n`;
    if (habitsWithStreaks.length === 0) {
        summary += `*(No habits configured)*\n`;
    } else {
        habitsWithStreaks.forEach(h => {
            summary += `- **${h.title}**: ${h.current_streak} week streak (Target: ${h.target_per_week}x/week)\n`;
        });
    }

    summary += `\n#### 📝 Recent Notes (Top 10)\n`;
    if (notes.length === 0) {
        summary += `*(No notes recorded)*\n`;
    } else {
        notes.slice(0, 10).forEach(n => {
            const preview = (n.content || '').replace(/\n+/g, ' ').slice(0, 120);
            const tags = n.tags && n.tags.length ? ` [Tags: ${n.tags.join(', ')}]` : '';
            summary += `- ${preview}${preview.length >= 120 ? '...' : ''}${tags}\n`;
        });
    }

    summary += `\n#### 📅 Upcoming Calendar Events\n`;
    const activeEvents = events.filter(e => !e.ends_at || e.ends_at >= today).slice(0, 10);
    if (activeEvents.length === 0) {
        summary += `*(No upcoming events)*\n`;
    } else {
        activeEvents.forEach(e => {
            summary += `- **${e.title}**: Starts ${e.starts_at || 'N/A'}${e.ends_at ? ` until ${e.ends_at}` : ''}\n`;
        });
    }

    summary += `\n#### ⏰ Active Reminders\n`;
    const pendingReminders = reminders.filter(r => !r.fired_at).slice(0, 10);
    if (pendingReminders.length === 0) {
        summary += `*(No pending reminders)*\n`;
    } else {
        pendingReminders.forEach(r => {
            summary += `- ${r.title} (Remind at: ${r.remind_at})\n`;
        });
    }

    return {
        contextString: summary,
        counts: {
            pendingTasks: pendingTasks.length,
            doneTasks: doneTasks.length,
            habits: habitsWithStreaks.length,
            notes: notes.length,
            events: activeEvents.length,
            reminders: pendingReminders.length
        }
    };
}

/**
 * Normalizes custom/preset endpoint URL for models listing.
 */
function normalizeModelsUrl(url, providerKey) {
    let clean = (url || '').trim().replace(/\/+$/, '');
    if (!clean) {
        if (providerKey === 'claude' || providerKey === 'anthropic') return 'https://api.anthropic.com/v1/models';
        if (providerKey === 'grok') return 'https://api.x.ai/v1/models';
        if (providerKey === 'gemini') return 'https://generativelanguage.googleapis.com/v1beta/openai/models';
        if (providerKey === 'groq') return 'https://api.groq.com/openai/v1/models';
        return 'https://api.openai.com/v1/models';
    }

    if (clean.includes('api.anthropic.com')) {
        return 'https://api.anthropic.com/v1/models';
    }

    if (clean.endsWith('/chat/completions')) {
        return clean.replace(/\/chat\/completions$/, '/models');
    }
    if (clean.endsWith('/messages')) {
        return clean.replace(/\/messages$/, '/models');
    }
    if (clean.endsWith('/v1')) {
        return `${clean}/models`;
    }
    return `${clean}/models`;
}

/**
 * Normalizes custom/preset endpoint URL to ensure proper API path.
 */
function normalizeEndpointUrl(url, providerKey) {
    let clean = (url || '').trim().replace(/\/+$/, '');
    if (!clean) {
        if (providerKey === 'claude' || providerKey === 'anthropic') return 'https://api.anthropic.com/v1/messages';
        if (providerKey === 'grok') return 'https://api.x.ai/v1/chat/completions';
        if (providerKey === 'gemini') return 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
        if (providerKey === 'groq') return 'https://api.groq.com/openai/v1/chat/completions';
        return 'https://api.openai.com/v1/chat/completions';
    }

    if (clean.includes('api.anthropic.com')) {
        if (clean.endsWith('/messages')) return clean;
        return `${clean}/messages`;
    }

    if (clean.endsWith('/chat/completions')) return clean;
    if (clean.endsWith('/v1')) return `${clean}/chat/completions`;
    return `${clean}/chat/completions`;
}

/**
 * Fetches the live list of models directly from the provider's /models endpoint.
 */
async function fetchModels(providerConfig) {
    const config = providerConfig || {};
    const providerKey = config.providerKey || config.preset || 'gemini';
    const rawEndpoint = config.endpointUrl;
    const targetUrl = normalizeModelsUrl(rawEndpoint, providerKey);
    const authType = config.authType || (providerKey === 'claude' || providerKey === 'anthropic' ? 'api-key' : 'bearer');
    const apiKey = (config.apiKey || '').trim();

    const headers = { 'Content-Type': 'application/json' };
    if (targetUrl.includes('api.anthropic.com') || providerKey === 'claude' || providerKey === 'anthropic') {
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
    } else if (authType === 'api-key' && apiKey) {
        headers['api-key'] = apiKey;
        headers['x-api-key'] = apiKey;
    } else if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    try {
        const response = await fetch(targetUrl, {
            method: 'GET',
            headers,
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorText = await response.text();
            let errMsg = `Failed to fetch models (${response.status}): ${response.statusText}`;
            try {
                const parsed = JSON.parse(errorText);
                if (parsed.error?.message) errMsg = parsed.error.message;
            } catch {
                if (errorText) errMsg += ` — ${errorText.slice(0, 150)}`;
            }
            throw new Error(errMsg);
        }

        const data = await response.json();
        let list = [];

        if (Array.isArray(data.data)) {
            // Standard OpenAI / Groq / Grok / Gemini / Anthropic v1 format: { data: [{ id: "..." }] }
            list = data.data.map(item => ({
                id: item.id,
                name: item.display_name || item.id,
                owned_by: item.owned_by || null
            }));
        } else if (Array.isArray(data.models)) {
            // Gemini standard or Ollama format: { models: [{ name: "...", displayName: "..." }] }
            list = data.models.map(item => {
                const rawId = item.id || item.name || '';
                const cleanId = rawId.replace(/^models\//, '');
                return {
                    id: cleanId,
                    name: item.displayName || item.display_name || cleanId
                };
            });
        }

        // Filter out non-chat models
        list = list.filter(m => {
            const id = (m.id || '').toLowerCase();
            return !id.includes('whisper') &&
                   !id.includes('embed') &&
                   !id.includes('dall-e') &&
                   !id.includes('tts') &&
                   !id.includes('moderation') &&
                   !id.includes('babbage') &&
                   !id.includes('davinci') &&
                   !id.includes('curie');
        });

        list.sort((a, b) => a.id.localeCompare(b.id));

        return { ok: true, models: list, source: targetUrl };
    } catch (err) {
        clearTimeout(timeoutId);
        throw err;
    }
}

/**
 * Proxies chat completions to the user-specified provider.
 */
async function sendChatCompletion({ messages, providerConfig, profileContext }) {
    const config = providerConfig || {};
    const providerKey = config.providerKey || config.preset || 'gemini';
    const rawEndpoint = config.endpointUrl;
    const targetUrl = normalizeEndpointUrl(rawEndpoint, providerKey);
    const model = (config.modelName || '').trim();

    if (!model) {
        throw new Error('Please select or specify a model before sending a message.');
    }

    const authType = config.authType || (providerKey === 'claude' || providerKey === 'anthropic' ? 'api-key' : 'bearer');
    const apiKey = (config.apiKey || '').trim();

    const headers = {
        'Content-Type': 'application/json',
    };

    if (targetUrl.includes('api.anthropic.com') || providerKey === 'claude' || providerKey === 'anthropic') {
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
    } else if (authType === 'api-key' && apiKey) {
        headers['api-key'] = apiKey;
        headers['x-api-key'] = apiKey;
    } else if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const systemPrompt = `You are Second Brain AI, an intelligent, concise personal assistant integrated into the Second Brain productivity application.
Your goal is to help the user plan their day, organize tasks on the Eisenhower matrix, keep up with habit streaks, convert ideas into clear action items, and manage their schedule.
Always give actionable, structured, and friendly advice. Use bullet points and markdown where helpful.

${profileContext ? profileContext : ''}`;

    let requestBody;

    // Anthropic Native Format
    if (targetUrl.includes('api.anthropic.com')) {
        requestBody = {
            model,
            max_tokens: config.maxTokens ? Number(config.maxTokens) : 1024,
            system: systemPrompt,
            messages: (messages || []).map(m => ({
                role: m.role === 'user' ? 'user' : 'assistant',
                content: m.content || ''
            })),
            temperature: config.temperature !== undefined ? Number(config.temperature) : 0.7
        };
    } else {
        // OpenAI / LiteLLM / Groq / Grok / Gemini / Ollama / DeepSeek standard format
        const formattedMessages = [
            { role: 'system', content: systemPrompt },
            ...(messages || []).map(m => ({
                role: m.role === 'user' ? 'user' : 'assistant',
                content: m.content || ''
            }))
        ];

        requestBody = {
            model,
            messages: formattedMessages,
            temperature: config.temperature !== undefined ? Number(config.temperature) : 0.7,
            max_tokens: config.maxTokens ? Number(config.maxTokens) : undefined
        };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    try {
        const response = await fetch(targetUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(requestBody),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = `Provider error (${response.status}): ${response.statusText}`;
            try {
                const parsed = JSON.parse(errorText);
                if (parsed.error?.message) errorMessage = parsed.error.message;
                else if (parsed.message) errorMessage = parsed.message;
            } catch {
                if (errorText) errorMessage += ` — ${errorText.slice(0, 200)}`;
            }
            throw new Error(errorMessage);
        }

        const data = await response.json();

        let reply = '';
        if (data.content && Array.isArray(data.content)) {
            // Anthropic format
            reply = data.content.map(c => c.text || '').join('');
        } else {
            // OpenAI / LiteLLM format
            const choice = data.choices && data.choices[0];
            reply = choice?.message?.content || choice?.text || 'No response generated.';
        }

        return {
            reply,
            model: data.model || model,
            usage: data.usage || null
        };
    } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
            throw new Error(`Request timed out after 45 seconds when reaching ${targetUrl}`);
        }
        throw err;
    }
}

/**
 * Quick ping test for custom endpoint & auth verification.
 */
async function testConnection(providerConfig) {
    const config = providerConfig || {};
    const providerKey = config.providerKey || config.preset || 'gemini';
    const rawEndpoint = config.endpointUrl;
    const targetUrl = normalizeEndpointUrl(rawEndpoint, providerKey);
    const model = (config.modelName || '').trim() || (providerKey === 'claude' || providerKey === 'anthropic' ? 'claude-3-5-sonnet-20241022' : 'gemini-1.5-flash-latest');
    const authType = config.authType || (providerKey === 'claude' || providerKey === 'anthropic' ? 'api-key' : 'bearer');
    const apiKey = (config.apiKey || '').trim();

    const headers = { 'Content-Type': 'application/json' };
    if (targetUrl.includes('api.anthropic.com') || providerKey === 'claude' || providerKey === 'anthropic') {
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
    } else if (authType === 'api-key' && apiKey) {
        headers['api-key'] = apiKey;
        headers['x-api-key'] = apiKey;
    } else if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    try {
        let body;
        if (targetUrl.includes('api.anthropic.com')) {
            body = {
                model,
                max_tokens: 10,
                messages: [{ role: 'user', content: 'Ping. Reply with pong.' }]
            };
        } else {
            body = {
                model,
                messages: [{ role: 'user', content: 'Ping. Reply with pong.' }],
                max_tokens: 10
            };
        }

        const response = await fetch(targetUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            const errText = await response.text();
            let msg = `HTTP ${response.status}: ${response.statusText}`;
            try {
                const parsed = JSON.parse(errText);
                if (parsed.error?.message) msg = parsed.error.message;
            } catch {
                if (errText) msg += ` (${errText.slice(0, 150)})`;
            }
            return { ok: false, error: msg };
        }

        const data = await response.json();
        return { ok: true, message: `Connected successfully to model "${data.model || model}"` };
    } catch (err) {
        clearTimeout(timeoutId);
        return { ok: false, error: err.message };
    }
}

module.exports = {
    buildProfileContext,
    sendChatCompletion,
    testConnection,
    fetchModels,
    normalizeEndpointUrl,
    normalizeModelsUrl
};
