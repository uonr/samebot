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
}

connectToSocket();