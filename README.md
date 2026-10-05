# Animerade hockey övningar

Hockey Vision är ett verktyg för att skapa animerade hockeyövningar. Tränaren ritar upp en övning eller ett spelscenario i 2D och ser sedan hur spelarna rör sig när det spelas upp.

Spelarna kan antingen följa de rörelser tränaren ritar eller agera själva som autonoma botar. Botarna följer rimliga hockeyregler utifrån medspelare, motståndare och var pucken är.

https://willeeklund.github.io/hockey-animerade-ovningar/

## Funktioner

- **Spelyta:** hel rink i IIHF-mått (60 × 30 m) eller zonspel, där man spelar på bredden i en zon med burarna mot varandra.
- **Objekt:** spelare för två lag, målvakter, puckar, koner, målburar och skumsarg (2 m långa bitar som delar av isen; spelarna åker runt och puckar studsar mot dem).
- **Målburar:** ställ ut extra målburar var som helst med verktyget Målbur. Markera en målbur, även de vanliga, för att flytta den, vrida den 90° eller ta bort den (knappen eller Delete). Ett lag anfaller målburarna på sin anfallssida.
- **Instruktioner:** rita åkvägar (lugnt, normalt eller fullt tempo), passningar och skott. Linjerna ritas enligt hockeystandard: vågig linje med puck, streckad för pass och dubbel för skott.
- **Autonoma botar:**
  - Puckföraren söker mål, skjuter eller passar.
  - Har laget ingen målbur att anfalla blir det passningsmatch: laget håller pucken inom laget, spelarna utan puck söker en ledig stor yta och puckföraren passar en fri lagkamrat. Motståndarna pressar puckföraren och stänger passningsvägarna.
  - Medspelarna stöttar.
  - Försvararna pressar och täcker.
  - Målvakten följer pucken.
  - Alla åker runt koner.
  - Alla följer offsideregeln: spelare utan puck väntar vid offensiv blålinje och anpassar farten efter puckföraren tills pucken har passerat linjen. Hamnar någon ändå offside visas det på tidslinjen.
- **Markering:** ange att en spelare ska markera en motståndare. Markeraren följer sin spelare på målsidan med lagom avstånd (gap control), både när du flyttar motståndaren i ritläget och när övningen spelas upp. Principerna beskrivs i [MARKERING.md](MARKERING.md).
- **Huvudperson:** välj en spelare som scenens huvudperson. Den får en guldring och en guldfärgad svans, så att genomgången kan följa just den spelarens resa.
- **Rundor:** pausa mitt i ett förlopp och ge nästa runda instruktioner utifrån läget just då. En runda kan byta lagens anfallsriktning, till exempel när försvararna vinner pucken och blir anfallare mot samma mål.
- **Tränare och kö:** en tränare (T) står still, tar bara emot pass som är riktade till honom och passar när du ritar det. Spelare som står i kö syns blekta och deltar inte i förloppet.
- **Beskrivning:** varje scenario kan ha en text om syfte och upplägg. I helskärm visas namnet uppe till vänster, och beskrivningen fälls ut med ⓘ.
- **Uppspelning:** spela, pausa, spola och ändra hastighet. Pass, skott, räddningar och mål markeras på tidslinjen, och spåren visar hur spelarna har åkt.
- **Trimma slutet:** dra den röda markeringen ⟧ i slutet av tidslinjen åt vänster för att korta scenen, eller förbi slutet åt höger för att förlänga den (ungefär en sekund per 20 pixlar, högst 30 s åt gången). Du kan också pausa och trycka ✂ Sluta här. Scenen stannar vid slutet och startar om från början när du trycker play igen.
- **Spara och dela:** spara i webbläsaren eller exportera och importera som JSON.
- **Träningspass och helskärm:** sätt ihop dagens övningar i en lista och visa dem i helskärm för spelarna. I helskärm syns bara planen, play/paus, börja om och tidslinjen. Bläddra mellan övningarna med väljaren uppe till höger eller med piltangenterna. Ett helt pass kan exporteras och importeras som JSON.
- **Inbyggda träningspass:** i panelen Träningspass väljer man mellan sitt eget pass och inbyggda pass, till exempel gruppernas pass från BU2-kursen. Ett inbyggt pass kan visas i helskärm direkt eller kopieras till det egna passet för att ändras. Övningarna och de inskannade förlagorna finns i [`hockey-BU2-ovningar`](hockey-BU2-ovningar/README.md).
- **Mallar**, ordnade efter spelyta:
  - *Hel rink:* tom rink, 2 mot 1, 3 mot 2, 1 mot 1 med gap control, uppspel mot forechecking, 5 mot 5, powerplay 5 mot 4, markering 3 mot 3 och konslalom.
  - *Zonspel:* tom zon, 1 mot 1, 2 mot 2, 3 mot 2 (överläge) och 3 mot 3.

