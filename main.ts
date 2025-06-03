import { TELEGRAM_API } from './config.ts';
import { handleUpdate } from './handlers.ts';
import { sendRemindersForHour, TEST_REMINDER_MESSAGE } from './reminders.ts';
import { 
    getAllReminderUsers, 
    getUsersForReminderTime, 
    getReminderTimeStats 
} from './database.ts';
import { sendMessage } from './telegram.ts';

console.log('🤖 Telegram bot is starting on Deno Deploy...');

// Hourly reminder cron job - checks every hour for users who want reminders at that time
// @ts-ignore - Deno global is available in Deno runtime
Deno.cron("Hourly Contributor Task Reminder Check", "0 * * * *", async () => {
    const currentHour = new Date().getUTCHours();
    await sendRemindersForHour(currentHour);
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
            
            const usersForHour = await getUsersForReminderTime(testHour);
            
            const reminderMessage = TEST_REMINDER_MESSAGE(testHour);
            
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
            const timeStats = await getReminderTimeStats();
            
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