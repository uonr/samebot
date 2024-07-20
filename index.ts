import io from 'socket.io-client';
import { z } from "zod";
import dotenv from 'dotenv';

dotenv.config({ path: ['.env.local', '.env'] })


const channelName = process.env.CHANNEL_NAME || '';
const password = process.env.CHANNEL_PASSWORD || '';
const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
const chatId = process.env.TELEGRAM_CHAT_ID || '';

const configSchema = z.object({
  servers: z.array(z.object({ url: z.string(), secure: z.boolean() })),
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const updatesSchema = z.object({
  "ok": z.boolean(),
  "result": z.array(z.object({
    update_id: z.number(),
    channel_post: z.optional(z.object({
      message_id: z.number(),
      new_chat_title: z.optional(z.string()),
      date: z.number(),
    })),
  }))
});

async function telegramReq(method: string, params: Record<string, unknown>): Promise<unknown> {
  const url = new URL(`https://api.telegram.org/bot${botToken}/${method}`);
  const entries: Array<[string, string]> = Object.entries(params)
    .filter(([key, value]) => typeof value != "function" && value != null)
    .map(([key, value]) => [key, typeof value === "object" ? JSON.stringify(value) : String(value)]);
  url.search = new URLSearchParams(Object.fromEntries(entries)).toString();
  const response = await fetch(url.toString());
  return await response.json();
}

async function connectToSocket() {
  const configUrl = `https://www.cytu.be/socketconfig/${channelName}.json`;
  const response = await fetch(configUrl);
  const json = await response.json();
  let config: z.infer<typeof configSchema>;
  try {
    config = configSchema.parse(json);
  } catch (e) {
    console.error("Failed to parse config");
    console.log(json);
    return;
  }
  if (config.servers.length === 0) {
    throw new Error("No servers found in config");
  }
  const secureServer = config.servers.find((server) => server.secure);
  if (!secureServer) {
    throw new Error("No secure server found");
  }
  const client = io(secureServer.url);
  client.on("connect", () => {
    console.log("Connected to server");
  });
  client.emit('joinChannel', { name: channelName });
  client.once('needPassword', () => {
    client.emit('channelPassword', password);
  });
  client.on("usercount", async (count: number) => {
    const title = `鲨鲨播播 (${count - 1}人在线)`;
    try {
      await telegramReq("setChatTitle", { chat_id: chatId, title });
      console.log("Set chat title: " + title);
    } catch {
      console.warn("Failed to set chat title");
    }
  });
  client.on("disconnect", async () => {
    console.log("Disconnected from server");
    await sleep(1000);
    client.close();
    connectToSocket();
  });
}

const removeTitle = async () => {
  const titleMessageIdMap: Map<number, number> = new Map();
  while (true) {
    let json: unknown;
    try {
      json = await telegramReq("getUpdates", { timeout: 10, allowed_updates: ["channel_post"] });
    } catch {
      console.warn("Failed to fetch updates");
      setTimeout(removeTitle, 1000);
      return;
    }
    let updates: z.infer<typeof updatesSchema>;
    try {
      updates = updatesSchema.parse(json);
    } catch {
      console.warn("Failed to parse updates");
      console.log(json);
      continue;
    }
    for (const update of updates.result) {
      if (!update.channel_post || !update.channel_post.new_chat_title) {
        continue;
      }
      titleMessageIdMap.set(update.channel_post.date, update.channel_post.message_id);
    }
    const titleMessagesByDate = [...titleMessageIdMap.entries()];
    titleMessagesByDate.sort(([a], [b]) => a - b);

    const latestTitleMessage = titleMessagesByDate.pop();
    if (!latestTitleMessage) {
      return;
    }
    try {
      await telegramReq("deleteMessages", { chat_id: chatId, message_ids: titleMessagesByDate.map(([_, messageId]) => messageId) });
    } catch {
      console.warn("Failed to delete messages");
    }
    titleMessageIdMap.clear();
    titleMessageIdMap.set(latestTitleMessage[0], latestTitleMessage[1]);
    await sleep(500);
  }
};

connectToSocket();
removeTitle();