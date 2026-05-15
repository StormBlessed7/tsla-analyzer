module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return res.status(200).json({ ok: false, error: 'ANTHROPIC_API_KEY is not set in Vercel environment variables.' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 20,
        messages: [{ role: 'user', content: 'Reply with the word OK only.' }]
      })
    });

    const data = await response.json();
    if (response.ok) {
      return res.status(200).json({ ok: true, model: 'claude-3-haiku-20240307', reply: data.content?.[0]?.text });
    } else {
      return res.status(200).json({ ok: false, status: response.status, anthropic_error: data });
    }
  } catch (err) {
    return res.status(200).json({ ok: false, error: err.message });
  }
};
