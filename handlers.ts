import { sendChatAction, sendMessage, sendPhoto } from "./telegram.ts";
import {
  addUserReminderTime,
  addUserToReminders,
  getUserReminderTime,
  getUserReminderTimes,
  getUserTaskRefreshNotifications,
  getUserUserkey,
  removeUserFromReminders,
  removeUserReminderTime,
  setUserReminderTime,
  setUserTaskRefreshNotifications,
  setUserUserkey,
} from "./database.ts";
import { formatTimeForDisplay, parseReminderTime } from "./utils.ts";
import {
  createProfileKeyboard,
  fetchEthosProfile,
  fetchEthosScore,
  formatProfileMessage,
  formatUserkey,
  getDisplayName,
  getEthosProfileCardUrl,
} from "./ethos.ts";

// Handle incoming updates
export async function handleUpdate(update: any) {
  if (!update.message || !update.message.text) return;

  const message = update.message;
  const chatId = message.chat.id;
  const messageId = message.message_id;
  const text = message.text;

  // Auto-add users to reminder list when they interact (except for stop/disable commands)
  if (
    !text.startsWith("/disable_task_reminders") &&
    !text.startsWith("/stop_reminders")
  ) {
    await addUserToReminders(chatId);
  }

  // Handle /start command
  if (text === "/start") {
    const welcomeMessage = `
<b>Welcome to the Ethos Agent!</b>

I can help you look up Ethos Network profiles using Twitter handles or EVM wallet addresses.

Type /help to see available commands.

You can also just send me a Twitter profile URL and I'll automatically look it up!

<b>Daily task reminders:</b> You've been automatically signed up for daily contributor task reminders 2 hours before reset[10:00 PM UTC]. Use /set_reminder_time to change your preferred UTC time, or /disable_task_reminders if you don't want these.

<b>Multiple reminders:</b> You can set up to 3 reminder times per day! Use /add_reminder_time to add more reminders and /list_reminder_times to see all your times.

<b>Task refresh notifications:</b> You'll also receive daily reset notifications at midnight UTC. Use /disable_task_refresh to turn these off if you prefer.
        `;
    await sendMessage(chatId, welcomeMessage, "HTML", messageId);
    return;
  }

  // Handle /help command
  if (text === "/help") {
    const helpMessage = `
<b>Ethos Agent Commands:</b>

/start - Show welcome message
/help - Show this help message
/profile &lt;handle_or_address&gt; - Get Ethos profile information

<b>Reminder Commands:</b>
/enable_task_reminders - Enable daily contributor task reminders
/disable_task_reminders - Disable daily contributor task reminders
/set_reminder_time &lt;time&gt; - Set your preferred reminder time (UTC)
/get_reminder_time - Check your current reminder time
/list_reminder_times - Show all your reminder times
/add_reminder_time &lt;time&gt; - Add another reminder time (max 3)
/remove_reminder_time &lt;time&gt; - Remove a specific reminder time

<b>Task Refresh Notification Commands:</b>
/enable_task_refresh - Enable daily reset notifications at midnight UTC
/disable_task_refresh - Disable task refresh notifications
/get_task_refresh - Check your task refresh notification status

<b>Smart Reminder Commands:</b>
/set_userkey &lt;handle_or_address&gt; - Set your Ethos userkey for smart reminders
/get_userkey - Check your stored userkey
/clear_userkey - Remove stored userkey (get all reminders)

<b>Time Examples (UTC):</b>
• <code>/set_reminder_time 6pm</code> - 6:00 PM UTC
• <code>/add_reminder_time 18:00</code> - 6:00 PM UTC
• <code>/remove_reminder_time 9am</code> - 9:00 AM UTC

<b>Profile Examples:</b>
• <code>/profile ethos_network</code> - Look up Twitter handle
• <code>/profile @ethos_network</code> - Look up Twitter handle (with @)
• <code>/profile 0x1234...abcd</code> - Look up EVM wallet address

<b>Auto-detection:</b>
• Send any Twitter profile URL (like https://twitter.com/ethos_network or https://x.com/ethos_network)
• I'll automatically extract the username and show the Ethos profile!
• To do this in groups I need admin access but you can turn off the permissions.

<b>Daily Notifications:</b>
• <b>Reminders:</b> Get reminded at your chosen UTC time(s) to complete contributor tasks
• <b>Task Refresh Notifications:</b> Get notified when tasks reset at midnight UTC
• <b>Smart Reminders:</b> Set your userkey to only get reminders if you haven't completed tasks yet
• Both help you maintain your Ethos Network streak
• You can set up to 3 reminder times per day
• All times are in UTC timezone

The bot will fetch profile data from the Ethos Network including reviews, vouches, and slashes.
        `;
    await sendMessage(chatId, helpMessage, "HTML", messageId);
    return;
  }

  // Handle /enable_task_reminders command
  if (text === "/enable_task_reminders") {
    await addUserToReminders(chatId);
    const confirmMessage = `
✅ <b>Daily Reminders Enabled!</b>

You will now receive daily contributor task reminders at 22:00 UTC (2 hours before the daily reset).

Use /disable_task_reminders anytime to disable these notifications.
        `.trim();
    await sendMessage(chatId, confirmMessage, "HTML", messageId);
    return;
  }

  // Handle /disable_task_reminders command
  if (text === "/disable_task_reminders") {
    await removeUserFromReminders(chatId);
    const confirmMessage = `
🔕 <b>Daily Reminders Disabled</b>

You will no longer receive daily contributor task reminders.

You can re-enable them anytime by using /enable_task_reminders.
        `.trim();
    await sendMessage(chatId, confirmMessage, "HTML", messageId);
    return;
  }

  // Keep old command names for backward compatibility
  if (text === "/start_reminders") {
    await addUserToReminders(chatId);
    const confirmMessage = `
✅ <b>Daily Reminders Enabled!</b>

You will now receive daily contributor task reminders at 22:00 UTC (2 hours before the daily reset).

Use /disable_task_reminders anytime to disable these notifications.

<i>Note: /start_reminders is now /enable_task_reminders for consistency.</i>
        `.trim();
    await sendMessage(chatId, confirmMessage, "HTML", messageId);
    return;
  }

  // Keep old command names for backward compatibility
  if (text === "/stop_reminders") {
    await removeUserFromReminders(chatId);
    const confirmMessage = `
🔕 <b>Daily Reminders Disabled</b>

You will no longer receive daily contributor task reminders.

You can re-enable them anytime by using /enable_task_reminders.

<i>Note: /stop_reminders is now /disable_task_reminders for consistency.</i>
        `.trim();
    await sendMessage(chatId, confirmMessage, "HTML", messageId);
    return;
  }

  // Handle /get_reminder_time command
  if (text === "/get_reminder_time") {
    const reminderTime = await getUserReminderTime(chatId);

    if (reminderTime) {
      const displayTime = formatTimeForDisplay(reminderTime);

      const confirmMessage = `
<b>Your Current Reminder Settings</b>

<b>UTC Time:</b> ${displayTime}

You will receive daily contributor task reminders at <b>${displayTime}</b>.

Use /set_reminder_time to change your time or /disable_task_reminders to disable them completely.

<i>💡 Tip: Use /list_reminder_times to see all your reminders or /add_reminder_time to add more (up to 3 total).</i>
            `.trim();
      await sendMessage(chatId, confirmMessage, "HTML", messageId);
    } else {
      const confirmMessage = `
🔕 <b>No Reminders Set</b>

You don't currently have daily reminders enabled.

Use /enable_task_reminders to enable reminders or use /set_reminder_time to set a custom time in UTC.
            `.trim();
      await sendMessage(chatId, confirmMessage, "HTML", messageId);
    }
    return;
  }

  // Handle /list_reminder_times command
  if (text === "/list_reminder_times") {
    const reminderTimes = await getUserReminderTimes(chatId);

    if (reminderTimes.length === 0) {
      const confirmMessage = `
🔕 <b>No Reminders Set</b>

You don't currently have any reminder times configured.

Use /add_reminder_time or /set_reminder_time to add reminders.
            `.trim();
      await sendMessage(chatId, confirmMessage, "HTML", messageId);
    } else {
      const timesList = reminderTimes
        .map((time) => `• <b>${formatTimeForDisplay(time)}</b>`)
        .join("\n");

      const confirmMessage = `
<b>Your Reminder Times (${reminderTimes.length}/3)</b>

${timesList}

You will receive daily contributor task reminders at these times.

<b>Commands:</b>
• /add_reminder_time &lt;time&gt; - Add another reminder (max 3)
• /remove_reminder_time &lt;time&gt; - Remove a specific time
• /disable_task_reminders - Disable all reminders
            `.trim();
      await sendMessage(chatId, confirmMessage, "HTML", messageId);
    }
    return;
  }

  // Handle /set_reminder_time command
  const setTimeMatch = text.match(/^\/set_reminder_time (.+)/);
  if (setTimeMatch) {
    const timeInput = setTimeMatch[1].trim();

    if (!timeInput) {
      await sendMessage(
        chatId,
        `
❌ <b>Please specify a time</b>

Examples:
• <code>/set_reminder_time 6pm</code> - 6:00 PM UTC
• <code>/set_reminder_time 18:00</code> - 6:00 PM UTC

All times are in UTC timezone.

<i>💡 Tip: This will replace all your current reminders with this single time. Use /add_reminder_time to add additional reminders.</i>
            `.trim(),
        "HTML",
        messageId,
      );
      return;
    }

    const parsedTime = parseReminderTime(timeInput);

    if (!parsedTime) {
      await sendMessage(
        chatId,
        `
❌ <b>Invalid time format</b>

Please use one of these formats:
• <b>12-hour:</b> 6pm, 9:30am, 11:45pm
• <b>24-hour:</b> 18:00, 09:30, 23:45

All times are in UTC timezone.
            `.trim(),
        "HTML",
        messageId,
      );
      return;
    }

    try {
      await setUserReminderTime(chatId, parsedTime);
      const displayTime = formatTimeForDisplay(parsedTime);

      const confirmMessage = `
✅ <b>Reminder Time Updated!</b>

<b>UTC Time:</b> ${displayTime}

You will receive reminders at <b>${displayTime}</b> every day to help maintain your streak.

<i>💡 Tip: Use /add_reminder_time to add up to 2 more reminder times, or /list_reminder_times to see all your reminders.</i>
            `.trim();
      await sendMessage(chatId, confirmMessage, "HTML", messageId);
    } catch (error) {
      console.error("Error setting reminder time:", error);
      await sendMessage(
        chatId,
        "❌ Error setting reminder time. Please try again.",
        "HTML",
        messageId,
      );
    }
    return;
  }

  // Handle /add_reminder_time command
  const addTimeMatch = text.match(/^\/add_reminder_time (.+)/);
  if (addTimeMatch) {
    const timeInput = addTimeMatch[1].trim();

    if (!timeInput) {
      await sendMessage(
        chatId,
        `
❌ <b>Please specify a time</b>

Examples:
• <code>/add_reminder_time 6pm</code> - 6:00 PM UTC
• <code>/add_reminder_time 18:00</code> - 6:00 PM UTC

All times are in UTC timezone.
You can have up to 3 reminder times total.
            `.trim(),
        "HTML",
        messageId,
      );
      return;
    }

    const parsedTime = parseReminderTime(timeInput);

    if (!parsedTime) {
      await sendMessage(
        chatId,
        `
❌ <b>Invalid time format</b>

Please use one of these formats:
• <b>12-hour:</b> 6pm, 9:30am, 11:45pm
• <b>24-hour:</b> 18:00, 09:30, 23:45

All times are in UTC timezone.
            `.trim(),
        "HTML",
        messageId,
      );
      return;
    }

    try {
      const result = await addUserReminderTime(chatId, parsedTime);

      if (result.success) {
        const displayTime = formatTimeForDisplay(parsedTime);
        const currentTimes = await getUserReminderTimes(chatId);

        const confirmMessage = `
✅ <b>Reminder Added!</b>

<b>New Time:</b> ${displayTime}
<b>Total Reminders:</b> ${currentTimes.length}/3

Use /list_reminder_times to see all your reminders.
                `.trim();
        await sendMessage(chatId, confirmMessage, "HTML", messageId);
      } else {
        await sendMessage(
          chatId,
          `❌ <b>Could not add reminder</b>\n\n${result.message}`,
          "HTML",
          messageId,
        );
      }
    } catch (error) {
      console.error("Error adding reminder time:", error);
      await sendMessage(
        chatId,
        "❌ Error adding reminder time. Please try again.",
        "HTML",
        messageId,
      );
    }
    return;
  }

  // Handle /remove_reminder_time command
  const removeTimeMatch = text.match(/^\/remove_reminder_time (.+)/);
  if (removeTimeMatch) {
    const timeInput = removeTimeMatch[1].trim();

    if (!timeInput) {
      await sendMessage(
        chatId,
        `
❌ <b>Please specify a time</b>

Examples:
• <code>/remove_reminder_time 6pm</code> - 6:00 PM UTC
• <code>/remove_reminder_time 18:00</code> - 6:00 PM UTC

Use /list_reminder_times to see your current reminders.
            `.trim(),
        "HTML",
        messageId,
      );
      return;
    }

    const parsedTime = parseReminderTime(timeInput);

    if (!parsedTime) {
      await sendMessage(
        chatId,
        `
❌ <b>Invalid time format</b>

Please use one of these formats:
• <b>12-hour:</b> 6pm, 9:30am, 11:45pm
• <b>24-hour:</b> 18:00, 09:30, 23:45

Use /list_reminder_times to see your current reminders.
            `.trim(),
        "HTML",
        messageId,
      );
      return;
    }

    try {
      const result = await removeUserReminderTime(chatId, parsedTime);

      if (result.success) {
        const displayTime = formatTimeForDisplay(parsedTime);
        const currentTimes = await getUserReminderTimes(chatId);

        const confirmMessage = `
✅ <b>Reminder Removed!</b>

<b>Removed Time:</b> ${displayTime}
<b>Remaining Reminders:</b> ${currentTimes.length}/3

${
          currentTimes.length > 0
            ? "Use /list_reminder_times to see your remaining reminders."
            : "You now have no active reminders. Use /add_reminder_time to add new ones."
        }
                `.trim();
        await sendMessage(chatId, confirmMessage, "HTML", messageId);
      } else {
        await sendMessage(
          chatId,
          `❌ <b>Could not remove reminder</b>\n\n${result.message}`,
          "HTML",
          messageId,
        );
      }
    } catch (error) {
      console.error("Error removing reminder time:", error);
      await sendMessage(
        chatId,
        "❌ Error removing reminder time. Please try again.",
        "HTML",
        messageId,
      );
    }
    return;
  }

  // Handle /enable_task_refresh command
  if (text === "/enable_task_refresh") {
    try {
      await setUserTaskRefreshNotifications(chatId, true);
      const confirmMessage = `
<b>Task refresh notifications enabled</b>

You will now receive daily reset notifications at midnight UTC (00:00).

These notifications let you know when:
• New contributor tasks are available
• Your daily streak opportunities reset
• It's time to start contributing for the day

Use /disable_task_refresh to turn these off anytime.
            `.trim();
      await sendMessage(chatId, confirmMessage, "HTML", messageId);
    } catch (error) {
      console.error("Error enabling task refresh notifications:", error);
      await sendMessage(
        chatId,
        "❌ Error enabling task refresh notifications. Please try again.",
        "HTML",
        messageId,
      );
    }
    return;
  }

  // Handle /disable_task_refresh command
  if (text === "/disable_task_refresh") {
    try {
      await setUserTaskRefreshNotifications(chatId, false);
      const confirmMessage = `
🔕 <b>Task Refresh Notifications Disabled</b>

You will no longer receive daily reset notifications at midnight UTC.

You can still receive your regular task reminders if they're enabled. Use /enable_task_refresh to turn task refresh notifications back on anytime.
            `.trim();
      await sendMessage(chatId, confirmMessage, "HTML", messageId);
    } catch (error) {
      console.error("Error disabling task refresh notifications:", error);
      await sendMessage(
        chatId,
        "❌ Error disabling task refresh notifications. Please try again.",
        "HTML",
        messageId,
      );
    }
    return;
  }

  // Handle /get_task_refresh command
  if (text === "/get_task_refresh") {
    try {
      const taskRefreshEnabled = await getUserTaskRefreshNotifications(chatId);

      if (taskRefreshEnabled === null) {
        const confirmMessage = `
❓ <b>No Settings Found</b>

You haven't interacted with the notification system yet.

Use /enable_task_refresh to start receiving daily reset notifications at midnight UTC.
                `.trim();
        await sendMessage(chatId, confirmMessage, "HTML", messageId);
      } else if (taskRefreshEnabled) {
        const confirmMessage = `
<b>Task Refresh Notifications: ENABLED</b>

You will receive daily reset notifications at midnight UTC (00:00) when new contributor tasks become available.

Use /disable_task_refresh to turn these off.
                `.trim();
        await sendMessage(chatId, confirmMessage, "HTML", messageId);
      } else {
        const confirmMessage = `
🔕 <b>Task Refresh Notifications: DISABLED</b>

You will not receive daily reset notifications at midnight UTC.

Use /enable_task_refresh to turn these on.
                `.trim();
        await sendMessage(chatId, confirmMessage, "HTML", messageId);
      }
    } catch (error) {
      console.error("Error getting task refresh notifications status:", error);
      await sendMessage(
        chatId,
        "❌ Error checking task refresh notification status. Please try again.",
        "HTML",
        messageId,
      );
    }
    return;
  }

  // Handle /set_userkey command
  const setUserkeyMatch = text.match(/^\/set_userkey (.+)/);
  if (setUserkeyMatch) {
    const input = setUserkeyMatch[1].trim();

    if (!input) {
      await sendMessage(
        chatId,
        "❌ Please provide a Twitter handle or EVM address.\n\nExample: <code>/set_userkey ethos_network</code>",
        "HTML",
        messageId,
      );
      return;
    }

    try {
      // Format the userkey
      const userkey = formatUserkey(input);
      console.log(`Setting userkey for user ${chatId}: ${userkey}`);
      console.log(`Debug: chatId type: ${typeof chatId}, value: ${chatId}`);

      // Store the userkey for this user
      await setUserUserkey(chatId, userkey);

      // Immediately verify the userkey was stored
      const storedUserkey = await getUserUserkey(chatId);
      console.log(
        `Debug: Immediate verification - stored userkey: ${storedUserkey}`,
      );

      const confirmMessage = `
✅ <b>Smart Reminders Enabled!</b>

Your userkey has been set successfully. You will now only receive reminders if you haven't completed your daily contributor tasks.

<b>Userkey:</b> <code>${userkey}</code>

If you complete your daily tasks, reminders will be automatically skipped for that day.

Use /clear_userkey to remove this setting and get all reminders again.
            `.trim();
      await sendMessage(chatId, confirmMessage, "HTML", messageId);
    } catch (error) {
      console.error("Error setting userkey:", error);
      await sendMessage(
        chatId,
        "❌ Error setting userkey. Please try again.",
        "HTML",
        messageId,
      );
    }
    return;
  }

  // Handle /get_userkey command
  if (text === "/get_userkey") {
    try {
      console.log(
        `Debug: Getting userkey for chatId: ${chatId}, type: ${typeof chatId}`,
      );
      const userkey = await getUserUserkey(chatId);
      console.log(`Debug: Retrieved userkey: ${userkey}`);

      if (userkey) {
        const confirmMessage = `
<b>Your Current Userkey</b>

<b>Userkey:</b> <code>${userkey}</code>

Smart reminders are <b>ENABLED</b> - you'll only get reminders if you haven't completed your daily contributor tasks.

Use /clear_userkey to remove this setting and get all reminders again.
                `.trim();
        await sendMessage(chatId, confirmMessage, "HTML", messageId);
      } else {
        const confirmMessage = `
❓ <b>No Userkey Set</b>

You haven't set a userkey yet. You'll receive all scheduled reminders regardless of task completion.

Use /set_userkey &lt;handle_or_address&gt; to enable smart reminders that only send when you haven't completed your daily tasks.
                `.trim();
        await sendMessage(chatId, confirmMessage, "HTML", messageId);
      }
    } catch (error) {
      console.error("Error getting userkey:", error);
      await sendMessage(
        chatId,
        "❌ Error checking userkey. Please try again.",
        "HTML",
        messageId,
      );
    }
    return;
  }

  // Handle /clear_userkey command
  if (text === "/clear_userkey") {
    try {
      const currentUserkey = await getUserUserkey(chatId);

      if (currentUserkey) {
        await setUserUserkey(chatId, ""); // Set to empty string to clear

        const confirmMessage = `
✅ <b>Userkey Cleared</b>

Your userkey has been removed. You will now receive all scheduled reminders regardless of task completion status.

Use /set_userkey &lt;handle_or_address&gt; anytime to re-enable smart reminders.
                `.trim();
        await sendMessage(chatId, confirmMessage, "HTML", messageId);
      } else {
        const confirmMessage = `
❓ <b>No Userkey to Clear</b>

You don't have a userkey set. You're already receiving all scheduled reminders.

Use /set_userkey &lt;handle_or_address&gt; to enable smart reminders.
                `.trim();
        await sendMessage(chatId, confirmMessage, "HTML", messageId);
      }
    } catch (error) {
      console.error("Error clearing userkey:", error);
      await sendMessage(
        chatId,
        "❌ Error clearing userkey. Please try again.",
        "HTML",
        messageId,
      );
    }
    return;
  }

  // Check for Twitter URLs in the message
  const twitterUrlRegex =
    /(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)(?:\/.*)?/i;
  const twitterMatch = text.match(twitterUrlRegex);

  if (twitterMatch) {
    const username = twitterMatch[1];

    // Skip if it's a generic Twitter page or invalid username
    if (
      username &&
      ![
        "home",
        "search",
        "notifications",
        "messages",
        "i",
        "explore",
        "settings",
      ].includes(username.toLowerCase())
    ) {
      // Send "typing" action to show bot is working
      await sendChatAction(chatId, "typing");

      try {
        // Format the userkey
        const userkey = formatUserkey(username);
        console.log(
          `Auto-detected Twitter profile: ${username}, looking up userkey: ${userkey}`,
        );

        // Fetch profile data and score
        const [profileData, ethosScore] = await Promise.all([
          fetchEthosProfile(userkey),
          fetchEthosScore(userkey),
        ]);

        // Get the proper display name
        const displayName = await getDisplayName(
          userkey,
          profileData,
          username,
        );

        // Format and send the profile message
        const responseMessage = formatProfileMessage(
          profileData,
          userkey,
          ethosScore,
          displayName,
        );
        const keyboard = createProfileKeyboard(userkey, displayName);

        // Send photo with profile information as caption
        const ethosLogoUrl = getEthosProfileCardUrl(userkey);
        await sendPhoto(
          chatId,
          ethosLogoUrl,
          responseMessage,
          "HTML",
          messageId,
          keyboard,
        );
      } catch (error) {
        console.error("Error in auto Twitter profile lookup:", error);
        await sendMessage(
          chatId,
          `❌ No Ethos profile found for @${username}\n\nMake sure this Twitter account has an Ethos profile.`,
          "HTML",
          messageId,
        );
      }
      return;
    }
  }

  // Handle /profile command
  const profileMatch = text.match(/^\/profile (.+)/);
  if (profileMatch) {
    const input = profileMatch[1].trim();

    if (!input) {
      await sendMessage(
        chatId,
        "❌ Please provide a Twitter handle or EVM address.\n\nExample: <code>/profile ethos_network</code>",
        "HTML",
        messageId,
      );
      return;
    }

    // Check for null/zero address and return not found
    const cleanInput = input.replace(/^@/, "");
    if (
      cleanInput === "0x0000000000000000000000000000000000000000" ||
      cleanInput ===
        "0x0000000000000000000000000000000000000000000000000000000000000000"
    ) {
      await sendMessage(
        chatId,
        "❌ Profile not found on Ethos Network\n\nThe null address (0x000...000) does not have an Ethos profile.",
        "HTML",
        messageId,
      );
      return;
    }

    // Send "typing" action to show bot is working
    await sendChatAction(chatId, "typing");

    try {
      // Format the userkey
      const userkey = formatUserkey(input);
      console.log(`Looking up profile for userkey: ${userkey}`);

      // Fetch profile data and score
      const [profileData, ethosScore] = await Promise.all([
        fetchEthosProfile(userkey),
        fetchEthosScore(userkey),
      ]);

      // Get the proper display name
      const displayName = await getDisplayName(userkey, profileData, input);

      // Format and send the profile message
      const responseMessage = formatProfileMessage(
        profileData,
        userkey,
        ethosScore,
        displayName,
      );
      const keyboard = createProfileKeyboard(userkey, displayName);

      // Send photo with profile information as caption
      const ethosLogoUrl = getEthosProfileCardUrl(userkey);
      await sendPhoto(
        chatId,
        ethosLogoUrl,
        responseMessage,
        "HTML",
        messageId,
        keyboard,
      );
    } catch (error) {
      console.error("Error in /profile command:", error);
      await sendMessage(
        chatId,
        `❌ Profile not found on Ethos Network\n\nMake sure the Twitter handle or address is correct and has an Ethos profile.`,
        "HTML",
        messageId,
      );
    }
  }
}
