// ============================================================
// GroqClient — Groq API backend
// ============================================================
//
// Uses the Groq API (free tier, no credit card required).
// Supports response_format: json_object for reliable JSON output.
//
// Environment:
//   GROQ_API_KEY   Groq API key (required)
//   GROQ_MODEL     Model ID (default: llama-3.1-8b-instant)

import type { LlmClient } from "./llm-client.js";

interface GroqConfig {
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

const DEFAULT_CONFIG: GroqConfig = {
  apiKey: process.env.GROQ_API_KEY || "",
  model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
  temperature: 0.4,
  maxTokens: 128,
};

const API_BASE = "https://api.groq.com/openai/v1/chat/completions";

export class GroqClient implements LlmClient {
  private config: GroqConfig;

  constructor(config: Partial<GroqConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    if (!this.config.apiKey) {
      console.warn("[groq-client] Warning: GROQ_API_KEY not set. API calls will fail.");
    }
  }

  async generate(prompt: string, system?: string): Promise<string> {
    const messages: Array<{ role: string; content: string }> = [];
    if (system) {
      messages.push({ role: "system", content: system });
    }
    messages.push({ role: "user", content: prompt });

    return this.callApi(messages, this.config.maxTokens, { type: "json_object" });
  }

  async generateText(prompt: string, system?: string, maxTokens = 300): Promise<string> {
    const messages: Array<{ role: string; content: string }> = [];
    if (system) {
      messages.push({ role: "system", content: system });
    }
    messages.push({ role: "user", content: prompt });

    return this.callApi(messages, maxTokens);
  }

  async isAvailable(): Promise<boolean> {
    if (!this.config.apiKey) return false;
    try {
      const res = await fetch("https://api.groq.com/openai/v1/models", {
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  get modelName(): string {
    return this.config.model;
  }

  private async callApi(
    messages: Array<{ role: string; content: string }>,
    maxTokens: number,
    responseFormat?: { type: string },
  ): Promise<string> {
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages,
      max_tokens: maxTokens,
      temperature: this.config.temperature,
    };

    if (responseFormat) {
      body.response_format = responseFormat;
    }

    const res = await fetch(API_BASE, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      if (res.status === 429) {
        throw new Error(`groq-client: rate limited (429). ${text}`);
      }
      throw new Error(`groq-client error: ${res.status} ${res.statusText} — ${text}`);
    }

    const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
    if (!data.choices || data.choices.length === 0) {
      throw new Error("groq-client: empty response");
    }

    return data.choices[0].message.content;
  }
}
