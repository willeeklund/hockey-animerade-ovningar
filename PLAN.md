# Byggplan – Hockey Vision

Se `SPEC.md` för krav. Denna fil beskriver *hur* och i vilken ordning. `PROGRESS.md` loggar vad som är gjort.

## Arkitektur

```
src/
  model/types.ts         Datamodell (Scenario, Player, Puck, Action, Frame)
  model/rink.ts          Rinkmått och geometri (IIHF 60x30 m), målpositioner
  engine/vec.ts          Vektormatte
  engine/simulate.ts     Deterministisk simulering: Scenario -> Frame[] (fast dt = 1/30 s)
  engine/kinematics.ts   Skridskofysik: maxfart, acceleration, svängradie, sargkollision
  engine/puck.ts         Puckfysik: friktion, studs mot sarg, mottagning
  engine/ai.ts           Autonoma beteenden (roll + situation -> målpunkt/åtgärd)
  engine/*.test.ts       Vitest-tester för motorn
  store/useEditor.ts     Zustand-store: scenario, verktyg, markering, uppspelning
  components/Rink.tsx    SVG-rink (linjer, cirklar, mål)
  components/Canvas.tsx  Interaktion: placera/dra/rita (Pointer Events) + rendera objekt
  components/Toolbar.tsx Verktyg
  components/Timeline.tsx Play/paus/scrub/hastighet
  components/Library.tsx Spara/öppna
```

**Nyckelbeslut**
- **Koordinater i meter**, origo i mitten, x längs rinken (-30..30), y tvärs (-15..15). SVG viewBox i meter ⇒ ingen pixelomräkning i modellen.
- **Förberäkna hela förloppet** (`simulate()` returnerar `Frame[]`). Uppspelning = välja frame utifrån tid. Scrubbning gratis, determinism lätt att testa.
- **Skriptade spelare** följer sin ritade väg men via samma kinematik som botarna (styr mot nästa punkt på vägen, "pure pursuit"), så rörelsen ser naturlig ut och svängar blir mjuka.
- **Botar** väljer en *målpunkt* + *önskad fart* varje tick (regelbaserat, roll + situation), sedan sköter kinematiken resten. Puckåtgärder (pass/skott) bestäms av enkla nyttofunktioner (avstånd, fri passningslinje, skottvinkel).
- **Slumpfrö** (mulberry32) för variation men reproducerbarhet.

## Faser

### Fas 0 – Setup ✅ mål: `npm run dev` visar tom app
- Vite + React + TypeScript, Zustand, Vitest.

### Fas 1 – Rink + objekt
- SVG-rink IIHF med korrekt linjering.
- Verktyg: Välj, Lag A-spelare, Lag B-spelare, Målvakt, Puck, Ta bort.
- Klicka för att placera, dra för att flytta, Delete för att ta bort. Auto-numrering.
- Mallar: "2 mot 1", "3 mot 2", "5 mot 5 tekning".

### Fas 2 – Ritverktyg
- "Åk": dra från en spelare ⇒ fri-hand-väg (förenklas med Ramer–Douglas–Peucker + utjämning).
- Vågig linje om spelaren har pucken vid den tidpunkten i sekvensen.
- "Passa": klicka puckförare, sedan mottagare ⇒ streckad pil.
- "Skjut": klicka puckförare, sedan mål ⇒ dubbel pil.
- Sekvens per spelare (åk → passa → åk ...). Ångra senaste åtgärd.

### Fas 3 – Motor + uppspelning
- `simulate(scenario)`: per tick – uppdatera spelare (skript eller bot) → kinematik → puck.
- Pass: puck får hastighet mot mottagarens *förväntade* position (lead), mottagning inom 1 m.
- Skott: puck mot målmun, studs/stopp vid mål.
- Tidslinje: play/paus/scrub/hastighet, requestAnimationFrame.

### Fas 4 – Autonoma botar
- Roller: puckförare, stödspelare, pressande försvarare, markerande försvarare, slottskydd, målvakt, lös puck-jakt.
- Separation/kollisionsundvikning mellan spelare.
- Toggle "Autonoma botar": spelare utan ritad väg blir botar; skriptade blir botar när vägen tar slut.

### Fas 5 – Spara/öppna + polish
- localStorage-bibliotek, JSON export/import.
- Spår (trails), visa/dölj linjer, touch-förbättringar för iPad.

### Senare
- 3D med react-three-fiber, offside/icing, taktiska system som parametrar, delning, videoexport.
