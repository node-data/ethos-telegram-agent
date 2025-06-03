// Helper function to parse time input
export function parseReminderTime(timeInput: string): string | null {
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
export function formatTimeForDisplay(time24: string): string {
    const [hour, minute] = time24.split(':').map(Number);
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${minute.toString().padStart(2, '0')} ${period} UTC`;
} 