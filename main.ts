import { ETHOS_API_BASE, TELEGRAM_API } from "./config.ts";
import { handleUpdate } from "./handlers.ts";
import {
  sendRemindersForHour,
  sendTaskRefreshNotifications,
  TEST_REMINDER_MESSAGE,
} from "./reminders.ts";
import {
  getAllReminderUsers,
  getReminderTimeStats,
  getUserReminderTimes,
  getUsersForReminderTime,
  getUsersForTaskRefreshNotifications,
  getUserUserkey,
} from "./database.ts";
import { sendMessage } from "./telegram.ts";
import { checkDailyContributionStatus } from "./ethos.ts";

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
  if (url.pathname === "/health") {
    return new Response("OK", { status: 200 });
  }

  // Webhook endpoint for Telegram
  if (url.pathname === "/webhook" && request.method === "POST") {
    try {
      const update = await request.json();
      await handleUpdate(update);
      return new Response("OK", { status: 200 });
    } catch (error) {
      console.error("Webhook error:", error);
      return new Response("Error", { status: 500 });
    }
  }

  // Set webhook endpoint (for initial setup)
  if (url.pathname === "/set-webhook" && request.method === "GET") {
    const webhookUrl = `${url.origin}/webhook`;
    try {
      const response = await fetch(`${TELEGRAM_API}/setWebhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: webhookUrl }),
      });
      const result = await response.json();
      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: error instanceof Error ? error.message : "Unknown error",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }

  return new Response("Not Found", { status: 404 });
}

// Export the handler for Deno Deploy
export default { fetch: handler };
