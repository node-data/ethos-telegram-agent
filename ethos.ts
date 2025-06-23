import { ETHOS_API_BASE } from "./config.ts";

// Helper function to make API calls with required headers
async function ethosApiCall(url: string): Promise<Response> {
  return fetch(url, {
    headers: {
      "X-Ethos-Client": "ethos-telegram-agent",
    },
  });
}

// Helper function to determine userkey format
export function formatUserkey(input: string): string {
  // Remove @ symbol if present
  const cleanInput = input.replace(/^@/, "");

  // Check if it's an EVM address (starts with 0x and is 42 characters)
  if (cleanInput.startsWith("0x") && cleanInput.length === 42) {
    return `address:${cleanInput}`;
  }

  // Otherwise treat as Twitter username
  return `service:x.com:username:${cleanInput}`;
}

// Helper function to get profileId from userkey
async function getProfileId(userkey: string): Promise<number | null> {
  try {
    const response = await ethosApiCall(
      `${ETHOS_API_BASE}/api/v1/users/${userkey}/stats`,
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    if (!data.ok || !data.data.profileId) {
      return null;
    }

    return data.data.profileId;
  } catch (error) {
    console.error("Error fetching profileId:", error);
    return null;
  }
}

// Helper function to check if user has completed daily contributor tasks
export async function checkDailyContributionStatus(
  userkey: string,
): Promise<{ canGenerate: boolean; error?: string } | null> {
  try {
    // First get the profileId from the userkey
    const profileId = await getProfileId(userkey);

    if (!profileId) {
      return { canGenerate: true, error: "Could not find profileId for user" };
    }

    // Now use the profileId to check contributions
    const response = await ethosApiCall(
      `${ETHOS_API_BASE}/api/v1/contributions/profileId:${profileId}/stats`,
    );

    if (!response.ok) {
      return {
        canGenerate: true,
        error: `HTTP error! status: ${response.status}`,
      };
    }

    const data = await response.json();

    if (!data.ok) {
      return { canGenerate: true, error: "API returned error" };
    }

    // If canGenerateDailyContributions is false, they've already completed their tasks
    return { canGenerate: data.data.canGenerateDailyContributions };
  } catch (error) {
    console.error("Error checking daily contribution status:", error);
    // Return true (can generate) if there's an error, so we don't skip reminders due to API issues
    return {
      canGenerate: true,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Helper function to search for user and get name using Search API
export async function fetchUserDisplayName(
  input: string,
): Promise<string | null> {
  try {
    const response = await ethosApiCall(
      `${ETHOS_API_BASE}/api/v1/search?query=${
        encodeURIComponent(input)
      }&limit=2`,
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    if (!data.ok || !data.data.values || data.data.values.length === 0) {
      return null;
    }

    // Return the name of the first matching user
    const name = data.data.values[0].name;
    return name || null;
  } catch (error) {
    console.error("Error fetching user name:", error);
    return null;
  }
}

// Helper function to fetch Ethos score
export async function fetchEthosScore(userkey: string): Promise<number | null> {
  try {
    const response = await ethosApiCall(`${ETHOS_API_BASE}/api/v1/score/${userkey}`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    if (!data.ok) {
      throw new Error("API returned error");
    }

    return data.data.score;
  } catch (error) {
    console.error("Error fetching Ethos score:", error);
    return null;
  }
}

// Helper function to fetch profile from Ethos API
export async function fetchEthosProfile(userkey: string): Promise<any> {
  try {
    const response = await ethosApiCall(
      `${ETHOS_API_BASE}/api/v1/users/${userkey}/stats`,
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    if (!data.ok) {
      throw new Error("API returned error");
    }

    return data.data;
  } catch (error) {
    console.error("Error fetching Ethos profile:", error);
    throw error;
  }
}

// Helper function to get the display name from profile data or search API
export async function getDisplayName(
  userkey: string,
  profileData: any,
  searchInput: string,
): Promise<string> {
  // First priority: Use name from the profile data itself
  if (profileData && profileData.name) {
    return profileData.name;
  }

  // Second priority: Try to get name from search API using the original input
  try {
    const searchName = await fetchUserDisplayName(searchInput);
    if (searchName) {
      return searchName;
    }
  } catch (error) {
    console.error("Error fetching display name from search:", error);
  }

  // Fallback: Extract from userkey
  let fallbackName: string;
  if (userkey.includes("username:")) {
    fallbackName = userkey.split("username:")[1];
  } else if (userkey.includes("address:")) {
    const address = userkey.split("address:")[1];
    fallbackName = `${address.slice(0, 6)}...${address.slice(-4)}`;
  } else {
    fallbackName = userkey;
  }

  return fallbackName;
}

// Helper function to get Ethos profile card image URL
export function getEthosProfileCardUrl(userkey: string): string {
  // Use Ethos's dynamic OG profile card endpoint
  return `https://app.ethos.network/og/profile-cards/${userkey}`;
}

// Helper function to format profile data for display
export function formatProfileMessage(
  profileData: any,
  userkey: string,
  ethosScore: number | null,
  displayName: string,
): string {
  const { reviews, slashes, vouches } = profileData;

  // Generate correct profile URL
  let profileUrl: string;
  if (userkey.includes("username:")) {
    const username = userkey.split("username:")[1];
    profileUrl =
      `https://app.ethos.network/profile/x/${username}?source=ethos-telegram-bot`;
  } else if (userkey.includes("address:")) {
    const address = userkey.split("address:")[1];
    profileUrl =
      `https://app.ethos.network/profile/${address}?source=ethos-telegram-bot`;
  } else {
    profileUrl =
      `https://app.ethos.network/profile/${userkey}?source=ethos-telegram-bot`;
  }

  // Create score display
  const scoreDisplay = ethosScore !== null ? `[${ethosScore}]` : "[Score N/A]";

  let message = `<b>Ethos Profile: ${displayName} ${scoreDisplay}</b>\n\n`;

  // Reviews section
  message += `<b>Reviews received:</b>\n`;
  message +=
    `Positive: ${reviews.positiveReviewCount} Neutral: ${reviews.neutralReviewCount} Negative: ${reviews.negativeReviewCount}\n\n`;

  // Vouches section
  message += `<b>Vouches received:</b> ${
    vouches.balance.received.toFixed(4)
  }e (${vouches.count.received})\n\n`;

  // Slashes section
  if (slashes.count > 0) {
    message += `<b>Slashes:</b>\n`;
    message += `Count: ${slashes.count}\n`;
    if (slashes.openSlash) {
      message += `Open Slash: Yes`;
    } else {
      message += `Open Slash: None`;
    }
  }

  return message;
}

// Helper function to create inline keyboard for profile actions
export function createProfileKeyboard(
  userkey: string,
  displayName: string,
): any {
  // Generate correct URLs for actions
  let profileUrl: string, reviewUrl: string, vouchUrl: string;

  if (userkey.includes("username:")) {
    const username = userkey.split("username:")[1];
    profileUrl =
      `https://app.ethos.network/profile/x/${username}?source=ethos-telegram-bot`;
    reviewUrl =
      `https://app.ethos.network/profile/x/${username}?modal=review&source=ethos-telegram-bot`;
    vouchUrl =
      `https://app.ethos.network/profile/x/${username}?modal=vouch&source=ethos-telegram-bot`;
  } else if (userkey.includes("address:")) {
    const address = userkey.split("address:")[1];
    profileUrl =
      `https://app.ethos.network/profile/${address}?source=ethos-telegram-bot`;
    reviewUrl =
      `https://app.ethos.network/profile/${address}?modal=review&source=ethos-telegram-bot`;
    vouchUrl =
      `https://app.ethos.network/profile/${address}?modal=vouch&source=ethos-telegram-bot`;
  } else {
    profileUrl =
      `https://app.ethos.network/profile/${userkey}?source=ethos-telegram-bot`;
    reviewUrl =
      `https://app.ethos.network/profile/${userkey}?modal=review&source=ethos-telegram-bot`;
    vouchUrl =
      `https://app.ethos.network/profile/${userkey}?modal=vouch&source=ethos-telegram-bot`;
  }

  return {
    inline_keyboard: [
      [
        {
          text: `📝 Review`,
          url: reviewUrl,
        },
        {
          text: `🤝 Vouch`,
          url: vouchUrl,
        },
      ],
      [
        {
          text: `👤 View Full Profile`,
          url: profileUrl,
        },
      ],
    ],
  };
}
