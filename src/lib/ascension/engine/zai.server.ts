/**
 * ASCENSION inference engine — independent of any platform.
 * Exports callZai / ZaiEngineError / zaiModel for existing imports.
 * Provider order: OpenAI (opt-in via ASCENSION_ALLOW_OPENAI_AI),
 * then OpenRouter free models, then LOCAL_LLM_BASE_URL.
 * Z.AI and Lovable keys are ignored even if present in env.
 */

export class ZaiEngineError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'ZaiEngineError';
  }
}

export function zaiModel(kind: 'flash' | 'pro' = 'flash'): string {
  if (kind === 'pro') {
    return process.env.ASCENSION_PRO_MODEL || process.env.OPENAI_PRO_MODEL || 'gpt-4o';
  }
  return process.env.ASCENSION_FLASH_MODEL || process.env.OPENAI_FLASH_MODEL || 'gpt-4o-mini';
}

interface CallZaiOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

export async function callZai(
  systemPrompt: string,
  userPrompt: string,
  options: CallZaiOptions = {},
): Promise<string> {
  const model = options.model || zaiModel('flash');
  const temperature = options.temperature ?? 0.7;
  const maxTokens = options.maxTokens ?? 4096;

  // 1. OpenAI — only when explicitly allowed
  if (process.env.ASCENSION_ALLOW_OPENAI_AI === 'true' && process.env.OPENAI_API_KEY) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature,
          max_tokens: maxTokens,
          response_format: options.jsonMode ? { type: 'json_object' } : undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content;
        if (text) return text;
      }
    } catch {
      // fall through
    }
  }

  // 2. OpenRouter free models
  if (process.env.OPENROUTER_API_KEY) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        },
        body: JSON.stringify({
          model: model.includes('/') ? model : `openai/${model}`,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature,
          max_tokens: maxTokens,
          response_format: options.jsonMode ? { type: 'json_object' } : undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content;
        if (text) return text;
      }
    } catch {
      // fall through
    }
  }

  // 3. Local LLM endpoint
  if (process.env.LOCAL_LLM_BASE_URL) {
    try {
      const base = process.env.LOCAL_LLM_BASE_URL.replace(/\/$/, '');
      const res = await fetch(`${base}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ].map((m) => ({
          model,
          messages: [m],
          temperature,
          max_tokens: maxTokens,
        }))),
      });
      // local servers vary; try OpenAI-style first
      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content;
        if (text) return text;
      }
    } catch {
      // fall through
    }
  }

  throw new ZaiEngineError(
    'No available inference provider. Set ASCENSION_ALLOW_OPENAI_AI + OPENAI_API_KEY, OPENROUTER_API_KEY, or LOCAL_LLM_BASE_URL.',
    503,
  );
}
