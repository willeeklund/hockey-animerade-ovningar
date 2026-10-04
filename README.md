# Animerade hockey övningar

Hockey Vision är ett verktyg för att skapa animerade hockeyövningar. Tränaren ritar upp en övning eller ett spelscenario i 2D och ser sedan hur spelarna rör sig när det spelas upp.

Spelarna kan antingen följa de rörelser tränaren ritar eller agera själva som autonoma botar. Botarna följer rimliga hockeyregler utifrån medspelare, motståndare och var pucken är.

## Funktioner

- **Spelyta:** hel rink i IIHF-mått (60 × 30 m) eller zonspel, där man spelar på bredden i en zon med burarna mot varandra.
- **Objekt:** spelare för två lag, målvakter, puckar och koner.
- **Instruktioner:** rita åkvägar (lugnt, normalt eller fullt tempo), passningar och skott. Linjerna ritas enligt hockeystandard: vågig linje med puck, streckad för pass och dubbel för skott.
- **Autonoma botar:**
  - Puckföraren söker mål, skjuter eller passar.
  - Medspelarna stöttar.
  - Försvararna pressar och täcker.
  - Målvakten följer pucken.
  - Alla åker runt koner.
- **Rundor:** pausa mitt i ett förlopp och ge nästa runda instruktioner utifrån läget just då.
- **Uppspelning:** spela, pausa, spola och ändra hastighet. Pass, skott, räddningar och mål markeras på tidslinjen, och spåren visar hur spelarna har åkt.
- **Spara och dela:** spara i webbläsaren eller exportera och importera som JSON.
- **Mallar:** 2 mot 1, 3 mot 2, 5 mot 5, zonspel och konslalom.

## Kortkommandon

| Tangent | Funktion |
|---|---|
| Mellanslag | Starta / pausa |
| V | Välj / flytta |
| A | Åk |
| P | Passa |
| S | Skjut |
| K | Kon |
| Delete | Ta bort markerad spelare |
| Cmd/Ctrl + Z | Ångra (Shift för gör om) |
| Esc | Avbryt och gå tillbaka till Välj |

## Kom igång

Kräver Node.js 20 eller senare.

```bash
cd app
npm install
npm run dev
```

Öppna sedan adressen som visas i terminalen, normalt http://localhost:5173.

| Kommando | Beskrivning |
|---|---|
| `npm run dev` | Startar utvecklingsservern |
| `npm test` | Kör testerna för simuleringsmotorn |
| `npm run lint` | Kör lint |
| `npm run build` | Bygger en produktionsversion till `app/dist` |

## Inställningar

Visningsinställningar finns i [`app/src/config.ts`](app/src/config.ts), till exempel hur många sekunder spåret efter spelarna visas (`trailSeconds`).

## Projektstruktur

```
app/src/
  model/       Datamodell och rinkens geometri
  engine/      Simuleringsmotor: skridskofysik, puck, botar (ren TypeScript, testad med Vitest)
  editor/      Redigeringslogik: tillstånd, rundor, mallar
  components/  React-komponenter: rink, verktyg, tidslinje, bibliotek
```

Mer bakgrund finns i:

- [SPEC.md](SPEC.md): kravspecifikation
- [PLAN.md](PLAN.md): arkitektur och faser
- [PROGRESS.md](PROGRESS.md): status och nästa steg

## Teknik

React, TypeScript, Vite, Zustand och Vitest. Rinken ritas i SVG. Simuleringen är deterministisk och körs i 30 Hz, så samma utgångsläge ger alltid samma förlopp.
