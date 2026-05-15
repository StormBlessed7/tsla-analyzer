module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const delays = [1000, 2000, 4000];

  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': process.env.ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01',
  };
  const tools = req.body?.tools || [];
  if (tools.some(t => t.type === 'web_search_20250305')) {
    headers['anthropic-beta'] = 'web-search-2025-03-05';
  }

  const callAnthropic = () => fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers,
    body: JSON.stringify(req.body)
  });

  try {
    let response = await callAnthropic();
    for (let i = 0; i < delays.length && response.status === 529; i++) {
      await sleep(delays[i]);
      response = await callAnthropic();
    }
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
