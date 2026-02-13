// ============================================================
// HfInferenceClient — HuggingFace Inference API backend
// ============================================================
//
// Uses the serverless HF Inference API (free tier).
// No native JSON format enforcement — relies on prompt engineering
// and phi-agent's defensive parseAction() fallback.
//
// Environment:
//   HF_TOKEN    HuggingFace API token (required)
//   HF_MODEL    Model ID (default: google/gemma-2-2b-it)

import type { LlmClient } from "./llm-client.js";

interface HfConfig {
  token: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

const DEFAULT_CONFIG: HfConfig = {
  token: process.env.HF_TOKEN || "",
  model: process.env.HF_MODEL || "google/gemma-2-2b-it",
  temperature: 0.4,
  maxTokens: 128,
};

const API_BASE = "https://router.huggingface.co/v1/chat/completions";

export class HfInferenceClient implements LlmClient {
  private config: HfConfig;

  constructor(config: Partial<HfConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    if (!this.config.token) {
      console.warn("[hf-client] Warning: HF_TOKEN not set. API calls will fail.");
    }
  }

  async generate(prompt: string, system?: string): Promise<string> {
    // Combine system + prompt, emphasizing JSON-only output
    const combined = system
      ? `${system}\n\nIMPORTANT: You MUST respond with ONLY a valid JSON object. No markdown, no explanation, no text before or after the JSON.\n\n${prompt}`
      : `IMPORTANT: You MUST respond with ONLY a valid JSON object. No markdown, no explanation, no text before or after the JSON.\n\n${prompt}`;

    return this.callApi(combined, this.config.maxTokens);
  }

  async generateText(prompt: string, system?: string, maxTokens = 300): Promise<string> {
    const combined = system ? `${system}\n\n${prompt}` : prompt;
    return this.callApi(combined, maxTokens);
  }

  async isAvailable(): Promise<boolean> {
    if (!this.config.token) return false;
    try {
      const res = await fetch(`https://huggingface.co/api/models/${this.config.model}`, {
        headers: { Authorization: `Bearer ${this.config.token}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  get modelName(): string {
    return this.config.model;
  }

  private async callApi(input: string, maxTokens: number): Promise<string> {
    const url = API_BASE;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [{ role: "user", content: input }],
        max_tokens: maxTokens,
        temperature: this.config.temperature,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      // Model loading — HF returns 503 while warming up
      if (res.status === 503) {
        throw new Error(`hf-client: model loading (503). Retry in a moment. ${body}`);
      }
      throw new Error(`hf-client error: ${res.status} ${res.statusText} — ${body}`);
    }

    const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
    if (!data.choices || data.choices.length === 0) {
      throw new Error("hf-client: empty response");
    }

    return data.choices[0].message.content;
  }
}
