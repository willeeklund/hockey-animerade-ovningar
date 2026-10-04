# Status – 2026-10-04

## Gjort
- **Research**: hockeycoachvision.com (startsida, features, support), användarmanual 2.4 (PDF), beskrivningar av 17 videotutorials. Insikt: HCV är helt skriptat, och det mesta arbetet för tränaren går åt till manuell timing. Autonoma botar löser just det.
- **SPEC.md**: kravspecifikation/byggprompt. **PLAN.md**: arkitektur och faser.
- **Fas 0–3 klara + en första version av fas 4 och 5** i `app/`:
  - SVG-rink i IIHF-mått (60 × 30 m), koordinater i meter.
  - Verktyg: välj/flytta, Lag A, Lag B, målvakt, puck, åk (frihand, utjämnad), passa, skjut, ta bort. Ångra/gör om. Etikett, roll, lag och riktning per spelare. "Vänta 1 s".
  - Vågig linje för åkning med puck, streckad för pass, dubbel för skott (hockeystandard).
  - Simuleringsmotor (`src/engine`): deterministisk, 30 Hz, förberäknar alla frames. Skridskokinematik (acceleration, svängradie beroende på fart, hockeystopp, sarg), puckfysik (friktion, studs, mål, målvaktsräddning/retur, passningsbrytning).
  - Autonoma botar (`src/engine/ai.ts`): puckförare (åk mot slottet, skjut, passa till bättre placerad medspelare med fri passningsväg), stödspelare (yttre korridorer, framför mål eller vid bortre stolpen), backar (släpar efter), försvar (närmaste spelare pressar med avstånd, övriga täcker spelare på målsidan), målvakt (står på linjen mellan puck och mål), jakt på lös puck, puckbrytningar.
  - Ritade händelser skyddas: botarna bryter inte tränarens ritade pass och tar inte pucken från en spelare som följer ritade rörelser. När de ritade rörelserna är slut tar boten över.
  - Uppspelning: play/paus, tidslinje att dra i, 0.25–2×, händelsemarkeringar (pass/skott/räddning/mål/bryt) som går att klicka på, spår efter spelarna.
  - Spara/öppna i localStorage, export/import av JSON. Mallar: tom rink, 2 mot 1, 3 mot 2, 5 mot 5.
  - Kortkommandon: mellanslag = play, Delete, Cmd/Ctrl+Z, Esc.
  - **Zonspel** (spelyta "Zonspel"): en zon där man spelar på bredden, med burarna mot varandra vid sargerna (30 × 22,5 m, burar 3 m från sargen). Mallar: Zonspel 2 mot 2 och 3 mot 3. Botarnas avstånd och korridorer skalas efter spelytan.
  - Målvakter rör sig i sidled mot positionen mellan puck och bur (tidigare gled de ut ur målet).
  - 7 enhetstester för motorn (Vitest), typkontroll och bygge går igenom.

## Kör
```
cd app && npm run dev     # http://localhost:5173
npm test
```

## Nästa steg (förslag)
1. Låta tränaren testa och ge feedback på botarnas beteende (det viktigaste att trimma).
2. Redigera befintliga rörelser: dra i ändpunkter, ta bort enstaka åtgärd, fart per segment i efterhand.
3. Skott på målvakt/stolpe och dump/rink-pass (manualens "Dump").
4. Baklänges åkning och pivotering för backar (gap control i baklänges).
5. Offside/icing i botlogiken; taktiska parametrar (forecheck 1-2-2 / 2-1-2).
6. "Pausa och ändra": fortsätta simuleringen från en vald tidpunkt.
7. 3D-vy med react-three-fiber.
