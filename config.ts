// Load environment variables (optional for local development)
let env: Record<string, string> = {};
try {
    const { load } = await import("https://deno.land/std@0.208.0/dotenv/mod.ts");
    env = await load();
} catch {
    // Ignore dotenv loading errors in production
    console.log('No .env file found, using environment variables');
}

// @ts-ignore - Deno global is available in Deno runtime
const token = env.BOT_TOKEN || Deno.env.get("BOT_TOKEN");

if (!token) {
    console.error('❌ BOT_TOKEN is not set in environment variables');
    throw new Error('BOT_TOKEN is required');
}

// API Configuration
export const TELEGRAM_API = `https://api.telegram.org/bot${token}`;
export const ETHOS_API_BASE = 'https://api.ethos.network';
export const BOT_TOKEN = token; 