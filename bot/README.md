# HORMUZ Aggregator Bot

Polls RSS feeds from Middle East geopolitics Telegram channels and reposts
relevant oil/Hormuz/shipping news to your HORMUZ community channel.

**No MTProto API needed. Only your bot token is required.**

## Files

| File | Purpose |
|---|---|
| `main.py` | Entry point — runs the bot |
| `rss_poller.py` | Polls RSS feeds from source channels via RSSHub |
| `filter.py` | Keyword relevance scoring |
| `formatter.py` | Message formatting + attribution |
| `config.py` | All settings (channels, keywords, intervals) |
| `.env` | Your secrets — never commit this |

## Setup (3 steps)

### 1. Install dependencies

```bash
cd bot
pip install -r requirements.txt
```

### 2. Fill in `.env`

Open `bot/.env` and set:

```
BOT_TOKEN=your_bot_token_from_BotFather
TARGET_CHANNEL=your_hormuz_channel_username
```

That's it. No API ID or phone number needed.

### 3. Add bot as admin to your channel

In Telegram:
- Open your HORMUZ channel → Settings → Administrators
- Add `@StateOfHormuzBot`
- Give it **"Post Messages"** permission only

## Run the bot

```bash
cd bot
python main.py
```

The bot will:
1. Verify your bot token and channel access
2. Seed current timestamps (so it only picks up **future** posts, not backlog)
3. Poll all RSS feeds every 5 minutes
4. Post any relevant matches to your channel

## Customise

**Add/remove source channels** — edit `SOURCE_CHANNELS` in `config.py`

**Add/remove keywords** — edit `PRIMARY_KEYWORDS` in `config.py`

**Change poll frequency** — set `POLL_INTERVAL=60` in `.env` (seconds)

## Run 24/7 (free)

### Oracle Cloud Free Tier
```bash
# On your free VM:
pip install -r requirements.txt
# Copy .env manually (scp) — never via git
nohup python main.py > /dev/null 2>&1 &
```

### Windows (Task Scheduler)
Create a task: Action → `python d:\Experimentation\CoinTest\bot\main.py`
Trigger → At startup
