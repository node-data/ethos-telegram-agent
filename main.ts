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

// Telegram Bot API base URL
const TELEGRAM_API = `https://api.telegram.org/bot${token}`;
const ETHOS_API_BASE = 'https://api.ethos.network';

// Initialize Deno KV for user tracking
// @ts-ignore - Deno global is available in Deno runtime
const kv = await Deno.openKv();

console.log('🤖 Telegram bot is starting on Deno Deploy...');

// User tracking functions
async function addUserToReminders(chatId: number): Promise<void> {
    try {
        await kv.set(["users", "reminders", chatId.toString()], {
            chatId,
            addedAt: new Date().toISOString(),
            active: true
        });
        console.log(`Added user ${chatId} to reminder list`);
    } catch (error) {
        console.error('Error adding user to reminders:', error);
    }
}

async function removeUserFromReminders(chatId: number): Promise<void> {
    try {
        await kv.delete(["users", "reminders", chatId.toString()]);
        console.log(`Removed user ${chatId} from reminder list`);
    } catch (error) {
        console.error('Error removing user from reminders:', error);
    }
}

async function getAllReminderUsers(): Promise<number[]> {
    try {
        const users: number[] = [];
        const iter = kv.list({ prefix: ["users", "reminders"] });
        
        for await (const entry of iter) {
            const userData = entry.value as { chatId: number; active: boolean };
            if (userData.active) {
                users.push(userData.chatId);
            }
        }
        
        return users;
    } catch (error) {
        console.error('Error getting reminder users:', error);
        return [];
    }
}

// Daily reminder cron job - runs at 22:00 UTC (2 hours before midnight)
// @ts-ignore - Deno global is available in Deno runtime
Deno.cron("Daily Contributor Task Reminder", "0 22 * * *", async () => {
    console.log('🔔 Running daily contributor task reminder...');
    
    try {
        const users = await getAllReminderUsers();
        console.log(`Sending reminders to ${users.length} users`);
        
        const reminderMessage = `
🔔 <b>Daily Reminder: Keep Your Ethos Streak Alive!</b>

Don't forget to complete your contributor tasks today to maintain your streak on the Ethos Network!

✅ <b>What you can do:</b>
• Review other users' profiles
• Vouch for trusted community members
• Participate in network governance
• Share valuable insights and feedback

⏰ <b>Time remaining:</b> Less than 2 hours until reset (00:00 UTC)

🚀 <b>Why it matters:</b>
Consistent daily engagement helps build your reputation and strengthens the entire Ethos community.

<i>Use /stop_reminders if you no longer want to receive these daily notifications.</i>
        `.trim();
        
        let successCount = 0;
        let failureCount = 0;
        
        // Send reminders to all users (with rate limiting)
        for (const chatId of users) {
            try {
                await sendMessage(chatId, reminderMessage, 'HTML');
                successCount++;
                
                // Add small delay to avoid rate limiting
                if (users.length > 10) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            } catch (error) {
                console.error(`Failed to send reminder to user ${chatId}:`, error);
                failureCount++;
                
                // If user blocked the bot or chat doesn't exist, remove them
                if (error.error_code === 403 || error.error_code === 400) {
                    await removeUserFromReminders(chatId);
                }
            }
        }
        
        console.log(`✅ Reminder summary: ${successCount} sent, ${failureCount} failed`);
    } catch (error) {
        console.error('Error in daily reminder cron job:', error);
    }
});

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
        const response = await fetch(`${ETHOS_API_BASE}/api/v1/search?query=${encodeURIComponent(input)}&limit=2`);
        
        if (!response.ok) {
            return null;
        }
        
        const data = await response.json();
        console.log(`Search API response for "${input}":`, JSON.stringify(data, null, 2));
        
        if (!data.ok || !data.data.values || data.data.values.length === 0) {
            return null;
        }
        
        // Return the name of the first matching user
        const name = data.data.values[0].name;
        console.log(`Found name from search API: "${name}"`);
        return name || null;
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

// Helper function to get the display name from profile data or search API
async function getDisplayName(userkey: string, profileData: any, searchInput: string): Promise<string> {
    console.log(`Getting display name for userkey: ${userkey}, searchInput: ${searchInput}`);
    console.log(`Profile data:`, profileData ? JSON.stringify(profileData, null, 2) : 'null');
    
    // First priority: Use name from the profile data itself
    if (profileData && profileData.name) {
        console.log(`Using name from profile data: "${profileData.name}"`);
        return profileData.name;
    }
    
    // Second priority: Try to get name from search API using the original input
    try {
        const searchName = await fetchUserDisplayName(searchInput);
        if (searchName) {
            console.log(`Using name from search API: "${searchName}"`);
            return searchName;
        }
    } catch (error) {
        console.error('Error fetching display name from search:', error);
    }
    
    // Fallback: Extract from userkey
    let fallbackName: string;
    if (userkey.includes('username:')) {
        fallbackName = userkey.split('username:')[1];
    } else if (userkey.includes('address:')) {
        const address = userkey.split('address:')[1];
        fallbackName = `${address.slice(0, 6)}...${address.slice(-4)}`;
    } else {
        fallbackName = userkey;
    }
    
    console.log(`Using fallback name from userkey: "${fallbackName}"`);
    return fallbackName;
}

