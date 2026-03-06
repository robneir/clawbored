export interface ModelProvider {
  id: string;
  name: string;
  icon: string;
  docsUrl: string;
}

export interface ModelDefinition {
  id: string;
  name: string;
  provider: string;
  category: "flagship" | "standard" | "fast";
}

export interface ModelGroup {
  provider: ModelProvider;
  models: ModelDefinition[];
  hasApiKey: boolean;
}

export const PROVIDERS: ModelProvider[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    icon: "anthropic",
    docsUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "openai",
    name: "OpenAI",
    icon: "openai",
    docsUrl: "https://platform.openai.com/api-keys",
  },
];

export const DEFAULT_MODEL = "claude-opus-4-6";

export const CURATED_MODELS: ModelDefinition[] = [
  // Anthropic
  { id: "claude-opus-4-6", name: "Claude Opus 4.6", provider: "anthropic", category: "flagship" },
  { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", provider: "anthropic", category: "standard" },
  { id: "claude-opus-4-20250514", name: "Claude Opus 4", provider: "anthropic", category: "flagship" },
  { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", provider: "anthropic", category: "standard" },
  { id: "claude-haiku-3-5-20241022", name: "Claude Haiku 3.5", provider: "anthropic", category: "fast" },
  // OpenAI
  { id: "gpt-4o", name: "GPT-4o", provider: "openai", category: "flagship" },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "openai", category: "fast" },
  { id: "o3", name: "o3", provider: "openai", category: "flagship" },
  { id: "o3-mini", name: "o3 Mini", provider: "openai", category: "standard" },
  { id: "o4-mini", name: "o4 Mini", provider: "openai", category: "standard" },
];
