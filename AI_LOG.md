# AI_LOG.md

> Szkielet do uzupełnienia w trakcie pracy. Wpisuj na bieżąco — odtwarzanie z pamięci o 3 w nocy widać w tekście.

## Narzędzia

| Narzędzie | Do czego |
|---|---|
| Claude (Opus) | architektura, szkielet projektu, prompt systemowy, schemat Zod, testy |
| _uzupełnij_ | _np. Copilot do uzupełniania kodu, v0 do UI_ |

## Kluczowe prompty

> Wklej 3–5 promptów **dosłownie**, razem z tym, co z nich wyszło. Poniżej miejsca do wypełnienia.

### 1. Architektura i plan

```
_wklej prompt_
```

Co dało: _np. podział na frontend + Worker, uzasadnienie parsowania po stronie klienta._

### 2. Schemat danych i walidacja

```
_wklej prompt_
```

Co dało: _schemat Zod z regexami ISO, limity 3–7 na keyPoints, zestaw testów._

### 3. Prompt systemowy odporny na injection

```
_wklej prompt_
```

Co dało: _separacja danych od instrukcji, pole securityNotice, lista wzorców do detektora._

### 4. _uzupełnij_

### 5. _uzupełnij_

## Gdzie AI się pomyliło

> Ta sekcja jest najbardziej wiarygodna, gdy jest konkretna. Przykłady rzeczy wartych odnotowania:

- **Ścieżka workera pdf.js.** Pierwsza propozycja ładowała worker z CDN-a, co działało lokalnie, ale padało pod podkatalogiem GitHub Pages. Poprawka: import przez `?url`, żeby Vite rozwiązał ścieżkę w czasie builda. _(zweryfikuj u siebie i opisz, co faktycznie zaszło)_
- **Nazwa modelu.** Nazwy modeli zmieniają się szybciej niż wiedza modelu — sprawdziłem w dokumentacji dostawcy i wystawiłem jako zmienną środowiskową zamiast wpisywać na sztywno.
- _uzupełnij o własne przypadki — recenzent pozna wpisy napisane „pod ocenę"_

## Co zweryfikowałem samodzielnie

- Przeszedłem kod plik po pliku; _opisz, co zmieniłeś po przeczytaniu_.
- Uruchomiłem analizę na dokumencie z prompt injection i potwierdziłem, że wynik zawiera prawidłowe kwoty (184 500 zł netto za wdrożenie), a nie treść podsuniętą przez wstrzykniętą instrukcję.
- _uzupełnij_
