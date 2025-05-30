// Load environment variables (optional for local development)
let env: Record<string, string> = {};
try {
    const { load } = await import("https://deno.land/std@0.208.0/dotenv/mod.ts");
    env = await load();
} catch {
    // Ignore dotenv loading errors in production
    console.log('No .env file found, using environment variables');
}

const token = env.BOT_TOKEN || Deno.env.get("BOT_TOKEN");

if (!token) {
    console.error('❌ BOT_TOKEN is not set in environment variables');
    throw new Error('BOT_TOKEN is required');
}

// Telegram Bot API base URL
const TELEGRAM_API = `https://api.telegram.org/bot${token}`;
const ETHOS_API_BASE = 'https://api.ethos.network';

console.log('🤖 Telegram bot is starting on Deno Deploy...');

// Helper function to determine userkey format
function formatUserkey(input: string): string {
    // Remove @ symbol if present
    const cleanInput = input.replace(/^@/, '');
    
    // Check if it's an EVM address (starts with 0x and is 42 characters)
    if (cleanInput.startsWith('0x') && cleanInput.length === 42) {
        return `address:${cleanInput}`;
    }
    
    // Otherwise treat as Twitter username
    return `service:x.com:username:${cleanInput}`;
}

// Helper function to search for user and get name using Search API
async function fetchUserDisplayName(input: string): Promise<string | null> {
    try {
        const response = await fetch(`${ETHOS_API_BASE}/api/v1/search?query=${encodeURIComponent(input)}&limit=1`);
        
        if (!response.ok) {
            return null;
        }
        
        const data = await response.json();
        
        if (!data.ok || !data.data.values || data.data.values.length === 0) {
            return null;
        }
        
        // Return the name of the first matching user
        return data.data.values[0].name || null;
    } catch (error) {
        console.error('Error fetching user name:', error);
        return null;
    }
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
function formatProfileMessage(profileData: any, userkey: string, ethosScore: number | null, displayName: string | null = null): string {
    const { reviews, slashes, vouches } = profileData;
    
    // Use provided displayName or extract from userkey as fallback
    let finalDisplayName: string, profileUrl: string;
    
    if (displayName) {
        // Always prioritize the displayName from the search API
        finalDisplayName = displayName;
    } else if (userkey.includes('username:')) {
        finalDisplayName = userkey.split('username:')[1];
    } else if (userkey.includes('address:')) {
        // For addresses, show a shortened version if no displayName available
        const address = userkey.split('address:')[1];
        finalDisplayName = `${address.slice(0, 6)}...${address.slice(-4)}`;
    } else {
        finalDisplayName = userkey;
    }
    
    // Generate correct profile URL
    if (userkey.includes('username:')) {
        const username = userkey.split('username:')[1];
        profileUrl = `https://app.ethos.network/profile/x/${username}?source=ethos-telegram-bot`;
    } else if (userkey.includes('address:')) {
        const address = userkey.split('address:')[1];
        profileUrl = `https://app.ethos.network/profile/${address}?source=ethos-telegram-bot`;
    } else {
        profileUrl = `https://app.ethos.network/profile/${userkey}?source=ethos-telegram-bot`;
    }
    
    let message = `🔍 <b>Ethos Profile Overview</b>\n\n`;
    message += `👤 <b>User: <a href="${profileUrl}">${finalDisplayName}</a></b>\n\n`;
    
    // Display Ethos score if available
    if (ethosScore !== null) {
        message += `⭐ <b>Ethos Score: ${ethosScore}</b>\n\n`;
    } else {
        message += `⭐ <b>Ethos Score:</b> Not available\n\n`;
    }
    
    // Reviews section - only show if there are reviews
    message += `📊 <b>Reviews:</b>\n`;
    message += `\n`;
    message += `• Total Received: ${reviews.received} (${reviews.positiveReviewPercentage.toFixed(1)}%)\n`;

    if (reviews.received > 0) {
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
    }

    message += `\n`;
    message += `• <a href="${profileUrl}?modal=review&source=ethos-telegram-bot">Review ${finalDisplayName}</a>\n`;
    message += `\n`;
    
    // Vouches section
    message += `🤝 <b>Vouches:</b>\n`;
    message += `\n`;
    if (reviews.received > 0) {
        // Only show positive reviews if count > 0
        if (vouches.balance.received > 0) {
            message += `• Vouches received: ${vouches.balance.received.toFixed(4)}e (${vouches.count.received})\n`;
        }
        
        // Only show negative reviews if count > 0
        if (vouches.balance.deposited > 0) {
            message += `• Vouched for others: ${vouches.balance.deposited.toFixed(4)}e (${vouches.count.deposited})\n`;
        }
    }

    message += `\n`;
    message += `• <a href="${profileUrl}?modal=vouch&source=ethos-telegram-bot">Vouch for ${finalDisplayName}</a>\n`;

    // Slashes section    
    message += `\n`;
    if (slashes.count > 0) {
        message += `⚠️ <b>Slashes:</b>\n`;
        message += `• Count: ${slashes.count}\n`;
        if (slashes.openSlash) {
            message += `• Open Slash: Yes\n`;
        } else {
            message += `• Open Slash: None\n`;
        }
        message += `\n`;
    }
    
    return message;
}

// Helper function to create inline keyboard for profile actions
function createProfileKeyboard(userkey: string, displayName: string): any {
    // Generate correct URLs for actions
    let profileUrl: string, reviewUrl: string, vouchUrl: string;
    
    if (userkey.includes('username:')) {
        const username = userkey.split('username:')[1];
        profileUrl = `https://app.ethos.network/profile/x/${username}?source=ethos-telegram-bot`;
        reviewUrl = `https://app.ethos.network/profile/x/${username}?modal=review&source=ethos-telegram-bot`;
        vouchUrl = `https://app.ethos.network/profile/x/${username}?modal=vouch&source=ethos-telegram-bot`;
    } else if (userkey.includes('address:')) {
        const address = userkey.split('address:')[1];
        profileUrl = `https://app.ethos.network/profile/${address}?source=ethos-telegram-bot`;
        reviewUrl = `https://app.ethos.network/profile/${address}?modal=review&source=ethos-telegram-bot`;
        vouchUrl = `https://app.ethos.network/profile/${address}?modal=vouch&source=ethos-telegram-bot`;
    } else {
        profileUrl = `https://app.ethos.network/profile/${userkey}?source=ethos-telegram-bot`;
        reviewUrl = `https://app.ethos.network/profile/${userkey}?modal=review&source=ethos-telegram-bot`;
        vouchUrl = `https://app.ethos.network/profile/${userkey}?modal=vouch&source=ethos-telegram-bot`;
    }
    
    return {
        inline_keyboard: [
            [
                {
                    text: `📝 Review ${displayName}`,
                    url: reviewUrl
                },
                {
                    text: `🤝 Vouch for ${displayName}`,
                    url: vouchUrl
                }
            ],
            [
                {
                    text: `👤 View Full Profile`,
                    url: profileUrl
                }
            ]
        ]
    };
}

// Telegram API helper functions
async function sendMessage(chatId: number, text: string, parseMode = 'HTML', replyToMessageId?: number, replyMarkup?: any) {
    const body: any = {
        chat_id: chatId,
        text: text,
        parse_mode: parseMode
    };
    
    if (replyToMessageId) {
        body.reply_to_message_id = replyToMessageId;
    }
    
    if (replyMarkup) {
        body.reply_markup = replyMarkup;
    }
    
    const response = await fetch(`${TELEGRAM_API}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
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
    const messageId = message.message_id;
    const text = message.text;
    
    // Handle /start command
    if (text === '/start') {
        const welcomeMessage = `
🎉 Welcome to the Ethos Profile Bot!

I can help you look up Ethos Network profiles using Twitter handles or EVM wallet addresses.

Use /help to see available commands.

💡 <b>Pro tip:</b> You can also just send me a Twitter profile URL and I'll automatically look it up!
        `;
        await sendMessage(chatId, welcomeMessage, 'HTML', messageId);
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

<b>Auto-detection:</b>
• Send any Twitter profile URL (like https://twitter.com/vitalikbuterin or https://x.com/vitalikbuterin)
• I'll automatically extract the username and show the Ethos profile!

The bot will fetch profile data from the Ethos Network including reviews, vouches, and slashes.
        `;
        await sendMessage(chatId, helpMessage, 'HTML', messageId);
        return;
    }
    
    // Check for Twitter URLs in the message
    const twitterUrlRegex = /(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)(?:\/.*)?/i;
    const twitterMatch = text.match(twitterUrlRegex);
    
    if (twitterMatch) {
        const username = twitterMatch[1];
        
        // Skip if it's a generic Twitter page or invalid username
        if (username && !['home', 'search', 'notifications', 'messages', 'i', 'explore', 'settings'].includes(username.toLowerCase())) {
            // Send "typing" action to show bot is working
            await sendChatAction(chatId, 'typing');
            
            try {
                // Format the userkey
                const userkey = formatUserkey(username);
                console.log(`Auto-detected Twitter profile: ${username}, looking up userkey: ${userkey}`);
                
                // Fetch profile data, score, and user name
                const [profileData, ethosScore, displayName] = await Promise.all([
                    fetchEthosProfile(userkey),
                    fetchEthosScore(userkey),
                    fetchUserDisplayName(username)
                ]);
                
                // Format and send the profile message
                const responseMessage = formatProfileMessage(profileData, userkey, ethosScore, displayName);
                const finalDisplayName = displayName || (userkey.includes('username:') ? userkey.split('username:')[1] : (userkey.includes('address:') ? `${userkey.split('address:')[1].slice(0, 6)}...${userkey.split('address:')[1].slice(-4)}` : userkey));
                const keyboard = createProfileKeyboard(userkey, finalDisplayName);
                await sendMessage(chatId, responseMessage, 'HTML', messageId, keyboard);
                
            } catch (error) {
                console.error('Error in auto Twitter profile lookup:', error);
                await sendMessage(chatId, `❌ No Ethos profile found for @${username}\n\nMake sure this Twitter account has an Ethos profile.`, 'HTML', messageId);
            }
            return;
        }
    }
    
    // Handle /profile command
    const profileMatch = text.match(/^\/profile (.+)/);
    if (profileMatch) {
        const input = profileMatch[1].trim();
        
        if (!input) {
            await sendMessage(chatId, '❌ Please provide a Twitter handle or EVM address.\n\nExample: <code>/profile VitalikButerin</code>', 'HTML', messageId);
            return;
        }
        
        // Send "typing" action to show bot is working
        await sendChatAction(chatId, 'typing');
        
        try {
            // Format the userkey
            const userkey = formatUserkey(input);
            console.log(`Looking up profile for userkey: ${userkey}`);
            
            // Fetch profile data, score, and user name
            const [profileData, ethosScore, displayName] = await Promise.all([
                fetchEthosProfile(userkey),
                fetchEthosScore(userkey),
                fetchUserDisplayName(input)
            ]);
            
            // Format and send the profile message
            const responseMessage = formatProfileMessage(profileData, userkey, ethosScore, displayName);
            const finalDisplayName = displayName || (userkey.includes('username:') ? userkey.split('username:')[1] : (userkey.includes('address:') ? `${userkey.split('address:')[1].slice(0, 6)}...${userkey.split('address:')[1].slice(-4)}` : userkey));
            const keyboard = createProfileKeyboard(userkey, finalDisplayName);
            await sendMessage(chatId, responseMessage, 'HTML', messageId, keyboard);
            
        } catch (error) {
            console.error('Error in /profile command:', error);
            await sendMessage(chatId, `❌ Profile not found on Ethos Network\n\nMake sure the Twitter handle or address is correct and has an Ethos profile.`, 'HTML', messageId);
        }
    }
}

// HTTP handler for Deno Deploy
async function handler(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    // Health check endpoint
    if (url.pathname === '/health') {
        return new Response('OK', { status: 200 });
    }
    
    // Webhook endpoint for Telegram
    if (url.pathname === '/webhook' && request.method === 'POST') {
        try {
            const update = await request.json();
            await handleUpdate(update);
            return new Response('OK', { status: 200 });
        } catch (error) {
            console.error('Webhook error:', error);
            return new Response('Error', { status: 500 });
        }
    }
    
    // Set webhook endpoint (for initial setup)
    if (url.pathname === '/set-webhook' && request.method === 'GET') {
        const webhookUrl = `${url.origin}/webhook`;
        try {
            const response = await fetch(`${TELEGRAM_API}/setWebhook`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: webhookUrl })
            });
            const result = await response.json();
            return new Response(JSON.stringify(result), {
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (error) {
            return new Response(JSON.stringify({ error: error.message }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }
    
    return new Response('Not Found', { status: 404 });
}

console.log('✅ Ethos Profile Bot is ready for Deno Deploy!');

// Export the handler for Deno Deploy
export default { fetch: handler }; 