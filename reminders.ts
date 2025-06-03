import { getUsersForReminderTime, removeUserFromReminders } from './database.ts';
import { sendMessage } from './telegram.ts';

// Reminder message content
const REMINDER_MESSAGE = `
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

// Function to send reminders to users scheduled for a specific hour
export async function sendRemindersForHour(currentHour: number): Promise<{ success: number; failed: number }> {
    console.log(`🔔 Checking for reminders at hour ${currentHour} UTC...`);
    
    try {
        const users = await getUsersForReminderTime(currentHour);
        
        if (users.length === 0) {
            console.log(`No users scheduled for reminders at ${currentHour}:00 UTC`);
            return { success: 0, failed: 0 };
        }
        
        console.log(`Sending reminders to ${users.length} users at ${currentHour}:00 UTC`);
        
        let successCount = 0;
        let failureCount = 0;
        
        // Send reminders to users scheduled for this hour (with rate limiting)
        for (const chatId of users) {
            try {
                await sendMessage(chatId, REMINDER_MESSAGE, 'HTML');
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
        return { success: successCount, failed: failureCount };
    } catch (error) {
        console.error('Error in reminder sending:', error);
        return { success: 0, failed: 0 };
    }
}

// Test reminder message content (for testing endpoint)
export const TEST_REMINDER_MESSAGE = (testHour: number) => `
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