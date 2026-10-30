import { createServerFn } from "@tanstack/react-start";
import { createTransport } from "./pressure-runtime.mjs";

export const substrateStatus = createServerFn({ method: "GET" }).handler(async () => {
  return {
    tokenFactory: Boolean(process.env.NEBIUS_API_KEY),
    tavily: Boolean(process.env.TAVILY_API_KEY),
  };
});

export const probeLightning = createServerFn({ method: "POST" }).handler(async () => {
  const key = process.env.NEBIUS_API_KEY;
  if (!key) {
    return {
      ok: false as const,
      reason:
        "NEBIUS_API_KEY is not set. The bench is running the closed-world harness, priced at Token Factory rates." as string,
    };
  }
  try {
    const response = await createTransport(key)({
      system:
        'Return exactly one JSON object: {"token":"CALIBRATION_OK"}. No additional fields or reasoning.',
      user: "Return the connectivity token.",
      maxTokens: 96,
    });
    if (response.parsed.token !== "CALIBRATION_OK") {
      return {
        ok: false as const,
        reason: "The provider did not return the expected connectivity token." as string,
      };
    }
    return {
      ok: true as const,
      model: response.model,
      text: "Connection verified. Lightning returned the expected health token.",
      usage: response.usage,
    };
  } catch {
    return {
      ok: false as const,
      reason:
        "The provider did not complete the connectivity check. No successful response was recorded." as string,
    };
  }
});

export const probeTavily = createServerFn({ method: "POST" }).handler(async () => {
  const key = process.env.TAVILY_API_KEY;
  if (!key) {
    return {
      ok: false as const,
      reason:
        "TAVILY_API_KEY is not set. MRL still decides when a search is warranted. The call arms when the key is present.",
    };
  }
  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        query: "targeted customs examination HS code port berth dwell time",
        max_results: 2,
        search_depth: "basic",
        include_answer: false,
      }),
      signal: AbortSignal.timeout(20000),
    });
    const text = await response.text();
    if (!response.ok) {
      return { ok: false as const, reason: `Tavily ${response.status}: ${text.slice(0, 280)}` };
    }
    const json = JSON.parse(text) as { results?: { title?: string; url?: string }[] };
    const results = (json.results ?? []).slice(0, 2).map((item) => ({
      title: item.title ?? "Untitled",
      url: item.url ?? "",
    }));
    return { ok: true as const, results };
  } catch (error) {
    return {
      ok: false as const,
      reason: error instanceof Error ? error.message : "Tavily request failed.",
    };
  }
});