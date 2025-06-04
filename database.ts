// Initialize Deno KV for user tracking
// @ts-ignore - Deno global is available in Deno runtime
const kv = await Deno.openKv();

export interface UserReminderData {
    chatId: number;
    addedAt: string;
    active: boolean;
    reminderTime: string;
    updatedAt?: string;
    taskRefreshNotifications?: boolean; // New field for task refresh notification preference
}

// User tracking functions
export async function addUserToReminders(chatId: number, reminderTime?: string): Promise<void> {
    try {
        // Get existing user data to preserve custom settings
        const existingData = await kv.get(["users", "reminders", chatId.toString()]);
        const existingUserData = existingData.value as UserReminderData | null;
        const existingTime = existingUserData?.reminderTime || "22:00";
        const existingTaskRefreshPref = existingUserData?.taskRefreshNotifications ?? true; // Default to enabled
        
        await kv.set(["users", "reminders", chatId.toString()], {
            chatId,
            addedAt: new Date().toISOString(),
            active: true,
            reminderTime: reminderTime || existingTime, // Store as "HH:MM" in UTC
            taskRefreshNotifications: existingTaskRefreshPref
        });
        console.log(`Added user ${chatId} to reminder list with time ${reminderTime || existingTime} UTC, task refresh notifications: ${existingTaskRefreshPref}`);
    } catch (error) {
        console.error('Error adding user to reminders:', error);
    }
}

export async function removeUserFromReminders(chatId: number): Promise<void> {
    try {
        await kv.delete(["users", "reminders", chatId.toString()]);
        console.log(`Removed user ${chatId} from reminder list`);
    } catch (error) {
        console.error('Error removing user from reminders:', error);
    }
}

export async function getUserReminderTime(chatId: number): Promise<string | null> {
    try {
        const result = await kv.get(["users", "reminders", chatId.toString()]);
        const userData = result.value as UserReminderData | null;
        return userData?.reminderTime || null;
    } catch (error) {
        console.error('Error getting user reminder time:', error);
        return null;
    }
}

export async function setUserReminderTime(chatId: number, reminderTime: string): Promise<void> {
    try {
        const existingData = await kv.get(["users", "reminders", chatId.toString()]);
        const existingUserData = existingData.value as UserReminderData | null;
        if (existingUserData) {
            await kv.set(["users", "reminders", chatId.toString()], {
                ...existingUserData,
                reminderTime: reminderTime,
                updatedAt: new Date().toISOString()
            });
            console.log(`Updated reminder time for user ${chatId} to ${reminderTime} UTC`);
        } else {
            // User doesn't exist, create new entry
            await addUserToReminders(chatId, reminderTime);
        }
    } catch (error) {
        console.error('Error setting user reminder time:', error);
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
        console.error('Error getting reminder users:', error);
        return [];
    }
}

export async function getUsersForReminderTime(currentHour: number): Promise<number[]> {
    try {
        const users: number[] = [];
        const iter = kv.list({ prefix: ["users", "reminders"] });
        
        for await (const entry of iter) {
            const userData = entry.value as UserReminderData | null;
            
            if (userData?.active && userData.reminderTime) {
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

export async function getReminderTimeStats(): Promise<{ [key: string]: number }> {
    try {
        const timeStats: { [key: string]: number } = {};
        const iter = kv.list({ prefix: ["users", "reminders"] });
        
        for await (const entry of iter) {
            const userData = entry.value as UserReminderData | null;
            if (userData?.active && userData.reminderTime) {
                timeStats[userData.reminderTime] = (timeStats[userData.reminderTime] || 0) + 1;
            }
        }
        
        return timeStats;
    } catch (error) {
        console.error('Error getting reminder time stats:', error);
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
        console.error('Error getting users for task refresh notifications:', error);
        return [];
    }
}

// New function to set task refresh notification preference
export async function setUserTaskRefreshNotifications(chatId: number, enabled: boolean): Promise<void> {
    try {
        const existingData = await kv.get(["users", "reminders", chatId.toString()]);
        const existingUserData = existingData.value as UserReminderData | null;
        if (existingUserData) {
            await kv.set(["users", "reminders", chatId.toString()], {
                ...existingUserData,
                taskRefreshNotifications: enabled,
                updatedAt: new Date().toISOString()
            });
            console.log(`Updated task refresh notifications for user ${chatId} to ${enabled}`);
        } else {
            // User doesn't exist, create new entry with task refresh preference
            await kv.set(["users", "reminders", chatId.toString()], {
                chatId,
                addedAt: new Date().toISOString(),
                active: true,
                reminderTime: "22:00", // Default reminder time
                taskRefreshNotifications: enabled
            });
            console.log(`Created new user ${chatId} with task refresh notifications set to ${enabled}`);
        }
    } catch (error) {
        console.error('Error setting task refresh notifications:', error);
        throw error;
    }
}

// New function to get user's task refresh notification preference
export async function getUserTaskRefreshNotifications(chatId: number): Promise<boolean | null> {
    try {
        const result = await kv.get(["users", "reminders", chatId.toString()]);
        const userData = result.value as UserReminderData | null;
        if (userData) {
            return userData.taskRefreshNotifications ?? true; // Default to enabled
        }
        return null; // User not found
    } catch (error) {
        console.error('Error getting user task refresh notifications:', error);
        return null;
    }
} 