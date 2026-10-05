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
  - Uppspelning: play/paus, tidslinje att dra i, 0.25–2×, händelsemarkeringar (pass/skott/räddning/mål/bryt) som går att klicka på, spår efter spelarna (längd styrs av `trailSeconds` i `app/src/config.ts`, nu 2 s).
  - Spara/öppna i localStorage, export/import av JSON.
  - Sidomeny: Verktyg (Lag A, Lag B och Målvakt i en stängd grupp "Lägg till spelare"; verktyg som bara gäller i runda 1 före start är avstängda annars), Vald spelare (huvudperson, nummer och Vänta 1 s synliga; roll, lag, rensa rörelser och ta bort under "Fler val"), Mallar (med val av spelyta; visar mallarna för vald spelyta) och Simulering (stängd som standard, längst ner). Mallar för hel rink: tom rink, 2 mot 1, 3 mot 2, 1 mot 1 med gap control, uppspel mot forechecking, 5 mot 5, powerplay 5 mot 4, markering 3 mot 3, konslalom. För zonspel: tom zon, 1 mot 1, 2 mot 2, 3 mot 2 (överläge), 3 mot 3.
  - Stegskylt överst på planen för Markera, Passa och Skjut som visar vad nästa klick gör (steg 1 av 2 / steg 2 av 2).
  - **Koner** (verktyget Kon, tangent K): fasta punkter som spelarna åker runt. Alla spelare, både ritade och botar, tittar 5 m framåt och styr runt en kon i vägen med ca 1,1 m marginal; ett kollisionsskydd hindrar att någon åker igenom. Puckar påverkas inte av koner. Mall: Konslalom + skott.
  - **Markering** (verktyget Markera, tangent M): klicka på den som ska markera, sedan på motståndaren. Markeraren ligger på målsidan med gap control enligt principerna i `MARKERING.md` och släpper när det egna laget vinner pucken. I runda 1 flyttar markeraren med direkt när motståndaren eller pucken dras. Mall: Markering 3 mot 3.
  - **Huvudperson**: "★ Gör till huvudperson" i panelen för vald spelare. Huvudpersonen får en guldring med stjärna, och spelarens svans är guldfärgad (samma längd som övriga spelares).
  - **Offside** (hel rink): spelare utan puck, både botar och ritade, stannar 0,6 m före offensiv blålinje och anpassar farten så att de når linjen när puckföraren gör det. Är de inne i zonen när pucken är ute åker de ut (tag-up). Den som ändå är offside när pucken går in visas som händelsen "Offside" på tidslinjen. I zonspel finns ingen blålinje och ingen offside.
  - Pucken fäster vid klubban när den släpps intill en spelare (inom 1,6 m) i ritläget, och följer med när spelaren dras. Lösa puckar plockas inte upp av en spelare som dras förbi.
  - **Sarg** (Föremål → Sarg): blå skumsarg i 2 m-bitar, 0,2 m tjocka. Dra en linje för en rad, klicka för en bit. Spelarna åker runt änden av hela raden, puckar studsar, och botarna passar och skjuter inte genom sargen. Verktygen är grupperade i Spelare (Välj, Åk, Passa, Skjut, Markera) och Föremål (Puck, Kon, Sarg). Markera går tillbaka till Välj när en markering är klar.
  - Kortkommandon: mellanslag = start/paus, R = börja om, V/A/P/S/K/M = verktyg, Delete, Cmd/Ctrl+Z, Esc.
  - **Zonspel** (spelyta "Zonspel"): en zon där man spelar på bredden, med burarna mot varandra vid sargerna (30 × 22,5 m, burar 3 m från sargen). Mallar: Zonspel 2 mot 2 och 3 mot 3. Botarnas avstånd och korridorer skalas efter spelytan.
  - **Rundor**: kör ett startscenario, pausa (mellanslag) och ge nästa rundas instruktioner utifrån läget just då. Att rita med Åk/Passa/Skjut medan det är pausat skapar en ny runda vid den tidpunkten (eller knappen "Nästa runda härifrån"). Spelarna behåller position, fart och puckinnehav; de nya instruktionerna ersätter de gamla och spelare utan instruktioner fortsätter som botar. Rundorna visas som flikar ovanför tidslinjen och kan redigeras eller tas bort. Tidigare rundor påverkas inte.
  - Ritade spelare väjer bara i sidled för motståndare (tidigare kunde en pressande back stoppa en ritad åkväg), och raka åkvägar åks i normal fart (tidigare kröp spelaren fram).
  - Målvakter rör sig i sidled mot positionen mellan puck och bur (tidigare gled de ut ur målet).
  - **Träningspass och helskärm**: panelen Träningspass bygger en lista av sparade scenarion (lägg till aktuellt, som sparas automatiskt, eller sparade; flytta upp/ner; ta bort; namnge passet). Listan sparas i webbläsaren. Helskärm startas med ikonen uppe till höger på planen eller "Visa passet i helskärm". I helskärm visas bara planen, en diskret väljare uppe till höger (‹ lista ›) och play/börja om/tidslinje. Tangenter: mellanslag, R, ←/→, PageUp/PageDown, Esc. Scenariot som redigerades, med osparade ändringar och ångra-historik, återställs när man lämnar helskärm.
  - 19 enhetstester för motorn (Vitest), typkontroll och bygge går igenom.

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
