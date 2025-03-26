import OpenAI from "openai";

const openaiKey = process.env.OPENAI_API_KEY;

if (!openaiKey) {
  throw new Error("Missing OPENAI_API_KEY in environment variables");
}

export const openai = new OpenAI({ apiKey: openaiKey });
