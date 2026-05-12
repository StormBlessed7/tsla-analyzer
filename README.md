# TSLA Day Trading Analyzer

AI-powered Tesla options analysis terminal built with Claude AI + web search.

## Deploy to Vercel (5 minutes)

### Step 1 — Get your Anthropic API key
1. Go to https://console.anthropic.com
2. Click "API Keys" → "Create Key"
3. Copy the key (starts with `sk-ant-...`)

### Step 2 — Install Vercel CLI (optional but fastest)
```bash
npm install -g vercel
```

### Step 3 — Deploy
**Option A: CLI (recommended)**
```bash
cd tsla-analyzer
vercel
# Follow prompts, then:
vercel env add ANTHROPIC_API_KEY
# Paste your key when prompted
vercel --prod
```

**Option B: Drag & Drop (no coding)**
1. Go to https://vercel.com → New Project
2. Drag the entire `tsla-analyzer` folder into the browser
3. Before deploying, click "Environment Variables"
4. Add: `ANTHROPIC_API_KEY` = your key from Step 1
5. Click Deploy

### Step 4 — Open your live URL
Vercel gives you a URL like `tsla-analyzer-xyz.vercel.app` — bookmark it!

## Project Structure
```
tsla-analyzer/
├── public/
│   └── index.html      # Main app UI
├── api/
│   └── claude.js       # Serverless proxy (keeps API key safe)
├── vercel.json         # Routing config
└── README.md
```

## Features
- Live news sentiment via Claude web search
- Technical indicators (RSI, MACD, VWAP, EMA, Bollinger Bands)
- CALL / PUT signal with confidence score
- Entry / Target / Stop levels
- Volume profile
- Refreshable analysis any time

## Notes
- Price chart is illustrative — use alongside your Robinhood chart for live quotes
- Not financial advice — always manage your own risk
- Each "Run Full Analysis" uses ~1000 tokens (~$0.003 per analysis)
