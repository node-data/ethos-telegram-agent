# Ethos Network Telegram Bot

A Telegram bot that helps users look up Ethos Network profiles and provides daily reminder functionality to maintain contributor streaks.

## Features

- **Profile Lookup**: Look up Ethos Network profiles using Twitter handles or EVM addresses
- **Auto-detection**: Automatically detects Twitter URLs and shows Ethos profiles
- **Daily Reminders**: Customizable UTC-based reminder system for contributor tasks
- **Interactive Buttons**: Quick actions to review, vouch, or view full profiles

## File Structure

The codebase is organized into focused modules for better maintainability:

### Core Files

- **`main.ts`** - Main entry point with cron job and HTTP server
- **`config.ts`** - Environment variables, constants, and API configuration
- **`database.ts`** - Deno KV database operations for user management
- **`handlers.ts`** - Message handling and command processing logic
- **`telegram.ts`** - Telegram Bot API helper functions
- **`ethos.ts`** - Ethos Network API integration and formatting
- **`utils.ts`** - Time parsing and formatting utilities
- **`reminders.ts`** - Reminder functionality and cron job logic

### Module Responsibilities

#### `config.ts`
- Environment variable loading
- Bot token validation
- API endpoint configuration

#### `database.ts`
- User reminder data storage and retrieval
- KV database operations
- User management functions

#### `handlers.ts`
- Command processing (`/start`, `/help`, `/profile`, etc.)
- Twitter URL auto-detection
- Message routing and response handling

#### `telegram.ts`
- Telegram API communication
- Message sending functions
- Chat actions and photo uploads

#### `ethos.ts`
- Ethos Network API integration
- Profile data formatting
- Userkey generation and parsing
- Inline keyboard creation

#### `utils.ts`
- Time parsing for various input formats
- Display formatting functions

#### `reminders.ts`
- Reminder message content
- Scheduled reminder sending
- Test reminder functionality

## Commands

- `/start` - Welcome message and auto-enrollment in reminders
- `/help` - Comprehensive help with examples
- `/profile <handle_or_address>` - Look up Ethos profile
- `/start_reminders` - Enable daily reminders
- `/stop_reminders` - Disable daily reminders
- `/set_reminder_time <time>` - Set custom reminder time (UTC)
- `/get_reminder_time` - Check current reminder settings

## Time Format Examples

The bot supports various time input formats:
- `6pm` - 6:00 PM UTC
- `18:00` - 6:00 PM UTC
- `9:30am` - 9:30 AM UTC
- `21` - 9:00 PM UTC

## Deployment

This bot is designed for Deno Deploy and includes:
- Hourly cron job for reminder checking
- Webhook endpoint for Telegram integration
- Health check and test endpoints
- Automatic webhook setup endpoint

## Environment Variables

- `BOT_TOKEN` - Telegram Bot API token (required)

## Endpoints

- `/webhook` - Telegram webhook (POST)
- `/health` - Health check (GET)
- `/test-reminder?hour=X` - Test reminder functionality (GET)
- `/set-webhook` - Initial webhook setup (GET)

## Development Benefits

The modular structure provides:
- **Separation of Concerns**: Each file has a single responsibility
- **Easy Testing**: Individual modules can be tested in isolation
- **Better Maintenance**: Changes are localized to specific modules
- **Code Reusability**: Functions can be easily imported across modules
- **Clear Dependencies**: Import statements show module relationships

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
4. **Select `main.ts` as entry point**
5. **Add environment variable**: `BOT_TOKEN=your_token`
6. **Deploy!**

### Other Options
- Railway
- Render
- Any VPS with Deno installed

## 🛠️ Commands

- `/start` - Welcome message and auto-enrollment in reminders
- `/help` - Show available commands and examples
- `/profile <handle_or_address>` - Get Ethos profile
- `/start_reminders` - Enable daily contributor reminders
- `/stop_reminders` - Disable daily reminders
- `/set_reminder_time <time>` - Set custom reminder time (UTC)
- `/get_reminder_time` - Check current reminder settings

### Examples
- `/profile ethos_network`
- `/profile @ethos_network`
- `/profile 0x1234...abcd`

## 📁 Project Structure

```
telegram-bot/
├── main.ts          # Main entry point with HTTP server and cron jobs
├── config.ts        # Environment variables and API configuration
├── database.ts      # Deno KV database operations
├── handlers.ts      # Message handling and command processing
├── telegram.ts      # Telegram Bot API helper functions
├── ethos.ts         # Ethos Network API integration
├── utils.ts         # Time parsing and formatting utilities
├── reminders.ts     # Reminder functionality and cron jobs
├── deno.json        # Deno configuration and tasks
├── deno.lock        # Dependency lock file
├── .gitignore       # Git ignore rules
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