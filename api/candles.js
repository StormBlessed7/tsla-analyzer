module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const { symbol, tf } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  const range = tf === '1M' ? '1y' : tf === '5D' ? '1mo' : '3mo';

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=${range}`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
    });
    const data = await r.json();

    const result = data?.chart?.result?.[0];
    if (!result?.timestamp?.length) return res.status(200).json({ s: 'no_data' });

    const ts = result.timestamp;
    const q = result.indicators?.quote?.[0] || {};

    res.status(200).json({
      s: 'ok',
      t: ts,
      o: q.open,
      h: q.high,
      l: q.low,
      c: q.close,
      v: q.volume,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
