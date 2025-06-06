import { TELEGRAM_API } from "./config.ts";

// Telegram API helper functions
export async function sendMessage(
  chatId: number,
  text: string,
  parseMode = "HTML",
  replyToMessageId?: number,
  replyMarkup?: any,
) {
  const body: any = {
    chat_id: chatId,
    text: text,
    parse_mode: parseMode,
  };

  if (replyToMessageId) {
    body.reply_to_message_id = replyToMessageId;
  }

  if (replyMarkup) {
    body.reply_markup = replyMarkup;
  }

  const response = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.json();
}

export async function sendChatAction(chatId: number, action: string) {
  await fetch(`${TELEGRAM_API}/sendChatAction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      action: action,
    }),
  });
}

export async function sendPhoto(
  chatId: number,
  photoUrl: string,
  caption: string,
  parseMode = "HTML",
  replyToMessageId?: number,
  replyMarkup?: any,
) {
  const body: any = {
    chat_id: chatId,
    photo: photoUrl,
    caption: caption,
    parse_mode: parseMode,
  };

  if (replyToMessageId) {
    body.reply_to_message_id = replyToMessageId;
  }

  if (replyMarkup) {
    body.reply_markup = replyMarkup;
  }

  const response = await fetch(`${TELEGRAM_API}/sendPhoto`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.json();
}
