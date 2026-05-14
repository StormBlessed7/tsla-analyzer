module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  res.json({ finnhubKey: process.env.FINNHUB_API_KEY || '' });
};
