import { SYSTEM_PROMPT, buildUserMessage } from './prompt';

/**
 * Cloudflare Worker — proxy do API modelu.
 *
 * Powod istnienia: GitHub Pages serwuje tylko pliki statyczne, wiec klucz API
 * nie moze znalezc sie we frontendzie. Worker przechowuje go w sekretach.
 */

export interface Env {
  /** wrangler secret put GEMINI_API_KEY */
  GEMINI_API_KEY: string;
  /** Domena demo, np. https://kacperkurowski02.github.io */
  ALLOWED_ORIGIN: string;
  /** Opcjonalny model; domyslnie gemini-2.5-flash. */
  MODEL?: string;
  /** Opcjonalny KV do limitowania zadan. Bez niego limit dziala per izolat. */
  RATE_LIMIT?: KVNamespace;
}

const MAX_TEXT_CHARS = 400_000; // ~10 MB PDF-a po ekstrakcji tekstu
const MAX_BODY_BYTES = 2_000_000; // zapas ponad MAX_TEXT_CHARS po zakodowaniu JSON
const MAX_PAGES = 10_000;
const RATE_LIMIT_PER_HOUR = 15;
const WINDOW_SECONDS = 3600;

interface AnalyzeRequest {
  fileName: unknown;
  pages: unknown;
  text: unknown;
  previousError?: unknown;
}

function corsHeaders(env: Env): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(body: unknown, status: number, env: Env): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(env) },
  });
}

/** Limit zadan na IP. Z KV dziala globalnie, bez KV — w obrebie jednego izolatu. */
const memoryBuckets = new Map<string, { count: number; resetAt: number }>();

async function isRateLimited(ip: string, env: Env): Promise<boolean> {
  const key = `rl:${ip}`;

  if (env.RATE_LIMIT) {
    const current = Number((await env.RATE_LIMIT.get(key)) ?? '0');
    if (current >= RATE_LIMIT_PER_HOUR) {
      return true;
    }
    await env.RATE_LIMIT.put(key, String(current + 1), { expirationTtl: WINDOW_SECONDS });
    return false;
  }

  const now = Date.now();
  const bucket = memoryBuckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    memoryBuckets.set(key, { count: 1, resetAt: now + WINDOW_SECONDS * 1000 });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT_PER_HOUR;
}

async function callModel(env: Env, userMessage: string): Promise<string> {
  const model = env.MODEL ?? 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': env.GEMINI_API_KEY,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
        // Dokument na kilkanascie stron daje dluga odpowiedz — bez tego limitu
        // JSON bywa uciety w polowie i nie przechodzi walidacji.
        maxOutputTokens: 8192,
        // Modele "myslace" zuzywaja budzet odpowiedzi na rozumowanie. Przy zadaniu
        // ekstrakcji danych nie jest ono potrzebne, a wydluza czas odpowiedzi.
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Model odpowiedzial bledem ${response.status}`);
  }

  const payload = (await response.json()) as {
    candidates?: {
      finishReason?: string;
      content?: { parts?: { text?: string; thought?: boolean }[] };
    }[];
  };

  const candidate = payload.candidates?.[0];
  // Odpowiedz moze skladac sie z kilku czesci, a czesci oznaczone jako `thought`
  // zawieraja rozumowanie modelu, nie wynik. Bierzemy wylacznie czesci wynikowe.
  const text = (candidate?.content?.parts ?? [])
    .filter((part) => part.thought !== true && typeof part.text === 'string')
    .map((part) => part.text)
    .join('');

  if (!text) {
    throw new Error(`Model zwrocil pusta odpowiedz (finishReason: ${candidate?.finishReason ?? 'brak'}).`);
  }
  if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
    throw new Error(`Odpowiedz modelu zostala przerwana (finishReason: ${candidate.finishReason}).`);
  }
  return text;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    // Przegladarka zawsze wysyla Origin, wiec zadanie z obcej domeny odpada tutaj.
    // Zadania bez naglowka Origin (curl, testy) przepuszczamy swiadomie — CORS chroni
    // przed wykorzystaniem endpointu przez cudza strone, nie jest mechanizmem
    // uwierzytelniania. Przed nadmiernym uzyciem broni limit zadan ponizej.
    const origin = request.headers.get('Origin');
    if (origin && origin !== env.ALLOWED_ORIGIN) {
      return json({ error: 'Niedozwolone zrodlo zadania.' }, 403, env);
    }

    if (request.method !== 'POST' || new URL(request.url).pathname !== '/analyze') {
      return json({ error: 'Nieznany endpoint.' }, 404, env);
    }

    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    if (await isRateLimited(ip, env)) {
      return json({ error: 'Przekroczono limit zadan. Sprobuj za godzine.' }, 429, env);
    }

    // Odrzucamy nadmiarowe zadanie PRZED wczytaniem tresci do pamieci.
    const declaredLength = Number(request.headers.get('Content-Length') ?? '0');
    if (declaredLength > MAX_BODY_BYTES) {
      return json({ error: 'Zadanie jest zbyt duze.' }, 413, env);
    }

    let body: AnalyzeRequest;
    try {
      body = (await request.json()) as AnalyzeRequest;
    } catch {
      return json({ error: 'Nieprawidlowe zadanie.' }, 400, env);
    }

    const { fileName, pages, text, previousError } = body;
    if (typeof fileName !== 'string' || typeof text !== 'string' || typeof pages !== 'number') {
      return json({ error: 'Brak wymaganych pol zadania.' }, 400, env);
    }
    // Liczba stron pochodzi z pdf.js, ale backend nie ufa temu, co przyszlo z sieci.
    if (!Number.isInteger(pages) || pages < 1 || pages > MAX_PAGES) {
      return json({ error: 'Nieprawidlowa liczba stron dokumentu.' }, 400, env);
    }
    // Limit rozmiaru takze po stronie backendu — walidacja we froncie jest do obejscia.
    if (text.length > MAX_TEXT_CHARS) {
      return json({ error: 'Dokument jest zbyt dlugi do analizy.' }, 413, env);
    }

    const userMessage = buildUserMessage({
      fileName: fileName.slice(0, 200),
      pages,
      text,
      ...(typeof previousError === 'string' ? { previousError: previousError.slice(0, 500) } : {}),
    });

    try {
      const raw = await callModel(env, userMessage);
      return json({ raw }, 200, env);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nieznany blad analizy.';
      return json({ error: message }, 502, env);
    }
  },
};
