const { check, section, summary, mock } = require('./helpers');
const originalFetch = global.fetch;

const aiService = require('../src/services/aiService');
const aiController = require('../src/controllers/aiController');
const taskService = require('../src/services/taskService');
const habitService = require('../src/services/habitService');
const noteService = require('../src/services/noteService');
const settingsService = require('../src/services/settingsService');

async function run() {
  const profileId = 'test-profile-ai-1';

  section('AI Service: Context Builder');

  // Seed settings, tasks, habits, notes
  await settingsService.createDefaultSettings(profileId);
  await taskService.createTask(profileId, {
    title: 'Finish Q3 report',
    urgent: true,
    important: true,
    due_at: '2026-08-25T15:00:00.000Z'
  });
  await taskService.createTask(profileId, {
    title: 'Exercise daily',
    urgent: false,
    important: true
  });
  await habitService.createHabit(profileId, {
    title: 'Read 20 pages',
    target_per_week: 5
  });
  await noteService.createNote(profileId, {
    content: 'Important idea regarding second brain architecture',
    tags: ['idea', 'tech']
  });

  const contextData = await aiService.buildProfileContext(profileId);

  check(
    'context includes tasks',
    contextData.contextString.includes('Finish Q3 report') && contextData.contextString.includes('Do First')
  );
  check(
    'context counts are accurate',
    contextData.counts.pendingTasks === 2 && contextData.counts.habits === 1 && contextData.counts.notes === 1
  );

  section('AI Service: Endpoint Normalizer & Provider Routing');

  check(
    'gemini default base endpoint',
    aiService.normalizeEndpointUrl('', 'gemini') === 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
  );
  check(
    'claude default base endpoint',
    aiService.normalizeEndpointUrl('', 'claude') === 'https://api.anthropic.com/v1/messages'
  );
  check(
    'grok default base endpoint',
    aiService.normalizeEndpointUrl('', 'grok') === 'https://api.x.ai/v1/chat/completions'
  );
  check(
    'groq default base endpoint',
    aiService.normalizeEndpointUrl('', 'groq') === 'https://api.groq.com/openai/v1/chat/completions'
  );

  // Mock global.fetch for testing chat completion
  global.fetch = async (url, opts) => {
    if (url.includes('api.anthropic.com')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          model: 'claude-3-5-sonnet-20241022',
          content: [{ type: 'text', text: 'Here is your Claude plan: finish the Q3 report!' }]
        })
      };
    }

    return {
      ok: true,
      status: 200,
      json: async () => ({
        model: 'gemini-1.5-flash-latest',
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Here is your Gemini plan: focus on the Q3 report first!'
            }
          }
        ]
      })
    };
  };

  const testResult = await aiService.testConnection({
    providerKey: 'gemini',
    endpointUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    modelName: 'gemini-1.5-flash-latest',
    apiKey: 'test-key'
  });

  check('testConnection returns ok for gemini', testResult.ok === true);

  section('AI Service: Chat Completion with Context');

  const geminiChat = await aiService.sendChatCompletion({
    messages: [{ role: 'user', content: 'What should I work on today?' }],
    providerConfig: {
      providerKey: 'gemini',
      modelName: 'gemini-1.5-flash-latest',
      apiKey: 'test-key'
    },
    profileContext: contextData.contextString
  });

  check(
    'gemini chat completion forwards response',
    geminiChat.reply.includes('Gemini plan') && geminiChat.model === 'gemini-1.5-flash-latest'
  );

  const claudeChat = await aiService.sendChatCompletion({
    messages: [{ role: 'user', content: 'Plan my day' }],
    providerConfig: {
      providerKey: 'claude',
      modelName: 'claude-3-5-sonnet-20241022',
      apiKey: 'test-key'
    },
    profileContext: contextData.contextString
  });

  check(
    'claude native messages completion forwards response',
    claudeChat.reply.includes('Claude plan') && claudeChat.model === 'claude-3-5-sonnet-20241022'
  );

  section('AI Service: Live Models Fetching (GET /models)');

  global.fetch = async (url, opts) => {
    if (url.includes('/models')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { id: 'llama-3.3-70b-versatile', display_name: 'Llama 3.3 70B' },
            { id: 'llama-3.1-8b-instant', display_name: 'Llama 3.1 8B' },
            { id: 'whisper-large-v3', display_name: 'Whisper Large' } // should be filtered out
          ]
        })
      };
    }
    return { ok: true, json: async () => ({}) };
  };

  const modelsResult = await aiService.fetchModels({
    providerKey: 'groq',
    apiKey: 'test-key'
  });

  check('fetchModels returns live models', modelsResult.ok === true && modelsResult.models.length === 2);
  check('whisper is filtered out', !modelsResult.models.some(m => m.id.includes('whisper')));
  check('models list contains llama-3.3-70b-versatile', modelsResult.models.some(m => m.id === 'llama-3.3-70b-versatile'));

  // Restore fetch
  global.fetch = originalFetch;

  summary('AI Overlay Tests');
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
