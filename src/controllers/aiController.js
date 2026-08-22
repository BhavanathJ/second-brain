const aiService = require('../services/aiService');

async function getContext(req, res) {
    try {
        const contextData = await aiService.buildProfileContext(req.profileId);
        return res.status(200).json(contextData);
    } catch (err) {
        console.error('Failed to aggregate second brain context:', err);
        return res.status(500).json({ error: 'Failed to aggregate context.' });
    }
}

async function chat(req, res) {
    const { messages, providerConfig, includeContext } = req.body || {};

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'Messages array is required.' });
    }

    try {
        let profileContext = null;
        if (includeContext !== false) {
            const contextData = await aiService.buildProfileContext(req.profileId);
            profileContext = contextData.contextString;
        }

        const result = await aiService.sendChatCompletion({
            messages,
            providerConfig,
            profileContext
        });

        return res.status(200).json(result);
    } catch (err) {
        console.error('AI chat error:', err);
        return res.status(500).json({ error: err.message || 'AI request failed.' });
    }
}

async function testConnection(req, res) {
    const { providerConfig } = req.body || {};
    try {
        const result = await aiService.testConnection(providerConfig);
        return res.status(200).json(result);
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
}

async function getModels(req, res) {
    const { providerConfig } = req.body || {};
    try {
        const result = await aiService.fetchModels(providerConfig);
        return res.status(200).json(result);
    } catch (err) {
        return res.status(400).json({ ok: false, error: err.message });
    }
}

module.exports = {
    getContext,
    chat,
    testConnection,
    getModels
};
