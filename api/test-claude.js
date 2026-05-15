module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return res.status(200).json({ ok: false, error: 'ANTHROPIC_API_KEY is not set in Vercel environment variables.' });
  }

  // Step 1: list available models for this API key
  let availableModels = [];
  try {
    const modelsRes = await fetch('https://api.anthropic.com/v1/models', {
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' }
    });
    const modelsData = await modelsRes.json();
    if (modelsRes.ok && modelsData.data) {
      availableModels = modelsData.data.map(m => m.id);
    }
  } catch (_) {}

  // Step 2: try a minimal completion with the first available model
  const tryModel = availableModels[0] || 'claude-3-haiku-20240307';
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: tryModel,
        max_tokens: 20,
        messages: [{ role: 'user', content: 'Reply OK.' }]
      })
    });

    const data = await response.json();
    if (response.ok) {
      return res.status(200).json({ ok: true, model: tryModel, reply: data.content?.[0]?.text, available_models: availableModels });
    } else {
      return res.status(200).json({ ok: false, tried_model: tryModel, available_models: availableModels, anthropic_error: data });
    }
  } catch (err) {
    return res.status(200).json({ ok: false, error: err.message, available_models: availableModels });
  }
};
