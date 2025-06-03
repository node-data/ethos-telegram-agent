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
async function addUserToReminders(chatId: number, reminderTime?: string): Promise<void> {
    try {
        // Get existing user data to preserve custom reminder time
        const existingData = await kv.get(["users", "reminders", chatId.toString()]);
        const existingTime = existingData.value?.reminderTime || "22:00";
        
        await kv.set(["users", "reminders", chatId.toString()], {
            chatId,
            addedAt: new Date().toISOString(),
            active: true,
            reminderTime: reminderTime || existingTime, // Store as "HH:MM" in UTC
            timezone: "UTC" // For future timezone support
        });
        console.log(`Added user ${chatId} to reminder list with time ${reminderTime || existingTime}`);
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

async function getUserReminderTime(chatId: number): Promise<string | null> {
    try {
        const result = await kv.get(["users", "reminders", chatId.toString()]);
        return result.value?.reminderTime || null;
    } catch (error) {
        console.error('Error getting user reminder time:', error);
        return null;
    }
}

async function setUserReminderTime(chatId: number, reminderTime: string): Promise<void> {
    try {
        const existingData = await kv.get(["users", "reminders", chatId.toString()]);
        if (existingData.value) {
            await kv.set(["users", "reminders", chatId.toString()], {
                ...existingData.value,
                reminderTime: reminderTime,
                updatedAt: new Date().toISOString()
            });
            console.log(`Updated reminder time for user ${chatId} to ${reminderTime}`);
        } else {
            // User doesn't exist, create new entry
            await addUserToReminders(chatId, reminderTime);
        }
    } catch (error) {
        console.error('Error setting user reminder time:', error);
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

async function getUsersForReminderTime(currentHour: number): Promise<number[]> {
    try {
        const users: number[] = [];
        const iter = kv.list({ prefix: ["users", "reminders"] });
        
        for await (const entry of iter) {
            const userData = entry.value as { 
                chatId: number; 
                active: boolean; 
                reminderTime: string; 
            };
            
            if (userData.active && userData.reminderTime) {
                const [hour] = userData.reminderTime.split(':').map(Number);
                if (hour === currentHour) {
                    users.push(userData.chatId);
                }
            }
        }
        
        return users;
    } catch (error) {
        console.error('Error getting users for reminder time:', error);
        return [];
    }
}

// Helper function to parse time input
function parseReminderTime(timeInput: string): string | null {
    // Remove spaces and convert to lowercase
    const cleaned = timeInput.replace(/\s+/g, '').toLowerCase();
    
    // Handle formats like "6pm", "18:00", "6:00pm", "18", etc.
    const patterns = [
        /^(\d{1,2}):(\d{2})$/,           // "18:00" or "6:30"
        /^(\d{1,2})pm$/,                // "6pm"
        /^(\d{1,2})am$/,                // "6am"  
        /^(\d{1,2}):(\d{2})pm$/,        // "6:30pm"
        /^(\d{1,2}):(\d{2})am$/,        // "6:30am"
        /^(\d{1,2})$/                   // "18" or "6"
    ];
    
    for (const pattern of patterns) {
        const match = cleaned.match(pattern);
        if (match) {
            let hour = parseInt(match[1]);
            const minute = match[2] ? parseInt(match[2]) : 0;
            
            // Handle AM/PM
            if (cleaned.includes('pm') && hour !== 12) {
                hour += 12;
            } else if (cleaned.includes('am') && hour === 12) {
                hour = 0;
            }
            
            // Validate hour and minute
            if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
                return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
            }
        }
    }
    
    return null;
}

// Format time for display
function formatTimeForDisplay(time24: string): string {
    const [hour, minute] = time24.split(':').map(Number);
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${minute.toString().padStart(2, '0')} ${period} UTC`;
}

// Hourly reminder cron job - checks every hour for users who want reminders at that time
// @ts-ignore - Deno global is available in Deno runtime
Deno.cron("Hourly Contributor Task Reminder Check", "0 * * * *", async () => {
    const currentHour = new Date().getUTCHours();
    console.log(`🔔 Checking for reminders at hour ${currentHour} UTC...`);
    
    try {
        const users = await getUsersForReminderTime(currentHour);
        
        if (users.length === 0) {
            console.log(`No users scheduled for reminders at ${currentHour}:00 UTC`);
            return;
        }
        
        console.log(`Sending reminders to ${users.length} users at ${currentHour}:00 UTC`);
        
        const reminderMessage = `
🔔 <b>Daily Reminder: Keep Your Ethos Streak Alive!</b>

Don't forget to complete your contributor tasks today to maintain your streak on the Ethos Network!

✅ <b>What you can do:</b>
• Review other users' profiles
• Vouch for trusted community members
• Participate in network governance
• Share valuable insights and feedback

⏰ <b>Time remaining:</b> Until midnight UTC (00:00)

🚀 <b>Why it matters:</b>
Consistent daily engagement helps build your reputation and strengthens the entire Ethos community.

<i>Use /stop_reminders to disable or /set_reminder_time to change your reminder time.</i>
        `.trim();
        
        let successCount = 0;
        let failureCount = 0;
        
        // Send reminders to users scheduled for this hour (with rate limiting)
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
        
        console.log(`✅ Reminder summary for ${currentHour}:00 UTC: ${successCount} sent, ${failureCount} failed`);
    } catch (error) {
        console.error('Error in hourly reminder cron job:', error);
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

🔔 <b>Daily Reminders:</b> You've been automatically signed up for daily contributor task reminders at 10:00 PM UTC. Use /set_reminder_time to pick your preferred time or /stop_reminders if you don't want these.
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

<b>Reminder Commands:</b>
/start_reminders - Enable daily contributor task reminders
/stop_reminders - Disable daily contributor task reminders
/set_reminder_time &lt;time&gt; - Set your preferred reminder time (UTC)
/get_reminder_time - Check your current reminder time

<b>Time Format Examples:</b>
• <code>/set_reminder_time 6pm</code> - 6:00 PM UTC
• <code>/set_reminder_time 18:00</code> - 6:00 PM UTC  
• <code>/set_reminder_time 9:30am</code> - 9:30 AM UTC
• <code>/set_reminder_time 21</code> - 9:00 PM UTC

<b>Profile Examples:</b>
• <code>/profile vitalikbuterin</code> - Look up Twitter handle
• <code>/profile @vitalikbuterin</code> - Look up Twitter handle (with @)
• <code>/profile 0x1234...abcd</code> - Look up EVM wallet address

<b>Auto-detection:</b>
• Send any Twitter profile URL (like https://twitter.com/vitalikbuterin or https://x.com/vitalikbuterin)
• I'll automatically extract the username and show the Ethos profile!

<b>Daily Reminders:</b>
• Get reminded at your chosen time to complete contributor tasks
• Helps you maintain your Ethos Network streak
• Default time is 22:00 UTC (10:00 PM), but you can customize it!

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
    
    // Handle /get_reminder_time command
    if (text === '/get_reminder_time') {
        const reminderTime = await getUserReminderTime(chatId);
        
        if (reminderTime) {
            const displayTime = formatTimeForDisplay(reminderTime);
            const confirmMessage = `
🕐 <b>Your Current Reminder Time</b>

You are set to receive daily contributor task reminders at <b>${displayTime}</b>.

Use /set_reminder_time to change your reminder time, or /stop_reminders to disable them completely.
            `.trim();
            await sendMessage(chatId, confirmMessage, 'HTML', messageId);
        } else {
            const confirmMessage = `
🔕 <b>No Reminders Set</b>

You don't currently have daily reminders enabled.

Use /start_reminders to enable reminders with the default time (10:00 PM UTC), or use /set_reminder_time to set a custom time.
            `.trim();
            await sendMessage(chatId, confirmMessage, 'HTML', messageId);
        }
        return;
    }
    
    // Handle /set_reminder_time command
    const setTimeMatch = text.match(/^\/set_reminder_time (.+)/);
    if (setTimeMatch) {
        const timeInput = setTimeMatch[1].trim();
        
        if (!timeInput) {
            await sendMessage(chatId, `
❌ <b>Please specify a time</b>

Examples:
• <code>/set_reminder_time 6pm</code>
• <code>/set_reminder_time 18:00</code>
• <code>/set_reminder_time 9:30am</code>
• <code>/set_reminder_time 21</code>

All times are in UTC timezone.
            `.trim(), 'HTML', messageId);
            return;
        }
        
        const parsedTime = parseReminderTime(timeInput);
        
        if (!parsedTime) {
            await sendMessage(chatId, `
❌ <b>Invalid time format</b>

Please use one of these formats:
• <b>12-hour:</b> 6pm, 9:30am, 11:45pm
• <b>24-hour:</b> 18:00, 09:30, 23:45
• <b>Hour only:</b> 18, 9, 23

All times are in UTC timezone.
            `.trim(), 'HTML', messageId);
            return;
        }
        
        await setUserReminderTime(chatId, parsedTime);
        const displayTime = formatTimeForDisplay(parsedTime);
        
        const confirmMessage = `
✅ <b>Reminder Time Updated!</b>

Your daily contributor task reminders are now set for <b>${displayTime}</b>.

You will receive reminders at this time every day to help maintain your Ethos Network streak.

<i>Remember: All times are in UTC. Use /get_reminder_time to check your current setting.</i>
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
            
            // Get hour from query parameter, default to current hour
            const hourParam = url.searchParams.get('hour');
            const testHour = hourParam ? parseInt(hourParam) : new Date().getUTCHours();
            
            const usersForHour = await getUsersForReminderTime(testHour);
            
            const reminderMessage = `
🔔 <b>TEST: Daily Reminder - Keep Your Ethos Streak Alive!</b>

This is a test of the daily reminder system. Testing for hour ${testHour}:00 UTC.

Don't forget to complete your contributor tasks today to maintain your streak on the Ethos Network!

✅ <b>What you can do:</b>
• Review other users' profiles
• Vouch for trusted community members
• Participate in network governance
• Share valuable insights and feedback

<i>This was a test message. Use /set_reminder_time to change your reminder time or /stop_reminders to disable.</i>
            `.trim();
            
            let successCount = 0;
            let failureCount = 0;
            
            // Send test reminders to users scheduled for this hour
            for (const chatId of usersForHour) {
                try {
                    await sendMessage(chatId, reminderMessage, 'HTML');
                    successCount++;
                } catch (error) {
                    console.error(`Failed to send test reminder to user ${chatId}:`, error);
                    failureCount++;
                }
            }
            
            // Get statistics about all reminder times
            const timeStats: { [key: string]: number } = {};
            const iter = kv.list({ prefix: ["users", "reminders"] });
            for await (const entry of iter) {
                const userData = entry.value as { active: boolean; reminderTime: string };
                if (userData.active && userData.reminderTime) {
                    timeStats[userData.reminderTime] = (timeStats[userData.reminderTime] || 0) + 1;
                }
            }
            
            return new Response(JSON.stringify({
                success: true,
                testHour: testHour,
                totalUsers: count,
                usersForTestHour: usersForHour.length,
                sent: successCount,
                failed: failureCount,
                message: `Test reminder sent to ${successCount}/${usersForHour.length} users scheduled for ${testHour}:00 UTC`,
                reminderTimeDistribution: timeStats
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