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

async function connectToSocket() {
  const configUrl = `https://www.cytu.be/socketconfig/${channelName}.json`;
  const response = await fetch(configUrl);
  const json = await response.json();
  const config = configSchema.parse(json);
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
    const params = new URLSearchParams();
    params.append("chat_id", chatId);
    params.append("title", `鲨鲨播播 (${count - 1}人在线)`);
    await fetch(`https://api.telegram.org/bot${botToken}/setChatTitle?${params.toString()}`);
  });
  const titleMessageIdMap: Map<number, number> = new Map();
  const removeTitle = async () => {
    const params = new URLSearchParams();
    params.append("timeout", "10");
    params.append("allowed_updates", JSON.stringify(["channel_post"]));
    const response = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates?${params.toString()}`);
    const json = await response.json();
    const updates = updatesSchema.parse(json);
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
    const deleteParams = new URLSearchParams();
    deleteParams.append("chat_id", chatId);
    deleteParams.append("message_ids", JSON.stringify(titleMessagesByDate.map(([_, messageId]) => messageId)));
    await fetch(`https://api.telegram.org/bot${botToken}/deleteMessages?${deleteParams.toString()}`);
    titleMessageIdMap.clear();
    titleMessageIdMap.set(latestTitleMessage[0], latestTitleMessage[1]);
    setTimeout(removeTitle, 1000);
  };
  setTimeout(() => {
    removeTitle();
  }, 1000);
}

connectToSocket();