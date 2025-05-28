import { load } from "https://deno.land/std@0.208.0/dotenv/mod.ts";

// Load environment variables
const env = await load();
const token = env.BOT_TOKEN || Deno.env.get("BOT_TOKEN");

if (!token) {
    console.error('❌ BOT_TOKEN is not set in environment variables');
    console.log('Please create a .env file and add your BOT_TOKEN');
    Deno.exit(1);
}

// Telegram Bot API base URL
const TELEGRAM_API = `https://api.telegram.org/bot${token}`;
const ETHOS_API_BASE = 'https://api.ethos.network';

console.log('🤖 Telegram bot is starting...');

// Helper function to determine userkey format
function formatUserkey(input: string): string {
    // Remove @ symbol if present
    const cleanInput = input.replace(/^@/, '');
    
    // Check if it's an EVM address (starts with 0x and is 42 characters)
    if (cleanInput.startsWith('0x') && cleanInput.length === 42) {
        return `service:ethereum:address:${cleanInput}`;
    }
    
    // Otherwise treat as Twitter username
    return `service:x.com:username:${cleanInput}`;
}

// Helper function to fetch Ethos score
async function fetchEthosScore(userkey: string): Promise<number | null> {
    try {
        const response = await fetch(`${ETHOS_API_BASE}/api/v1/score/${userkey}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.ok) {
            throw new Error('API returned error');
        }
        
        return data.data.score;
    } catch (error) {
        console.error('Error fetching Ethos score:', error);
        return null;
    }
}

// Helper function to fetch profile from Ethos API
async function fetchEthosProfile(userkey: string): Promise<any> {
    try {
        const response = await fetch(`${ETHOS_API_BASE}/api/v1/users/${userkey}/stats`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.ok) {
            throw new Error('API returned error');
        }
        
        return data.data;
    } catch (error) {
        console.error('Error fetching Ethos profile:', error);
        throw error;
    }
}

// Helper function to format profile data for display
function formatProfileMessage(profileData: any, userkey: string, ethosScore: number | null): string {
    const { reviews, slashes, vouches } = profileData;
    
    // Extract username from userkey for display and generate correct profile URL
    let displayName: string, profileUrl: string;
    
    if (userkey.includes('username:')) {
        displayName = userkey.split('username:')[1];
        profileUrl = `https://app.ethos.network/profile/x/${displayName}`;
    } else if (userkey.includes('address:')) {
        displayName = userkey.split('address:')[1];
        profileUrl = `https://app.ethos.network/profile/${displayName}`;
    } else {
        displayName = userkey;
        profileUrl = `https://app.ethos.network/profile/${displayName}`;
    }
    
    let message = `🔍 <b>Ethos Profile Overview</b>\n\n`;
    message += `👤 <b>User:</b> ${displayName}\n\n`;
    
    // Display Ethos score if available
    if (ethosScore !== null) {
        message += `⭐ <b>Ethos Score:</b> ${ethosScore}\n\n`;
    } else {
        message += `⭐ <b>Ethos Score:</b> Not available\n\n`;
    }
    
    // Reviews section - only show if there are reviews
    if (reviews.received > 0) {
        message += `📊 <b>Reviews:</b>\n`;
        message += `• Total Received: ${reviews.received} (${reviews.positiveReviewPercentage.toFixed(1)}%)\n`;
        
        // Only show positive reviews if count > 0
        if (reviews.positiveReviewCount > 0) {
            message += `• Positive: ${reviews.positiveReviewCount}\n`;
        }
        
        // Only show negative reviews if count > 0
        if (reviews.negativeReviewCount > 0) {
            message += `• Negative: ${reviews.negativeReviewCount}\n`;
        }
        
        // Only show neutral reviews if count > 0
        if (reviews.neutralReviewCount > 0) {
            message += `• Neutral: ${reviews.neutralReviewCount}\n`;
        }
        
        message += `\n`;
    }
    
    // Vouches section
    message += `🤝 <b>Vouches:</b>\n`;
    message += `• Vouches received: ${vouches.balance.received.toFixed(4)}e (${vouches.count.received})\n`;
    message += `• Vouched for others: ${vouches.balance.deposited.toFixed(4)}e (${vouches.count.deposited})\n`;
    message += `• <a href="${profileUrl}?modal=vouch">Vouch for ${displayName}</a>\n`;

    // Slashes section
    message += `\n`;
    message += `⚠️ <b>Slashes:</b>\n`;
    message += `• Count: ${slashes.count}\n`;
    if (slashes.openSlash) {
        message += `• Open Slash: Yes\n`;
    } else {
        message += `• Open Slash: None\n`;
    }
    
    message += `\n🌐 <a href="${profileUrl}">View full profile</a>`;
    
    return message;
}

// Telegram API helper functions
async function sendMessage(chatId: number, text: string, parseMode = 'HTML') {
    const response = await fetch(`${TELEGRAM_API}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            text: text,
            parse_mode: parseMode
        })
    });
    return response.json();
}

async function sendChatAction(chatId: number, action: string) {
    await fetch(`${TELEGRAM_API}/sendChatAction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            action: action
        })
    });
}

