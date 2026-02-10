// ============================================================
// OllamaClient — HTTP client for ollama inference API
// ============================================================
//
// ollama API: POST /api/generate (streaming or non-streaming)
// Default endpoint: http://localhost:11434
//
// In Docker: http://ollama:11434 (service name resolution)

export interface OllamaConfig {
  host: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

export interface OllamaResponse {
  response: string;
  done: boolean;
  total_duration?: number;
  eval_count?: number;
}

const DEFAULT_CONFIG: OllamaConfig = {
  host: process.env.OLLAMA_HOST || "http://localhost:11434",
  model: process.env.OLLAMA_MODEL || "phi3:mini",
  temperature: 0.4,
  maxTokens: 128,  // JSON-only response — increased for experiment stability
};

export class OllamaClient {
  private config: OllamaConfig;

  constructor(config: Partial<OllamaConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async generate(prompt: string, system?: string): Promise<string> {
    const body: Record<string, unknown> = {
      model: this.config.model,
      prompt,
      stream: false,
      format: "json",  // Structural constraint: force valid JSON output at token sampling level
      options: {
        temperature: this.config.temperature,
        num_predict: this.config.maxTokens,
      },
    };

    if (system) {
      body.system = system;
    }

    const res = await fetch(`${this.config.host}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`ollama error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as OllamaResponse;
    return data.response;
  }

  /** Generate free-form text (no JSON constraint). Used for reflection/response. */
  async generateText(prompt: string, system?: string, maxTokens = 800): Promise<string> {
    const body: Record<string, unknown> = {
      model: this.config.model,
      prompt,
      stream: false,
      options: {
        temperature: this.config.temperature,
        num_predict: maxTokens,
      },
    };

    if (system) {
      body.system = system;
    }

    const res = await fetch(`${this.config.host}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`ollama error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as OllamaResponse;
    return data.response;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.config.host}/api/tags`);
      return res.ok;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<string[]> {
    const res = await fetch(`${this.config.host}/api/tags`);
    if (!res.ok) return [];
    const data = (await res.json()) as { models: Array<{ name: string }> };
    return data.models.map((m) => m.name);
  }

  async ensureModel(): Promise<boolean> {
    const models = await this.listModels();
    if (models.some((m) => m.startsWith(this.config.model.split(":")[0]))) {
      return true;
    }
    console.log(`[ollama] Model ${this.config.model} not found. Pulling...`);
    const res = await fetch(`${this.config.host}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: this.config.model, stream: false }),
    });
    return res.ok;
  }

  get modelName(): string {
    return this.config.model;
  }
}

// === Standalone test ===
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  const client = new OllamaClient();
  console.log("[test] Checking ollama availability...");
  const available = await client.isAvailable();
  console.log(`[test] ollama available: ${available}`);
  if (available) {
    const models = await client.listModels();
    console.log(`[test] Models: ${models.join(", ") || "(none)"}`);
    if (models.length > 0) {
      console.log("[test] Generating test response...");
      const response = await client.generate("Say hello in one sentence.");
      console.log(`[test] Response: ${response}`);
    }
  }
}
