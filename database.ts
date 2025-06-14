// Initialize Deno KV for user tracking
// @ts-ignore - Deno global is available in Deno runtime
// Triggering new deployment
const kv = await Deno.openKv();

export interface UserReminderData {
  chatId: number;
  addedAt: string;
  active: boolean;
  reminderTimes: string[]; // Changed from reminderTime to support multiple reminders
  updatedAt?: string;
  taskRefreshNotifications?: boolean; // New field for task refresh notification preference
  userkey?: string; // Optional field to store user's Ethos userkey for task checking
  receiveTestMessages?: boolean; // New field to track if user wants to receive test messages
}

export interface NotificationRecord {
  chatId: number;
  type: 'reminder' | 'task_refresh';
  sentAt: string;
  messageHash: string; // Hash of the message content to detect duplicates
}

// User tracking functions
export async function addUserToReminders(
  chatId: number,
  reminderTime?: string,
): Promise<void> {
  try {
    // Get existing user data to preserve custom settings
    const existingData = await kv.get([
      "users",
      "reminders",
      chatId.toString(),
    ]);
    const existingUserData = existingData.value as UserReminderData | null;

    // Handle migration from old single reminderTime to array
    let existingTimes: string[] = [];
    if (existingUserData) {
      if (Array.isArray(existingUserData.reminderTimes)) {
        existingTimes = existingUserData.reminderTimes;
      } else if ((existingUserData as any).reminderTime) {
        // Migrate old single reminderTime to array
        existingTimes = [(existingUserData as any).reminderTime];
      }
    }

    // Default to 22:00 if no existing times
    const defaultTimes = existingTimes.length > 0 ? existingTimes : ["22:00"];
    const existingTaskRefreshPref =
      existingUserData?.taskRefreshNotifications ?? true; // Default to enabled
    const existingUserkey = existingUserData?.userkey; // Preserve existing userkey
    const existingAddedAt = existingUserData?.addedAt || new Date().toISOString(); // Preserve original addedAt
    const existingTestMessages = existingUserData?.receiveTestMessages ?? false; // Preserve test message preference

    await kv.set(["users", "reminders", chatId.toString()], {
      chatId,
      addedAt: existingAddedAt, // Don't overwrite the original addedAt timestamp
      active: true,
      reminderTimes: reminderTime ? [reminderTime] : defaultTimes, // Store as array of "HH:MM" in UTC
      taskRefreshNotifications: existingTaskRefreshPref,
      receiveTestMessages: existingTestMessages, // Preserve test message preference
      ...(existingUserkey && { userkey: existingUserkey }), // Preserve userkey if it exists
      updatedAt: new Date().toISOString(), // Track when this update happened
    });
    console.log(
      `Added user ${chatId} to reminder list with times ${
        JSON.stringify(reminderTime ? [reminderTime] : defaultTimes)
      } UTC, task refresh notifications: ${existingTaskRefreshPref}, test messages: ${existingTestMessages}`,
    );
  } catch (error) {
    console.error("Error adding user to reminders:", error);
  }
}

export async function removeUserFromReminders(chatId: number): Promise<void> {
  try {
    await kv.delete(["users", "reminders", chatId.toString()]);
    console.log(`Removed user ${chatId} from reminder list`);
  } catch (error) {
    console.error("Error removing user from reminders:", error);
  }
}

export async function getUserReminderTime(
  chatId: number,
): Promise<string | null> {
  try {
    const result = await kv.get(["users", "reminders", chatId.toString()]);
    const userData = result.value as UserReminderData | null;
    if (userData) {
      // Handle migration from old single reminderTime
      if (Array.isArray(userData.reminderTimes)) {
        return userData.reminderTimes[0] || null; // Return first time for backward compatibility
      } else if ((userData as any).reminderTime) {
        return (userData as any).reminderTime;
      }
    }
    return null;
  } catch (error) {
    console.error("Error getting user reminder time:", error);
    return null;
  }
}

export async function getUserReminderTimes(chatId: number): Promise<string[]> {
  try {
    const result = await kv.get(["users", "reminders", chatId.toString()]);
    const userData = result.value as UserReminderData | null;
    if (userData) {
      // Handle migration from old single reminderTime
      if (Array.isArray(userData.reminderTimes)) {
        return userData.reminderTimes;
      } else if ((userData as any).reminderTime) {
        return [(userData as any).reminderTime];
      }
    }
    return [];
  } catch (error) {
    console.error("Error getting user reminder times:", error);
    return [];
  }
}

