// ============================================================
// LlmClient — Abstract interface for LLM inference backends
// ============================================================
//
// Implementations:
//   OllamaClient  — Local Ollama API (default, development)
//   HfInferenceClient — HuggingFace Inference API (deployment)
//
// Switch via LLM_BACKEND env var: "ollama" | "huggingface"

export interface LlmClient {
  /** Generate JSON-constrained response (evaluation). */
  generate(prompt: string, system?: string): Promise<string>;

  /** Generate free-form text (narrative, reflection). */
  generateText(prompt: string, system?: string, maxTokens?: number): Promise<string>;

  /** Check if the backend is reachable. */
  isAvailable(): Promise<boolean>;

  /** Model identifier string. */
  readonly modelName: string;
}
