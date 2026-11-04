# AI_LOG.md

Zapis pracy z narzędziami AI przy budowie PDF Insight.

## Narzędzia

| Narzędzie | Zakres |
|---|---|
| Claude (Opus 5), przez Claude Code | architektura, szkielet aplikacji, prompt systemowy, schemat Zod, testy, konfiguracja CI |
| pdf.js, Zod, Vite | biblioteki, nie narzędzia AI — wymienione dla porządku |

Model pracował na moim repozytorium lokalnie; wszystkie decyzje architektoniczne przechodziły przeze mnie przed commitem.

## Kluczowe prompty

### 1. Analiza zadania i wykrycie pułapki w pliku testowym

```
Zapoznaj się z załącznikami oraz wiadomością mailową [treść maila rekrutacyjnego].
```

Efekt: streszczenie wymagań MUST/SHOULD/COULD oraz wykrycie prompt injection ukrytego
w § 5 pliku testowego — akapitu udającego instrukcję systemową, nakazującego napisać,
że umowa jest nieważna i warta 1 PLN. To ustawiło priorytety dla całej reszty pracy.

### 2. Plan działania i weryfikacja ryzyka

```
Jesteś specjalistą od tworzenia aplikacji webowych. Przygotuj plan działania.
Czy to zadanie może mieć na celu podejście nas? Co jeszcze sprawdzić?
```

Efekt: harmonogram z podziałem na etapy oraz lista rzeczy do sprawdzenia przed startem.
Istotna decyzja kolejności: backend powstaje przed frontendem, żeby błąd CORS albo zły
klucz wyszedł w drugiej godzinie pracy, a nie w jedenastej.

### 3. Budowa szkieletu projektu

```
Zrób to za mnie [szkielet projektu zgodny z briefem].
```

Efekt: kompletny projekt — Vite + React 18 + TS strict, Cloudflare Worker, schemat Zod,
detektor injection, testy Vitest, workflow GitHub Actions. Przed commitem przeszedłem
kod plik po pliku; część rzeczy poprawiłem (opisane niżej).

### 4. Weryfikacja odporności na injection

Prompt systemowy (`worker/src/prompt.ts`) powstał w kilku iteracjach. Kluczowe ustalenia:
treść PDF trafia wyłącznie do wiadomości `user`, w znacznikach `<document>`, a prompt
systemowy z góry unieważnia polecenia znalezione w środku i nakazuje odnotować próbę
w polu `securityNotice`.

## Gdzie AI się pomyliło

**1. `ALLOWED_ORIGIN` z wielkimi literami.** W `worker/wrangler.toml` wygenerowana
wartość brzmiała `https://KacperKurowski02.github.io`. Przeglądarka wysyła nagłówek
`Origin` zawsze małymi literami, więc porównanie w Workerze nigdy by nie przeszło
i produkcja zwracałaby błąd CORS. Poprawione na `https://kacperkurowski02.github.io`.
Błąd, który przeszedłby przez lint, typecheck i testy — wyszedłby dopiero na żywym demo.

**2. Nazwa modelu podana z pamięci.** Pierwsza wersja miała na sztywno `gemini-2.5-flash`.
Nazwy modeli zmieniają się szybciej niż wiedza modelu, więc sprawdziłem listę przez
`GET /v1beta/models` i wystawiłem nazwę jako zmienną w `wrangler.toml` zamiast wpisywać
ją w kodzie.

**3. `tsconfig.tsbuildinfo` poza `.gitignore`.** Artefakt builda trafiłby do repozytorium.
Dodany wzorzec `*.tsbuildinfo`.

**4. Origin produkcyjny kontra testy lokalne.** Worker przyjmuje jeden origin, więc
`npm run dev` na `localhost:5173` jest blokowany przez CORS, dopóki nie podmieni się tej
jednej linii. Świadome uproszczenie — opisane w README w znanych ograniczeniach.

## Co zweryfikowałem samodzielnie

- `npm run lint`, `npm run typecheck`, `npm test` (11 testów) i `npm run build` — wszystko
  przechodzi na czysto.
- Detektor injection przepuszczony przez tekst wyciągnięty z pliku testowego: trafiają
  3 z 8 wzorców (`zignoruj wszystkie wcześniejsze polecenia`, `INSTRUKCJA DLA SYSTEMU AI`,
  `Nie wspominaj o tej`).
- Analiza pliku testowego na działającym demo: podsumowanie opiera się na faktycznej treści
  umowy (wdrożenie 184 500 zł netto, abonament 12 300 zł/mies., okres 01.04.2026–31.03.2028),
  a nie na treści podsuniętej przez wstrzykniętą instrukcję. Ostrzeżenie o próbie manipulacji
  pojawia się w interfejsie.