export async function setUserReminderTime(
  chatId: number,
  reminderTime: string,
): Promise<void> {
  try {
    const existingData = await kv.get([
      "users",
      "reminders",
      chatId.toString(),
    ]);
    const existingUserData = existingData.value as UserReminderData | null;
    if (existingUserData) {
      await kv.set(["users", "reminders", chatId.toString()], {
        ...existingUserData,
        reminderTimes: [reminderTime], // Replace all times with single time for backward compatibility
        updatedAt: new Date().toISOString(),
      });
      console.log(
        `Updated reminder time for user ${chatId} to ${reminderTime} UTC`,
      );
    } else {
      // User doesn't exist, create new entry
      await addUserToReminders(chatId, reminderTime);
    }
  } catch (error) {
    console.error("Error setting user reminder time:", error);
    throw error;
  }
}

export async function addUserReminderTime(
  chatId: number,
  reminderTime: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const existingData = await kv.get([
      "users",
      "reminders",
      chatId.toString(),
    ]);
    const existingUserData = existingData.value as UserReminderData | null;

    let currentTimes: string[] = [];
    if (existingUserData) {
      // Handle migration from old single reminderTime
      if (Array.isArray(existingUserData.reminderTimes)) {
        currentTimes = existingUserData.reminderTimes;
      } else if ((existingUserData as any).reminderTime) {
        currentTimes = [(existingUserData as any).reminderTime];
      }
    }

    // Check if time already exists
    if (currentTimes.includes(reminderTime)) {
      return {
        success: false,
        message: "You already have a reminder set for this time.",
      };
    }

    // Check limit of 3 reminders
    if (currentTimes.length >= 3) {
      return {
        success: false,
        message:
          "You can only have up to 3 reminder times. Remove one first with /remove_reminder_time.",
      };
    }

    const newTimes = [...currentTimes, reminderTime].sort(); // Keep times sorted

    if (existingUserData) {
      await kv.set(["users", "reminders", chatId.toString()], {
        ...existingUserData,
        reminderTimes: newTimes,
        active: true, // Ensure user is active when adding reminder
        updatedAt: new Date().toISOString(),
      });
    } else {
      // Create new user
      await kv.set(["users", "reminders", chatId.toString()], {
        chatId,
        addedAt: new Date().toISOString(),
        active: true,
        reminderTimes: newTimes,
        taskRefreshNotifications: true,
      });
    }

    console.log(
      `Added reminder time ${reminderTime} for user ${chatId}. Total times: ${
        JSON.stringify(newTimes)
      }`,
    );
    return {
      success: true,
      message: `Added reminder for ${reminderTime} UTC.`,
    };
  } catch (error) {
    console.error("Error adding user reminder time:", error);
    throw error;
  }
}

export async function removeUserReminderTime(
  chatId: number,
  reminderTime: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const existingData = await kv.get([
      "users",
      "reminders",
      chatId.toString(),
    ]);
    const existingUserData = existingData.value as UserReminderData | null;

    if (!existingUserData) {
      return { success: false, message: "You don't have any reminders set." };
    }

    let currentTimes: string[] = [];
    // Handle migration from old single reminderTime
    if (Array.isArray(existingUserData.reminderTimes)) {
      currentTimes = existingUserData.reminderTimes;
    } else if ((existingUserData as any).reminderTime) {
      currentTimes = [(existingUserData as any).reminderTime];
    }

    if (!currentTimes.includes(reminderTime)) {
      return {
        success: false,
        message: "You don't have a reminder set for this time.",
      };
    }

    const newTimes = currentTimes.filter((time) => time !== reminderTime);

    if (newTimes.length === 0) {
      // If no more reminder times, deactivate user but keep record
      await kv.set(["users", "reminders", chatId.toString()], {
        ...existingUserData,
        reminderTimes: [],
        active: false,
        updatedAt: new Date().toISOString(),
      });
      console.log(
        `Removed last reminder time for user ${chatId}. User deactivated.`,
      );
      return {
        success: true,
        message: "Removed reminder. You now have no active reminders.",
      };
    } else {
      await kv.set(["users", "reminders", chatId.toString()], {
        ...existingUserData,
        reminderTimes: newTimes,
        updatedAt: new Date().toISOString(),
      });
      console.log(
        `Removed reminder time ${reminderTime} for user ${chatId}. Remaining times: ${
          JSON.stringify(newTimes)
        }`,
      );
      return {
        success: true,
        message: `Removed reminder for ${reminderTime} UTC.`,
      };
    }
  } catch (error) {
    console.error("Error removing user reminder time:", error);
    throw error;
  }
}

export async function getAllReminderUsers(): Promise<number[]> {
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
    console.error("Error getting reminder users:", error);
    return [];
  }
}