// Handle incoming updates
async function handleUpdate(update: any) {
    if (!update.message || !update.message.text) return;
    
    const message = update.message;
    const chatId = message.chat.id;
    const text = message.text;
    
    // Handle /start command
    if (text === '/start') {
        const welcomeMessage = `
🎉 Welcome to the Ethos Profile Bot!

I can help you look up Ethos Network profiles using Twitter handles or EVM wallet addresses.

Use /help to see available commands.
        `;
        await sendMessage(chatId, welcomeMessage);
        return;
    }
    
    // Handle /help command
    if (text === '/help') {
        const helpMessage = `
🤖 <b>Ethos Profile Bot Commands:</b>

/start - Show welcome message
/help - Show this help message
/profile &lt;handle_or_address&gt; - Get Ethos profile information

<b>Examples:</b>
• <code>/profile vitalikbuterin</code> - Look up Twitter handle
• <code>/profile @vitalikbuterin</code> - Look up Twitter handle (with @)
• <code>/profile 0x1234...abcd</code> - Look up EVM wallet address

The bot will fetch profile data from the Ethos Network including reviews, vouches, and slashes.
        `;
        await sendMessage(chatId, helpMessage);
        return;
    }
    
    // Handle /profile command
    const profileMatch = text.match(/^\/profile (.+)/);
    if (profileMatch) {
        const input = profileMatch[1].trim();
        
        if (!input) {
            await sendMessage(chatId, '❌ Please provide a Twitter handle or EVM address.\n\nExample: <code>/profile VitalikButerin</code>');
            return;
        }
        
        // Send "typing" action to show bot is working
        await sendChatAction(chatId, 'typing');
        
        try {
            // Format the userkey
            const userkey = formatUserkey(input);
            console.log(`Looking up profile for userkey: ${userkey}`);
            
            // Fetch profile data and score
            const [profileData, ethosScore] = await Promise.all([
                fetchEthosProfile(userkey),
                fetchEthosScore(userkey)
            ]);
            
            // Format and send the profile message
            const responseMessage = formatProfileMessage(profileData, userkey, ethosScore);
            await sendMessage(chatId, responseMessage);
            
        } catch (error) {
            console.error('Error in /profile command:', error);
            await sendMessage(chatId, `❌ Profile not found on Ethos Network\n\nMake sure the Twitter handle or address is correct and has an Ethos profile.`);
        }
    }
}

// Polling function
async function startPolling() {
    let offset = 0;
    
    while (true) {
        try {
            const response = await fetch(`${TELEGRAM_API}/getUpdates?offset=${offset}&timeout=30`);
            const data = await response.json();
            
            if (data.ok && data.result.length > 0) {
                for (const update of data.result) {
                    await handleUpdate(update);
                    offset = update.update_id + 1;
                }
            }
        } catch (error) {
            console.error('Polling error:', error);
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds before retrying
        }
    }
}

// Graceful shutdown
Deno.addSignalListener("SIGINT", () => {
    console.log('\n🛑 Bot is shutting down...');
    Deno.exit(0);
});

console.log('✅ Ethos Profile Bot is running!');
startPolling(); 