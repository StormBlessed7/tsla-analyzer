module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const { symbol, tf } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  const key = process.env.FINNHUB_API_KEY;
  const now = Math.floor(Date.now() / 1000);

  // Try Finnhub first with correct resolution and timestamps per timeframe
  if (key) {
    let resolution, fromTs;
    if (tf === '1D') {
      // Today 9:30am ET — compute dynamically to handle EDT vs EST
      const utcH = new Date().getUTCHours();
      const etHourStr = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour: '2-digit', hour12: false });
      const etH = parseInt(etHourStr);
      const offsetH = (utcH - etH + 24) % 24; // 4 = EDT, 5 = EST
      const etDateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // "YYYY-MM-DD"
      const marketOpen = new Date(`${etDateStr}T${String(9 + offsetH).padStart(2,'0')}:30:00Z`);
      fromTs = Math.floor(marketOpen.getTime() / 1000);
      resolution = '5';
    } else if (tf === '5D') {
      fromTs = now - 5 * 24 * 3600;
      resolution = '30';
    } else {
      fromTs = now - 30 * 24 * 3600;
      resolution = 'D';
    }
    try {
      const url = `https://finnhub.io/api/v1/stock/candle?symbol=${symbol}&resolution=${resolution}&from=${fromTs}&to=${now}&token=${key}`;
      const r = await fetch(url);
      const data = await r.json();
      if (data.s === 'ok' && Array.isArray(data.t) && data.t.length >= 2) {
        return res.status(200).json(data);
      }
    } catch (_) {}
  }

  // Fallback: Yahoo Finance (free, no key, returns intraday data)
  const yfInterval = tf === '1M' ? '1d' : tf === '5D' ? '30m' : '5m';
  const yfRange    = tf === '1M' ? '1mo' : tf === '5D' ? '5d' : '1d';
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${yfInterval}&range=${yfRange}&includePrePost=false`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'application/json' }
    });
    const data = await r.json();
    const result = data?.chart?.result?.[0];
    if (!result?.timestamp?.length) return res.status(200).json({ s: 'no_data' });
    const q = result.indicators?.quote?.[0] || {};
    return res.status(200).json({ s: 'ok', t: result.timestamp, o: q.open, h: q.high, l: q.low, c: q.close, v: q.volume });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
