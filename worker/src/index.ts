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
  /** Lista dozwolonych origin, rozdzielona przecinkami. */
  ALLOWED_ORIGINS: string;
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

function allowedOrigins(env: Env): string[] {
  return env.ALLOWED_ORIGINS.split(',')
    .map((o) => o.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Naglowek Access-Control-Allow-Origin przyjmuje dokladnie jedna wartosc, nie liste,
 * wiec odbijamy origin zadania, jesli jest na liscie. `Vary: Origin` informuje
 * posrednie cache, ze odpowiedz zalezy od tego naglowka.
 */
function corsHeaders(env: Env, origin: string | null): Record<string, string> {
  const allowed = allowedOrigins(env);
  const match = origin && allowed.includes(origin.toLowerCase()) ? origin : (allowed[0] ?? '');
  return {
    'Access-Control-Allow-Origin': match,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(body: unknown, status: number, env: Env, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(env, origin) },
  });
}

/** Limit zadan na IP. Z KV dziala globalnie, bez KV — w obrebie jednego izolatu. */
const memoryBuckets = new Map<string, { count: number; resetAt: number }>();

async function isRateLimited(ip: string, env: Env): Promise<boolean> {
  // Okno o stalej dlugosci: numer okna jest czescia klucza, wiec licznik zeruje sie
  // sam co godzine. Gdyby kluczem bylo samo IP, a TTL odswiezal sie przy kazdym
  // zapisie, okno przesuwaloby sie w nieskonczonosc i uzytkownik, ktory przekroczyl
  // limit i probuje dalej, nigdy by sie z niego nie wydostal.
  const window = Math.floor(Date.now() / (WINDOW_SECONDS * 1000));
  const key = `rl:${ip}:${window}`;

  if (env.RATE_LIMIT) {
    const current = Number((await env.RATE_LIMIT.get(key)) ?? '0');
    if (current >= RATE_LIMIT_PER_HOUR) {
      return true;
    }
    // TTL z zapasem, zeby klucz zniknal po zamknieciu swojego okna.
    await env.RATE_LIMIT.put(key, String(current + 1), { expirationTtl: WINDOW_SECONDS * 2 });
    return false;
  }

  // Bez KV licznik zyje w pamieci pojedynczego izolatu — awaryjnie, nie docelowo.
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
    const origin = request.headers.get('Origin');

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env, origin) });
    }

    // Przegladarka zawsze wysyla Origin, wiec zadanie z obcej domeny odpada tutaj.
    // Zadania bez naglowka Origin (curl, testy) przepuszczamy swiadomie — CORS chroni
    // przed wykorzystaniem endpointu przez cudza strone, nie jest mechanizmem
    // uwierzytelniania. Przed nadmiernym uzyciem broni limit zadan ponizej.
    if (origin && !allowedOrigins(env).includes(origin.toLowerCase())) {
      return json({ error: 'Niedozwolone zrodlo zadania.' }, 403, env, origin);
    }

    if (request.method !== 'POST' || new URL(request.url).pathname !== '/analyze') {
      return json({ error: 'Nieznany endpoint.' }, 404, env, origin);
    }

    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    if (await isRateLimited(ip, env)) {
      return json({ error: 'Przekroczono limit zadan. Sprobuj za godzine.' }, 429, env, origin);
    }

    // Odrzucamy nadmiarowe zadanie PRZED wczytaniem tresci do pamieci.
    const declaredLength = Number(request.headers.get('Content-Length') ?? '0');
    if (declaredLength > MAX_BODY_BYTES) {
      return json({ error: 'Zadanie jest zbyt duze.' }, 413, env, origin);
    }

    let body: AnalyzeRequest;
    try {
      body = (await request.json()) as AnalyzeRequest;
    } catch {
      return json({ error: 'Nieprawidlowe zadanie.' }, 400, env, origin);
    }

    const { fileName, pages, text, previousError } = body;
    if (typeof fileName !== 'string' || typeof text !== 'string' || typeof pages !== 'number') {
      return json({ error: 'Brak wymaganych pol zadania.' }, 400, env, origin);
    }
    // Liczba stron pochodzi z pdf.js, ale backend nie ufa temu, co przyszlo z sieci.
    if (!Number.isInteger(pages) || pages < 1 || pages > MAX_PAGES) {
      return json({ error: 'Nieprawidlowa liczba stron dokumentu.' }, 400, env, origin);
    }
    // Limit rozmiaru takze po stronie backendu — walidacja we froncie jest do obejscia.
    if (text.length > MAX_TEXT_CHARS) {
      return json({ error: 'Dokument jest zbyt dlugi do analizy.' }, 413, env, origin);
    }

    const userMessage = buildUserMessage({
      fileName: fileName.slice(0, 200),
      pages,
      text,
      ...(typeof previousError === 'string' ? { previousError: previousError.slice(0, 500) } : {}),
    });

    try {
      const raw = await callModel(env, userMessage);
      return json({ raw }, 200, env, origin);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nieznany blad analizy.';
      return json({ error: message }, 502, env, origin);
    }
  },
};
