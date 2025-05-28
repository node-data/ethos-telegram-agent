# 🤖 Ethos Profile Bot (Deno)

A Telegram bot that fetches and displays Ethos Network profile information for Twitter handles and EVM wallet addresses.

## ✨ Features

- 🔍 **Profile Lookup**: Search by Twitter handle or EVM address
- ⭐ **Ethos Score**: Display user's reputation score
- 📊 **Reviews**: Show positive, negative, and neutral reviews (conditionally)
- 🤝 **Vouches**: Display vouch statistics and links
- ⚠️ **Slashes**: Show slash information
- 🔗 **Embedded Links**: Clean, clickable profile and vouch links

## 🚀 Quick Start

### Prerequisites
- [Deno](https://deno.land/) installed
- Telegram Bot Token from [@BotFather](https://t.me/botfather)

### Local Development

1. **Clone and setup**:
```bash
git clone <your-repo>
cd telegram-bot
```

2. **Create `.env` file**:
```bash
BOT_TOKEN=your_telegram_bot_token_here
```

3. **Run the bot**:
```bash
# Start the bot
deno task start

# Development mode (auto-restart on changes)
deno task dev
```

## 🌐 Deployment

### Deno Deploy (Recommended - FREE)

1. **Push to GitHub**
2. **Go to [dash.deno.com](https://dash.deno.com)**
3. **Create new project** → Connect GitHub repo
4. **Select `deno-bot.ts` as entry point**
5. **Add environment variable**: `BOT_TOKEN=your_token`
6. **Deploy!**

### Other Options
- Railway
- Render
- Any VPS with Deno installed

## 🛠️ Commands

- `/start` - Welcome message
- `/help` - Show available commands
- `/profile <handle_or_address>` - Get Ethos profile

### Examples
- `/profile vitalikbuterin`
- `/profile @buz_eth`
- `/profile 0x1234...abcd`

## 📁 Project Structure

```
telegram-bot/
├── deno-bot.ts      # Main bot file
├── deno.json        # Deno configuration
├── .env.example     # Environment variables template
├── .env             # Your environment variables (gitignored)
└── README.md        # This file
```

## 🔧 Configuration

The bot uses these environment variables:

- `BOT_TOKEN` - Your Telegram bot token (required)

## 🦕 Why Deno?

- **No package.json** - Direct URL imports
- **Built-in TypeScript** - Better type safety
- **Secure by default** - Explicit permissions
- **Modern runtime** - Latest JavaScript features
- **Zero config** - Works out of the box

## 📝 License

MIT License 