export async function getUsersForReminderTime(
  currentHour: number,
): Promise<number[]> {
  try {
    const users: number[] = [];
    const iter = kv.list({ prefix: ["users", "reminders"] });

    for await (const entry of iter) {
      const userData = entry.value as UserReminderData | null;

      if (userData?.active) {
        let timesToCheck: string[] = [];

        // Handle migration from old single reminderTime
        if (Array.isArray(userData.reminderTimes)) {
          timesToCheck = userData.reminderTimes;
        } else if ((userData as any).reminderTime) {
          timesToCheck = [(userData as any).reminderTime];
        }

        // Check if any of the user's reminder times match the current hour
        for (const timeStr of timesToCheck) {
          const [hour] = timeStr.split(":").map(Number);
          if (hour === currentHour) {
            users.push(userData.chatId);
            break; // Don't add user multiple times even if they have multiple reminders at same hour
          }
        }
      }
    }

    return users;
  } catch (error) {
    console.error("Error getting users for reminder time:", error);
    return [];
  }
}

export async function getReminderTimeStats(): Promise<
  { [key: string]: number }
> {
  try {
    const timeStats: { [key: string]: number } = {};
    const iter = kv.list({ prefix: ["users", "reminders"] });

    for await (const entry of iter) {
      const userData = entry.value as UserReminderData | null;
      if (userData?.active) {
        let timesToCount: string[] = [];

        // Handle migration from old single reminderTime
        if (Array.isArray(userData.reminderTimes)) {
          timesToCount = userData.reminderTimes;
        } else if ((userData as any).reminderTime) {
          timesToCount = [(userData as any).reminderTime];
        }

        for (const time of timesToCount) {
          timeStats[time] = (timeStats[time] || 0) + 1;
        }
      }
    }

    return timeStats;
  } catch (error) {
    console.error("Error getting reminder time stats:", error);
    return {};
  }
}

// New function to get users who want task refresh notifications
export async function getUsersForTaskRefreshNotifications(): Promise<number[]> {
  try {
    const users: number[] = [];
    const iter = kv.list({ prefix: ["users", "reminders"] });

    for await (const entry of iter) {
      const userData = entry.value as UserReminderData | null;

      // Include users who are active and have task refresh notifications enabled (default true)
      if (userData?.active && (userData.taskRefreshNotifications ?? true)) {
        users.push(userData.chatId);
      }
    }

    return users;
  } catch (error) {
    console.error("Error getting users for task refresh notifications:", error);
    return [];
  }
}

// New function to set task refresh notification preference
export async function setUserTaskRefreshNotifications(
  chatId: number,
  enabled: boolean,
): Promise<void> {
  try {
    const existingData = await kv.get([
      "users",
      "reminders",
      chatId.toString(),
    ]);
    const existingUserData = existingData.value as UserReminderData | null;
    if (existingUserData) {
      await kv.set(["users", "reminders", chatId.toString()], {
        ...existingUserData,
        taskRefreshNotifications: enabled,
        updatedAt: new Date().toISOString(),
      });
      console.log(
        `Updated task refresh notifications for user ${chatId} to ${enabled}`,
      );
    } else {
      // User doesn't exist, create new entry with task refresh preference
      await kv.set(["users", "reminders", chatId.toString()], {
        chatId,
        addedAt: new Date().toISOString(),
        active: true,
        reminderTimes: ["22:00"], // Default reminder time
        taskRefreshNotifications: enabled,
      });
      console.log(
        `Created new user ${chatId} with task refresh notifications set to ${enabled}`,
      );
    }
  } catch (error) {
    console.error("Error setting task refresh notifications:", error);
    throw error;
  }
}

// New function to get user's task refresh notification preference
export async function getUserTaskRefreshNotifications(
  chatId: number,
): Promise<boolean | null> {
  try {
    const result = await kv.get(["users", "reminders", chatId.toString()]);
    const userData = result.value as UserReminderData | null;
    if (userData) {
      return userData.taskRefreshNotifications ?? true; // Default to enabled
    }
    return null; // User not found
  } catch (error) {
    console.error("Error getting user task refresh notifications:", error);
    return null;
  }
}

// New function to set user's userkey for task completion checking
export async function setUserUserkey(
  chatId: number,
  userkey: string,
): Promise<void> {
  try {
    console.log(`Debug setUserUserkey: chatId=${chatId}, userkey=${userkey}`);
    const keyPath = ["users", "reminders", chatId.toString()];
    console.log(`Debug setUserUserkey: keyPath=${JSON.stringify(keyPath)}`);

    const existingData = await kv.get([
      "users",
      "reminders",
      chatId.toString(),
    ]);
    const existingUserData = existingData.value as UserReminderData | null;
    console.log(
      `Debug setUserUserkey: existingData=${JSON.stringify(existingUserData)}`,
    );

    if (existingUserData) {
      const updatedData = {
        ...existingUserData,
        userkey: userkey,
        updatedAt: new Date().toISOString(),
      };
      console.log(
        `Debug setUserUserkey: updatedData=${JSON.stringify(updatedData)}`,
      );
      await kv.set(["users", "reminders", chatId.toString()], updatedData);
      console.log(`Updated userkey for user ${chatId}`);
    } else {
      // Create new user with userkey
      const newData = {
        chatId,
        addedAt: new Date().toISOString(),
        active: true,
        reminderTimes: ["22:00"], // Default reminder time
        taskRefreshNotifications: true,
        userkey: userkey,
      };
      console.log(`Debug setUserUserkey: newData=${JSON.stringify(newData)}`);
      await kv.set(["users", "reminders", chatId.toString()], newData);
      console.log(`Created new user ${chatId} with userkey`);
    }
  } catch (error) {
    console.error("Error setting user userkey:", error);
    throw error;
  }
}

