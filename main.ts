import { TELEGRAM_API, ETHOS_API_BASE } from './config.ts';
import { handleUpdate } from './handlers.ts';
import { sendRemindersForHour, TEST_REMINDER_MESSAGE, sendTaskRefreshNotifications } from './reminders.ts';
import { 
    getAllReminderUsers, 
    getUsersForReminderTime, 
    getUserReminderTimes,
    getReminderTimeStats,
    getUsersForTaskRefreshNotifications,
    getUserUserkey
} from './database.ts';
import { sendMessage } from './telegram.ts';
import { checkDailyContributionStatus } from './ethos.ts';

console.log('🤖 Telegram bot is starting on Deno Deploy...');

// Hourly reminder cron job - checks every hour for users who want reminders at that time
// @ts-ignore - Deno global is available in Deno runtime
Deno.cron("Hourly Contributor Task Reminder Check", "0 * * * *", async () => {
    const currentHour = new Date().getUTCHours();
    await sendRemindersForHour(currentHour);
});

// Task refresh notification cron job - sends notification to opted-in users at midnight UTC
// @ts-ignore - Deno global is available in Deno runtime
Deno.cron("Daily Task Refresh Notification", "0 0 * * *", async () => {
    await sendTaskRefreshNotifications();
});

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
            
            // Use the actual reminder function for testing to include task completion checking
            const reminderResult = await sendRemindersForHour(testHour);
            
            // Get users scheduled for this hour for additional info
            const usersForHour = await getUsersForReminderTime(testHour);
            
            // Get statistics about all reminder times
            const timeStats = await getReminderTimeStats();
            
            return new Response(JSON.stringify({
                success: true,
                testHour: testHour,
                totalUsers: count,
                usersForTestHour: usersForHour.length,
                sent: reminderResult.success,
                failed: reminderResult.failed,
                skipped: reminderResult.skipped,
                message: `Test reminder sent to ${reminderResult.success}/${usersForHour.length} users scheduled for ${testHour}:00 UTC (${reminderResult.skipped} skipped - tasks completed)`,
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
    
    // Test task refresh notifications endpoint
    if (url.pathname === '/test-task-refresh' && request.method === 'GET') {
        try {
            const allUsers = await getAllReminderUsers();
            const taskRefreshUsers = await getUsersForTaskRefreshNotifications();
            
            let successCount = 0;
            let failureCount = 0;
            
            // Send test task refresh notifications to opted-in users
            for (const chatId of taskRefreshUsers) {
                try {
                    const testMessage = `
<b>TEST: New Day, New Opportunities!</b>

This is a test of the task refresh notification system.

Your contributor tasks are available again!

<b>Ready to contribute?</b> Start your streak or keep it going today!

<i>This was a test message. Use /disable_task_refresh to turn these off.</i>
                    `.trim();
                    
                    await sendMessage(chatId, testMessage, 'HTML');
                    successCount++;
                } catch (error) {
                    console.error(`Failed to send test task refresh notification to user ${chatId}:`, error);
                    failureCount++;
                }
            }
            
            return new Response(JSON.stringify({
                success: true,
                totalUsers: allUsers.length,
                taskRefreshOptedInUsers: taskRefreshUsers.length,
                sent: successCount,
                failed: failureCount,
                message: `Test task refresh notification sent to ${successCount}/${taskRefreshUsers.length} opted-in users`,
                optInPercentage: Math.round((taskRefreshUsers.length / Math.max(allUsers.length, 1)) * 100)
            }), {
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (error) {
            console.error('Test task refresh notification error:', error);
            return new Response(JSON.stringify({ 
                success: false, 
                error: error instanceof Error ? error.message : 'Unknown error' 
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }
    
    // Personal test reminder endpoint (for testing with specific user)
    if (url.pathname === '/test-reminder-user' && request.method === 'GET') {
        try {
            const chatIdParam = url.searchParams.get('chatId');
            if (!chatIdParam) {
                return new Response(JSON.stringify({ 
                    success: false, 
                    error: 'Missing chatId parameter. Use: /test-reminder-user?chatId=YOUR_CHAT_ID' 
                }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
            
            const testChatId = parseInt(chatIdParam);
            if (isNaN(testChatId)) {
                return new Response(JSON.stringify({ 
                    success: false, 
                    error: 'Invalid chatId. Must be a number.' 
                }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
            
            // Use imported functions
            
            // Test the smart reminder logic for this specific user
            console.log(`Testing smart reminder logic for user ${testChatId}`);
            
            let result = {
                chatId: testChatId,
                hasUserkey: false,
                userkey: null as string | null,
                profileId: null as number | null,
                taskStatus: null as any,
                action: '',
                message: '',
                success: false
            };
            
            try {
                // Check if user has a userkey stored
                const userkey = await getUserUserkey(testChatId);
                result.hasUserkey = !!userkey;
                result.userkey = userkey;
                
                if (userkey) {
                    // First get the profileId for debugging
                    try {
                        const profileResponse = await fetch(`${ETHOS_API_BASE}/api/v1/users/${userkey}/stats`);
                        if (profileResponse.ok) {
                            const profileData = await profileResponse.json();
                            if (profileData.ok && profileData.data.profileId) {
                                result.profileId = profileData.data.profileId;
                            }
                        }
                    } catch (error) {
                        console.error('Error fetching profileId for debugging:', error);
                    }
                    
                    // Check if user has already completed their daily tasks
                    const contributionStatus = await checkDailyContributionStatus(userkey);
                    result.taskStatus = contributionStatus;
                    
                    if (contributionStatus && !contributionStatus.canGenerate) {
                        // User has already completed their daily tasks - send test skip message
                        result.action = 'skipped';
                        const testMessage = `
🧪 <b>TEST: Smart Reminder Skipped!</b>

You would have received a daily task reminder right now, but our smart system detected that you've already completed your contributor tasks today! 

✅ <b>Tasks completed</b> - No reminder needed
🧠 <b>Smart reminders working correctly</b>

<i>This is a temporary test message that will be removed after testing.</i>
                        `.trim();
                        
                        await sendMessage(testChatId, testMessage, 'HTML');
                        result.message = 'Test skip message sent - tasks already completed';
                        result.success = true;
                    } else {
                        // User hasn't completed tasks - send normal reminder
                        result.action = 'reminder_sent';
                        const testReminderMessage = `
🔔 <b>TEST: Daily Reminder - Keep Your Streak Alive!</b>

This is a test of the smart reminder system. You would normally receive this reminder because you haven't completed your contributor tasks yet today.

Don't forget to complete your contributor tasks today to maintain your streak!

<i>This was a test message. Your smart reminders are working correctly!</i>
                        `.trim();
                        
                        await sendMessage(testChatId, testReminderMessage, 'HTML');
                        result.message = 'Test reminder sent - tasks not completed yet';
                        result.success = true;
                    }
                } else {
                    // No userkey stored - would send regular reminder
                    result.action = 'no_userkey';
                    const testMessage = `
🔔 <b>TEST: Regular Reminder (No Smart Features)</b>

You don't have a userkey set, so you would receive all scheduled reminders regardless of task completion.

Use /set_userkey &lt;handle_or_address&gt; to enable smart reminders that only send when you haven't completed your daily tasks.

<i>This was a test message.</i>
                    `.trim();
                    
                    await sendMessage(testChatId, testMessage, 'HTML');
                    result.message = 'Test reminder sent - no userkey configured';
                    result.success = true;
                }
            } catch (messageError) {
                result.success = false;
                result.message = `Failed to send test message: ${messageError}`;
            }
            
            return new Response(JSON.stringify({
                success: true,
                testType: 'personal',
                result: result
            }), {
                headers: { 'Content-Type': 'application/json' }
            });
            
        } catch (error) {
            console.error('Personal test reminder error:', error);
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