## Kortkommandon

| Tangent | Funktion |
|---|---|
| Mellanslag | Starta / pausa |
| V | Välj / flytta |
| Å | Åk |
| P | Passa |
| S | Skjut |
| K | Kon |
| M | Markera |
| Delete | Ta bort vald spelare (i runda 1 före start) |
| R | Börja om från början |
| Cmd/Ctrl + Z | Ångra (Shift för gör om) |
| Esc | Avbryt och gå tillbaka till Välj |

I helskärmsläget:

| Tangent | Funktion |
|---|---|
| Mellanslag | Starta / pausa (eller klicka på planen) |
| R | Börja om |
| → / PageDown | Nästa övning i passet |
| ← / PageUp | Föregående övning i passet |
| Esc | Lämna helskärm |

## Lokal utvecklingsmiljö

### Förutsättningar

- **Node.js 24** eller senare, med npm. Versionen står i [`.nvmrc`](.nvmrc). Med [nvm](https://github.com/nvm-sh/nvm) räcker det att köra `nvm use` i projektroten.
- **Git**.

Kontrollera versionen:

```bash
node --version
```

### Första gången

Klona repot och installera beroendena:

```bash
git clone git@github.com:willeeklund/hockey-animerade-ovningar.git
```

```bash
cd hockey-animerade-ovningar/app
```

```bash
npm ci
```

`npm ci` installerar exakt de versioner som står i `package-lock.json`. Använd `npm install` när du vill lägga till eller uppdatera ett paket.

### Starta appen

```bash
npm run dev
```

Öppna adressen som visas i terminalen, normalt http://localhost:5173. Sidan laddas om automatiskt när du sparar en fil.

### Kommandon

Alla kommandon körs i mappen `app/`.

| Kommando | Beskrivning |
|---|---|
| `npm run dev` | Startar utvecklingsservern med automatisk omladdning |
| `npm test` | Kör testerna för simuleringsmotorn (Vitest) |
| `npm run lint` | Kör lint (oxlint) |
| `npm run build` | Typkontrollerar och bygger en produktionsversion till `app/dist` |
| `npm run preview` | Visar det byggda resultatet lokalt, så som det kommer att se ut publicerat |

Kör gärna `npm run lint`, `npm test` och `npm run build` innan du pushar. Det är samma steg som körs i GitHub Actions.

## Publicering på GitHub Pages

Appen byggs och publiceras automatiskt på GitHub Pages vid varje push till `main`. Arbetsflödet finns i [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) och gör följande:

1. installerar beroenden med `npm ci`
2. kör lint och tester
3. bygger appen
4. publicerar `app/dist`

Misslyckas lint, tester eller bygget publiceras ingenting.

## Inställningar

Visningsinställningar finns i [`app/src/config.ts`](app/src/config.ts), till exempel hur många sekunder spåret efter spelarna visas (`trailSeconds`) och hur stort gap markerande spelare håller (`markGapScale`).

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
