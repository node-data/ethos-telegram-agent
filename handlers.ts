import { sendMessage, sendChatAction, sendPhoto } from './telegram.ts';
import { addUserToReminders, removeUserFromReminders, getUserReminderTime, setUserReminderTime } from './database.ts';
import { parseReminderTime, formatTimeForDisplay } from './utils.ts';
import { 
    formatUserkey, 
    fetchEthosProfile, 
    fetchEthosScore, 
    getDisplayName, 
    formatProfileMessage, 
    createProfileKeyboard, 
    getEthosProfileCardUrl 
} from './ethos.ts';

// Handle incoming updates
export async function handleUpdate(update: any) {
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
🎉 Welcome to the Ethos Agent!

I can help you look up Ethos Network profiles using Twitter handles or EVM wallet addresses.

Type /help to see available commands.

💡 <b>Pro tip:</b> You can also just send me a Twitter profile URL and I'll automatically look it up!

🔔 <b>Daily Reminders:</b> You've been automatically signed up for daily contributor task reminders 2 hours before reset[10:00 PM UTC]. Use /set_reminder_time to change your preferred UTC time, or /stop_reminders if you don't want these.
        `;
        await sendMessage(chatId, welcomeMessage, 'HTML', messageId);
        return;
    }
    
    // Handle /help command
    if (text === '/help') {
        const helpMessage = `
🤖 <b>Ethos Agent Commands:</b>

/start - Show welcome message
/help - Show this help message
/profile &lt;handle_or_address&gt; - Get Ethos profile information

<b>Reminder Commands:</b>
/start_reminders - Enable daily contributor task reminders
/stop_reminders - Disable daily contributor task reminders
/set_reminder_time &lt;time&gt; - Set your preferred reminder time (UTC)
/get_reminder_time - Check your current reminder time

<b>Time Examples (UTC):</b>
• <code>/set_reminder_time 6pm</code> - 6:00 PM UTC
• <code>/set_reminder_time 18:00</code> - 6:00 PM UTC

<b>Profile Examples:</b>
• <code>/profile ethos_network</code> - Look up Twitter handle
• <code>/profile @ethos_network</code> - Look up Twitter handle (with @)
• <code>/profile 0x1234...abcd</code> - Look up EVM wallet address

<b>Auto-detection:</b>
• Send any Twitter profile URL (like https://twitter.com/ethos_network or https://x.com/ethos_network)
• I'll automatically extract the username and show the Ethos profile!

<b>Daily Reminders:</b>
• Get reminded at your chosen UTC time to complete contributor tasks
• Helps you maintain your Ethos Network streak
• All times are in UTC timezone

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
🕐 <b>Your Current Reminder Settings</b>

<b>UTC Time:</b> ${displayTime}

You will receive daily contributor task reminders at <b>${displayTime}</b>.

Use /set_reminder_time to change your time or /stop_reminders to disable them completely.
            `.trim();
            await sendMessage(chatId, confirmMessage, 'HTML', messageId);
        } else {
            const confirmMessage = `
🔕 <b>No Reminders Set</b>

You don't currently have daily reminders enabled.

Use /start_reminders to enable reminders or use /set_reminder_time to set a custom time in UTC.
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
• <code>/set_reminder_time 6pm</code> - 6:00 PM UTC
• <code>/set_reminder_time 18:00</code> - 6:00 PM UTC


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

All times are in UTC timezone.
            `.trim(), 'HTML', messageId);
            return;
        }
        
        try {
            await setUserReminderTime(chatId, parsedTime);
            const displayTime = formatTimeForDisplay(parsedTime);
            
            const confirmMessage = `
✅ <b>Reminder Time Updated!</b>

<b>UTC Time:</b> ${displayTime}

You will receive reminders at <b>${displayTime}</b> every day to help maintain your streak.
            `.trim();
            await sendMessage(chatId, confirmMessage, 'HTML', messageId);
        } catch (error) {
            console.error('Error setting reminder time:', error);
            await sendMessage(chatId, '❌ Error setting reminder time. Please try again.', 'HTML', messageId);
        }
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