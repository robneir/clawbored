import { NextResponse } from "next/server";
import { getKeyForProvider } from "@/lib/provider-keys";
import {
  PROVIDERS,
  CURATED_MODELS,
  type ModelDefinition,
  type ModelGroup,
} from "@/lib/models";

// In-memory cache: provider → { models, fetchedAt }
const modelCache = new Map<string, { models: ModelDefinition[]; fetchedAt: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function fetchAnthropicModels(apiKey: string): Promise<ModelDefinition[]> {
  const res = await fetch("https://api.anthropic.com/v1/models", {
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.data || [])
    .filter((m: { id: string }) => m.id.startsWith("claude-"))
    .map((m: { id: string; display_name?: string }) => ({
      id: m.id,
      name: m.display_name || m.id,
      provider: "anthropic",
      category: classifyModel(m.id),
    }));
}

async function fetchOpenAIModels(apiKey: string): Promise<ModelDefinition[]> {
  const res = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return [];
  const data = await res.json();
  const chatPrefixes = ["gpt-4", "gpt-3.5", "o1", "o3", "o4", "chatgpt-"];
  return (data.data || [])
    .filter((m: { id: string }) =>
      chatPrefixes.some((p) => m.id.startsWith(p))
    )
    .map((m: { id: string }) => ({
      id: m.id,
      name: m.id,
      provider: "openai",
      category: classifyModel(m.id),
    }));
}

function classifyModel(id: string): "flagship" | "standard" | "fast" {
  const lower = id.toLowerCase();
  if (lower.includes("opus") || lower.includes("pro") || lower.includes("large") || lower === "gpt-4o" || lower === "o3") return "flagship";
  if (lower.includes("mini") || lower.includes("haiku") || lower.includes("flash") || lower.includes("small")) return "fast";
  return "standard";
}

const fetchers: Record<string, (key: string) => Promise<ModelDefinition[]>> = {
  anthropic: fetchAnthropicModels,
  openai: fetchOpenAIModels,
};

async function fetchModelsForProvider(
  providerId: string,
  apiKey: string
): Promise<ModelDefinition[]> {
  const cached = modelCache.get(providerId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.models;
  }

  const fetcher = fetchers[providerId];
  if (!fetcher) return [];

  try {
    const models = await fetcher(apiKey);
    if (models.length > 0) {
      modelCache.set(providerId, { models, fetchedAt: Date.now() });
      return models;
    }
  } catch {
    // Fall through to curated
  }

  return [];
}

async function getAvailableModels(): Promise<ModelGroup[]> {
  const groups: ModelGroup[] = [];

  for (const provider of PROVIDERS) {
    const apiKey = await getKeyForProvider(provider.id);
    const hasApiKey = !!apiKey;

    let models: ModelDefinition[];
    if (apiKey) {
      const live = await fetchModelsForProvider(provider.id, apiKey);
      if (live.length > 0) {
        models = live;
      } else {
        models = CURATED_MODELS.filter((m) => m.provider === provider.id);
      }
    } else {
      models = CURATED_MODELS.filter((m) => m.provider === provider.id);
    }

    // Deduplicate by id
    const seen = new Set<string>();
    const unique = models.filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });

    // Sort: flagship first, then standard, then fast
    const order = { flagship: 0, standard: 1, fast: 2 };
    unique.sort((a, b) => order[a.category] - order[b.category]);

    groups.push({ provider, models: unique, hasApiKey });
  }

  return groups;
}

export async function GET() {
  try {
    const groups = await getAvailableModels();
    return NextResponse.json({ groups });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load models";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
