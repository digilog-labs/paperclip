export const type = "ollama_local";
export const label = "Ollama (local)";

export const DEFAULT_OLLAMA_URL = "http://localhost:11434";
export const DEFAULT_OLLAMA_MODEL = "llama3.2";
export const DEFAULT_TIMEOUT_SEC = 300;

// Populated dynamically via listModels() at runtime
export const models: { id: string; label: string }[] = [];

export const agentConfigurationDoc = `# ollama_local agent configuration

Adapter: ollama_local

Use when:
- You want to run a locally installed Ollama model as a Paperclip agent
- You have Ollama running on the same machine (or accessible via URL)
- You want to use open-source models (Llama, Qwen, Mistral, Gemma, etc.) without an API key

Don't use when:
- You need a coding agent with tool-use loop (use claude_local, codex_local, or hermes_local)
- Ollama is not installed or not running (check with: ollama list)
- You need cloud-hosted models (use claude_local, codex_local, etc.)

Core fields:
- ollamaUrl (string, optional): Ollama server URL. Defaults to http://localhost:11434
- model (string, optional): Model name as shown in \`ollama list\`. Defaults to llama3.2
- systemPrompt (string, optional): Custom system prompt prefix
- promptTemplate (string, optional): Task prompt template with {{variable}} placeholders
- timeoutSec (number, optional): Request timeout in seconds (default: 300)
- keepAlive (string, optional): How long to keep the model in memory (e.g. "5m", "1h", "-1" for forever)

Session fields:
- Sessions persist the conversation message history across heartbeats.
  The model remembers prior exchanges within the same session.

Notes:
- Ollama must be running: \`ollama serve\`
- Install a model first: \`ollama pull llama3.2\`
- Available models are discovered dynamically from the running Ollama instance.
- The adapter injects Paperclip context (agent ID, company, task) into the system prompt.
`;