// New function to get user's userkey
export async function getUserUserkey(chatId: number): Promise<string | null> {
  try {
    console.log(`Debug getUserUserkey: chatId=${chatId}`);
    const keyPath = ["users", "reminders", chatId.toString()];
    console.log(`Debug getUserUserkey: keyPath=${JSON.stringify(keyPath)}`);

    const result = await kv.get(["users", "reminders", chatId.toString()]);
    console.log(`Debug getUserUserkey: result=${JSON.stringify(result)}`);

    const userData = result.value as UserReminderData | null;
    console.log(`Debug getUserUserkey: userData=${JSON.stringify(userData)}`);

    const userkey = userData?.userkey;
    console.log(`Debug getUserUserkey: userkey=${userkey}`);

    // Return null if userkey is empty string (cleared) or undefined
    const finalResult = (userkey && userkey.trim() !== "") ? userkey : null;
    console.log(`Debug getUserUserkey: finalResult=${finalResult}`);

    return finalResult;
  } catch (error) {
    console.error("Error getting user userkey:", error);
    return null;
  }
}

// Function to check if a notification was recently sent
export async function wasNotificationRecentlySent(
  chatId: number,
  type: 'reminder' | 'task_refresh',
  messageHash: string,
  timeWindowMinutes: number = 60
): Promise<boolean> {
  try {
    const key = ["notifications", chatId.toString(), type];
    const result = await kv.get(key);
    const record = result.value as NotificationRecord | null;

    if (!record) return false;

    const sentTime = new Date(record.sentAt);
    const now = new Date();
    const timeDiff = (now.getTime() - sentTime.getTime()) / (1000 * 60); // Convert to minutes

    // Check if the notification was sent within the time window and has the same content
    return timeDiff < timeWindowMinutes && record.messageHash === messageHash;
  } catch (error) {
    console.error("Error checking recent notification:", error);
    return false; // If there's an error, allow the notification to be sent
  }
}

// Function to record a sent notification
export async function recordNotificationSent(
  chatId: number,
  type: 'reminder' | 'task_refresh',
  messageHash: string
): Promise<void> {
  try {
    const key = ["notifications", chatId.toString(), type];
    await kv.set(key, {
      chatId,
      type,
      sentAt: new Date().toISOString(),
      messageHash
    });
  } catch (error) {
    console.error("Error recording notification:", error);
  }
}

// New function to set test message preference
export async function setUserTestMessages(
  chatId: number,
  enabled: boolean,
): Promise<void> {
  try {
    const existingData = await kv.get([
      "users",
      "reminders",
      chatId.toString(),
    ]);
    const existingUserData = existingData.value as UserReminderData | null;
    if (existingUserData) {
      await kv.set(["users", "reminders", chatId.toString()], {
        ...existingUserData,
        receiveTestMessages: enabled,
        updatedAt: new Date().toISOString(),
      });
      console.log(
        `Updated test messages for user ${chatId} to ${enabled}`,
      );
    } else {
      // User doesn't exist, create new entry with test message preference
      await kv.set(["users", "reminders", chatId.toString()], {
        chatId,
        addedAt: new Date().toISOString(),
        active: true,
        reminderTimes: ["22:00"], // Default reminder time
        taskRefreshNotifications: true,
        receiveTestMessages: enabled,
      });
      console.log(
        `Created new user ${chatId} with test messages set to ${enabled}`,
      );
    }
  } catch (error) {
    console.error("Error setting test messages:", error);
    throw error;
  }
}

// New function to get user's test message preference
export async function getUserTestMessages(
  chatId: number,
): Promise<boolean | null> {
  try {
    const result = await kv.get(["users", "reminders", chatId.toString()]);
    const userData = result.value as UserReminderData | null;
    if (userData) {
      return userData.receiveTestMessages ?? false; // Default to disabled
    }
    return null; // User not found
  } catch (error) {
    console.error("Error getting user test messages:", error);
    return null;
  }
}