// Helper function to get Ethos profile card image URL
function getEthosProfileCardUrl(userkey: string): string {
    // Use Ethos's dynamic OG profile card endpoint
    return `https://app.ethos.network/og/profile-cards/${userkey}`;
}

// Helper function to format profile data for display
function formatProfileMessage(profileData: any, userkey: string, ethosScore: number | null, displayName: string): string {
    const { reviews, slashes, vouches } = profileData;
    
    // Generate correct profile URL
    let profileUrl: string;
    if (userkey.includes('username:')) {
        const username = userkey.split('username:')[1];
        profileUrl = `https://app.ethos.network/profile/x/${username}?source=ethos-telegram-bot`;
    } else if (userkey.includes('address:')) {
        const address = userkey.split('address:')[1];
        profileUrl = `https://app.ethos.network/profile/${address}?source=ethos-telegram-bot`;
    } else {
        profileUrl = `https://app.ethos.network/profile/${userkey}?source=ethos-telegram-bot`;
    }
    
    // Create score display
    const scoreDisplay = ethosScore !== null ? `[${ethosScore}]` : '[Score N/A]';
    
    let message = `<b>Ethos Profile: ${displayName} ${scoreDisplay}</b>\n\n`;
    
    // Reviews section
    message += `<b>Reviews received:</b>\n`;
    message += `Positive: ${reviews.positiveReviewCount} Neutral: ${reviews.neutralReviewCount} Negative: ${reviews.negativeReviewCount}\n\n`;
    
    // Vouches section
    message += `<b>Vouches received:</b> ${vouches.balance.received.toFixed(4)}e (${vouches.count.received})\n\n`;
    
    // Slashes section    
    if (slashes.count > 0) {
        message += `<b>Slashes:</b>\n`;
        message += `Count: ${slashes.count}\n`;
        if (slashes.openSlash) {
            message += `Open Slash: Yes`;
        } else {
            message += `Open Slash: None`;
        }
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
                    text: `📝 Review`,
                    url: reviewUrl
                },
                {
                    text: `🤝 Vouch`,
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

async function sendPhoto(chatId: number, photoUrl: string, caption: string, parseMode = 'HTML', replyToMessageId?: number, replyMarkup?: any) {
    const body: any = {
        chat_id: chatId,
        photo: photoUrl,
        caption: caption,
        parse_mode: parseMode
    };
    
    if (replyToMessageId) {
        body.reply_to_message_id = replyToMessageId;
    }
    
    if (replyMarkup) {
        body.reply_markup = replyMarkup;
    }
    
    const response = await fetch(`${TELEGRAM_API}/sendPhoto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    return response.json();
}

// Handle incoming updates
async function handleUpdate(update: any) {
    if (!update.message || !update.message.text) return;
    
    const message = update.message;
    const chatId = message.chat.id;
    const messageId = message.message_id;
    const text = message.text;
    
    // Auto-add users to reminder list when they interact (except for stop command)
    if (!text.startsWith('/stop_reminders')) {
        await addUserToReminders(chatId);
    }
    
    // Handle /start command
    if (text === '/start') {
        const welcomeMessage = `
🎉 Welcome to the Ethos Profile Bot!

I can help you look up Ethos Network profiles using Twitter handles or EVM wallet addresses.

Type /help to see available commands.

💡 <b>Pro tip:</b> You can also just send me a Twitter profile URL and I'll automatically look it up!

🔔 <b>Daily Reminders:</b> You've been automatically signed up for daily contributor task reminders at 22:00 UTC. Use /stop_reminders if you don't want these.
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
/start_reminders - Enable daily contributor task reminders
/stop_reminders - Disable daily contributor task reminders

<b>Examples:</b>
• <code>/profile vitalikbuterin</code> - Look up Twitter handle
• <code>/profile @vitalikbuterin</code> - Look up Twitter handle (with @)
• <code>/profile 0x1234...abcd</code> - Look up EVM wallet address

<b>Auto-detection:</b>
• Send any Twitter profile URL (like https://twitter.com/vitalikbuterin or https://x.com/vitalikbuterin)
• I'll automatically extract the username and show the Ethos profile!

<b>Daily Reminders:</b>
• Get reminded at 22:00 UTC (2 hours before midnight) to complete your contributor tasks
• Helps you maintain your Ethos Network streak

The bot will fetch profile data from the Ethos Network including reviews, vouches, and slashes.
        `;
        await sendMessage(chatId, helpMessage, 'HTML', messageId);
        return;
    }
    
    // Handle /start_reminders command
    if (text === '/start_reminders') {
        await addUserToReminders(chatId);
        const confirmMessage = `
✅ <b>Daily Reminders Enabled!</b>

You will now receive daily contributor task reminders at 22:00 UTC (2 hours before the daily reset).

These reminders help you maintain your streak on the Ethos Network by completing tasks like:
• Reviewing profiles
• Vouching for trusted users
• Participating in governance

Use /stop_reminders anytime to disable these notifications.
        `.trim();
        await sendMessage(chatId, confirmMessage, 'HTML', messageId);
        return;
    }
    
    // Handle /stop_reminders command
    if (text === '/stop_reminders') {
        await removeUserFromReminders(chatId);
        const confirmMessage = `
🔕 <b>Daily Reminders Disabled</b>

You will no longer receive daily contributor task reminders.

You can re-enable them anytime by using /start_reminders or by interacting with the bot again.
        `.trim();
        await sendMessage(chatId, confirmMessage, 'HTML', messageId);
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
                
                // Fetch profile data and score
                const [profileData, ethosScore] = await Promise.all([
                    fetchEthosProfile(userkey),
                    fetchEthosScore(userkey)
                ]);
                
                // Get the proper display name
                const displayName = await getDisplayName(userkey, profileData, username);
                
                // Format and send the profile message
                const responseMessage = formatProfileMessage(profileData, userkey, ethosScore, displayName);
                const keyboard = createProfileKeyboard(userkey, displayName);
                
                // Send photo with profile information as caption
                const ethosLogoUrl = getEthosProfileCardUrl(userkey);
                await sendPhoto(chatId, ethosLogoUrl, responseMessage, 'HTML', messageId, keyboard);
                
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
        
        // Check for null/zero address and return not found
        const cleanInput = input.replace(/^@/, '');
        if (cleanInput === '0x0000000000000000000000000000000000000000' || cleanInput === '0x0000000000000000000000000000000000000000000000000000000000000000') {
            await sendMessage(chatId, '❌ Profile not found on Ethos Network\n\nThe null address (0x000...000) does not have an Ethos profile.', 'HTML', messageId);
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
            
            // Get the proper display name
            const displayName = await getDisplayName(userkey, profileData, input);
            
            // Format and send the profile message
            const responseMessage = formatProfileMessage(profileData, userkey, ethosScore, displayName);
            const keyboard = createProfileKeyboard(userkey, displayName);
            
            // Send photo with profile information as caption
            const ethosLogoUrl = getEthosProfileCardUrl(userkey);
            await sendPhoto(chatId, ethosLogoUrl, responseMessage, 'HTML', messageId, keyboard);
            
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
    
    // Test reminder endpoint (for testing the reminder functionality)
    if (url.pathname === '/test-reminder' && request.method === 'GET') {
        try {
            const users = await getAllReminderUsers();
            const count = users.length;
            
            const reminderMessage = `
🔔 <b>TEST: Daily Reminder - Keep Your Ethos Streak Alive!</b>

This is a test of the daily reminder system. The actual reminders are sent at 22:00 UTC.

Don't forget to complete your contributor tasks today to maintain your streak on the Ethos Network!

✅ <b>What you can do:</b>
• Review other users' profiles
• Vouch for trusted community members
• Participate in network governance
• Share valuable insights and feedback

<i>This was a test message. Use /stop_reminders if you don't want daily notifications.</i>
            `.trim();
            
            let successCount = 0;
            let failureCount = 0;
            
            // Send test reminders to all users
            for (const chatId of users) {
                try {
                    await sendMessage(chatId, reminderMessage, 'HTML');
                    successCount++;
                } catch (error) {
                    console.error(`Failed to send test reminder to user ${chatId}:`, error);
                    failureCount++;
                }
            }
            
            return new Response(JSON.stringify({
                success: true,
                totalUsers: count,
                sent: successCount,
                failed: failureCount,
                message: `Test reminder sent to ${successCount}/${count} users`
            }), {
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (error) {
            console.error('Test reminder error:', error);
            return new Response(JSON.stringify({ 
                success: false, 
                error: error instanceof Error ? error.message : 'Unknown error' 
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
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
            return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
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