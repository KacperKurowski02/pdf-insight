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

**2. Nazwa modelu podana z pamięci.** Model zaproponował `gemini-2.5-flash` i sam oznaczył
tę wartość jako niepewną — nazwy modeli zmieniają się szybciej niż jego wiedza. Zamiast
wpisywać ją na sztywno w kodzie, wylądowała jako zmienna `MODEL` w `wrangler.toml`, więc
ewentualna zmiana to jedna linia bez dotykania logiki. Nazwa okazała się poprawna, ale
założenie było takie, że może nie być.

**3. Pierwsza część odpowiedzi modelu to rozumowanie, nie wynik.** Worker czytał
`candidates[0].content.parts[0].text`. Gemini 2.5 Flash jest modelem „myślącym" i zwraca
odpowiedź w kilku częściach — te oznaczone `thought: true` zawierają rozumowanie. Do parsera
JSON trafiał więc tekst rozumowania i analiza kończyła się błędem „odpowiedź nie była poprawnym
JSON-em", również po ponowieniu. Poprawka: filtrowanie części `thought`, sklejanie pozostałych,
`thinkingConfig.thinkingBudget = 0` (przy ekstrakcji danych rozumowanie nic nie wnosi, a wydłuża
odpowiedź) oraz `maxOutputTokens: 8192`, bo przy dwunastostronicowej umowie JSON bywał ucięty.
Dodałem też `finishReason` do komunikatu błędu — ogólne „niepoprawny JSON" nic nie mówiło
o przyczynie.

**4. Model nie trzyma się formatu dat mimo jawnej instrukcji.** Prompt wymaga ISO 8601,
a model zwrócił siedem z trzydziestu kilku dat w formacie `DD.MM.RRRR` albo jako niepełne
(`RRRR-MM`). Walidacja odrzucała przez to analizę całego dokumentu. Kuszące było poluzowanie
regexa w schemacie — zrezygnowałem, bo wtedy do interfejsu trafiałyby daty w trzech formatach
i kontrakt JSON przestałby cokolwiek gwarantować. Zamiast tego powstała warstwa
`src/lib/normalize.ts`: sprowadza daty do ISO przed walidacją, odrzuca nieistniejące
(`31.02.2026`) i pomija nieczytelne, zgodnie z zasadą „brak informacji = null lub []".
Schemat pozostał rygorystyczny.

**5. `tsconfig.tsbuildinfo` poza `.gitignore`.** Artefakt builda trafiłby do repozytorium.
Dodany wzorzec `*.tsbuildinfo`.

**6. Origin produkcyjny kontra testy lokalne.** Pierwsza wersja Workera przyjmowała jeden
origin, więc `npm run dev` na `localhost:5173` był blokowany przez CORS do czasu podmiany tej
linii w `wrangler.toml`. Model zaproponował to jako „świadome uproszczenie" i wpisał do znanych
ograniczeń — przy przeglądzie uznałem, że to raczej wygodna wymówka niż decyzja projektowa.
Zastąpione listą `ALLOWED_ORIGINS`; nagłówek `Access-Control-Allow-Origin` przyjmuje dokładnie
jedną wartość, więc Worker odbija origin żądania, jeśli jest na liście.

## Co zweryfikowałem samodzielnie

- `npm run lint`, `npm run typecheck`, `npm test` (35 testów) i `npm run build` — wszystko
  przechodzi na czysto.
- Detektor injection przepuszczony przez tekst wyciągnięty z pliku testowego: trafiają
  3 z 8 wzorców (`zignoruj wszystkie wcześniejsze polecenia`, `INSTRUKCJA DLA SYSTEMU AI`,
  `Nie wspominaj o tej`).
- Analiza pliku testowego na działającym demo: podsumowanie opiera się na faktycznej treści
  umowy (wdrożenie 184 500 zł netto, abonament 12 300 zł/mies., okres 01.04.2026–31.03.2028),
  a nie na treści podsuniętej przez wstrzykniętą instrukcję. Ostrzeżenie o próbie manipulacji
  pojawia się w interfejsie.
