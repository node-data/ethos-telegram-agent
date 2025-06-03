// Initialize Deno KV for user tracking
// @ts-ignore - Deno global is available in Deno runtime
const kv = await Deno.openKv();

export interface UserReminderData {
    chatId: number;
    addedAt: string;
    active: boolean;
    reminderTime: string;
    updatedAt?: string;
}

// User tracking functions
export async function addUserToReminders(chatId: number, reminderTime?: string): Promise<void> {
    try {
        // Get existing user data to preserve custom reminder time
        const existingData = await kv.get(["users", "reminders", chatId.toString()]);
        const existingTime = existingData.value?.reminderTime || "22:00";
        
        await kv.set(["users", "reminders", chatId.toString()], {
            chatId,
            addedAt: new Date().toISOString(),
            active: true,
            reminderTime: reminderTime || existingTime // Store as "HH:MM" in UTC
        });
        console.log(`Added user ${chatId} to reminder list with time ${reminderTime || existingTime} UTC`);
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
        return result.value?.reminderTime || null;
    } catch (error) {
        console.error('Error getting user reminder time:', error);
        return null;
    }
}

export async function setUserReminderTime(chatId: number, reminderTime: string): Promise<void> {
    try {
        const existingData = await kv.get(["users", "reminders", chatId.toString()]);
        if (existingData.value) {
            await kv.set(["users", "reminders", chatId.toString()], {
                ...existingData.value,
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

export async function getReminderTimeStats(): Promise<{ [key: string]: number }> {
    try {
        const timeStats: { [key: string]: number } = {};
        const iter = kv.list({ prefix: ["users", "reminders"] });
        
        for await (const entry of iter) {
            const userData = entry.value as { active: boolean; reminderTime: string };
            if (userData.active && userData.reminderTime) {
                timeStats[userData.reminderTime] = (timeStats[userData.reminderTime] || 0) + 1;
            }
        }
        
        return timeStats;
    } catch (error) {
        console.error('Error getting reminder time stats:', error);
        return {};
    }
} 