import { readJsonFile, updateJsonFile } from "../lib/server/github-json.js";
import { handleApiError, HttpError, readJsonBody, requireSameOrigin, sendJson } from "../lib/server/http.js";

const CHAT_FILE = "chat-messages.json";
const EMPTY_CHAT = { messages: [] };
const MAX_MESSAGES = 200;

function validateMessage(input) {
  const message = typeof input.message === "string" ? input.message.trim() : "";
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!message || message.length > 500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(message)) {
    throw new HttpError(400, "Messages must contain 1 to 500 valid characters.");
  }
  if (name.length > 40 || /[\u0000-\u001f\u007f]/.test(name)) {
    throw new HttpError(400, "Names must be 40 characters or fewer.");
  }
  return { message, name: name || "Guest" };
}

function newestFirst(messages) {
  return [...messages].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function publicMessage(message) {
  return {
    id: message.id,
    name: message.name,
    message: message.message,
    createdAt: message.createdAt
  };
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const { data } = await readJsonFile(CHAT_FILE, EMPTY_CHAT);
      if (!data || !Array.isArray(data.messages)) throw new Error("GitHub chat storage must contain a messages array.");
      return sendJson(res, 200, { messages: newestFirst(data.messages).slice(0, MAX_MESSAGES).map(publicMessage) });
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      throw new HttpError(405, "Method not allowed.");
    }
    requireSameOrigin(req);
    const values = validateMessage(readJsonBody(req));
    const message = {
      id: globalThis.crypto.randomUUID(),
      ...values,
      createdAt: new Date().toISOString()
    };

    await updateJsonFile(CHAT_FILE, EMPTY_CHAT, data => {
      if (!data || !Array.isArray(data.messages)) {
        throw new Error("GitHub chat storage must contain a messages array.");
      }
      data.messages.push(message);
      data.messages = newestFirst(data.messages).slice(0, MAX_MESSAGES).reverse();
      return data;
    });

    return sendJson(res, 201, { message: publicMessage(message) });
  } catch (error) {
    handleApiError(res, error);
  }
}
