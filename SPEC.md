# Kravspecifikation / byggprompt – "Hockey Vision" (arbetsnamn)

> Detta dokument är skrivet så att det kan användas direkt som prompt till en AI-utvecklare
> (eller ett utvecklingsteam). Det beskriver vad som ska byggas, varför, och i vilken ordning.

---

## 1. Bakgrund

Tränare behöver kunna visa spelare *hur* en övning eller ett taktiskt scenario ska spelas ut.
Referensprodukten är **Hockey Coach Vision (HCV)** – https://hockeycoachvision.com – en app för
iPad/Mac/Windows/Android där tränaren ritar upp en övning i 2D och sedan spelar upp den som
animation i 2D och 3D.

### 1.1 Vad HCV gör (underlag från sajten, användarmanual v2.4 och 17 videotutorials)

**Drill Creator – tre lägen:**
1. **Objects** – placera objekt på isen: spelare (färg, nummer eller positionsbokstav som LW/RD,
   vänster-/högerfattning, riktning via "vridhjul"), tränare, puckar (en eller "hög"), mål (normal/
   tiny), koner, klubbor, sargavdelare, däck. Former: pilar, rektanglar, cirklar, textrutor (med
   tid för när de visas/försvinner).
2. **Action** – animera: välj spelare och *rita* åkväg med fingret. Rak linje = åkning utan puck,
   vågig linje = åkning med puck. Åtgärder: **Take** (ta puck inom räckvidd), **Pass** (klicka på
   mottagare), **Shoot** (klicka på mål; wrist/slap/snap/backhand), **Dump** (puck till yta, via
   sarg, rim, droppass), **Back** (pivotering till baklänges, vänster/höger), **Timing** (lägga
   tidpunkter för fartändring, stopp & vänta).
3. **Play** – spela upp: play/paus, tidslinje, visa åkvägar, zonväljare (zooma på en zon), vyer
   2D / 3D / förstapersons / tredjepersons, röstkommentar.

**Tidslinjen** är kärnan: varje spelare har en egen tidslinje med tidpunkter. Standardfart 20 km/h
(alternativt 14 eller 10 km/h för ungdom). Flytta en punkt åt höger = långsammare. Puckhändelser
(pass/skott) är låsta. "Grå skuggpunkter" visar var andra spelare befinner sig vid en viss tidpunkt
för att man ska kunna tajma passningar.

**Övrigt i HCV:** övningsbibliotek med taggar/filter, träningsplaner, kalender, roster/laguppställning,
PDF-export, delning till spelarappen, molnsynk, inline/ringette-rinkar, butik med färdiga övningar.

### 1.2 HCV:s stora svaghet – och vår möjlighet

I HCV är **allt skriptat**. Tränaren måste manuellt tajma varje skär och passning – 8 av 17
tutorials handlar enbart om timing ("Preventing offside", "Passing tips", "Delaying player
movement", "Advanced timing scenarios"...). Det är tidskrävande och spelarna reagerar aldrig på
varandra.

**Vår idé:** spelarna är **autonoma botar** med rimliga hockeyregler. Tränaren ritar upp
utgångsläget (och valfritt några nyckelrörelser), sedan *spelar botarna ut scenariot* utifrån
medspelare, motståndare, puckens position och sina roller. Tränaren kan blanda: "dessa två följer
min ritade väg, resten agerar själva".

---

## 2. Vision och avgränsning

**Kärnan (det viktigaste):** tränaren kan i 2D rita upp planen och sedan se en animation av hur
spelarna rör sig.

Vi börjar enkelt. Version 1 är en webbapp (React) som körs i webbläsaren på dator och iPad.
Ingen inloggning, ingen backend, inget 3D i v1.

---

## 3. Användare

| Roll | Behov |
|---|---|
| Tränare (primär) | Rita övningar/scenarion snabbt, se dem animerade, visa för spelare på tavla/iPad |
| Spelare | Titta på animationen, förstå sin roll |
| Utbildare | Demonstrera taktiska principer, låta botarna visa "vad händer om..." |

---

## 4. Funktionella krav

Prioritet: **M** = måste i v1 (MVP), **S** = bör i v1, **K** = kommande version.

### 4.1 Rink
- M: Toppvy 2D av en ishockeyrink, korrekt skalad (IIHF 60 × 30 m som standard) med mållinjer,
  blålinjer, mittlinje, tekningscirklar/punkter, målområden och mål.
- S: Visa hel rink eller halv rink (en zon).
- K: NHL-mått (61 × 26 m), inline-rink, zonzoom vid uppspelning.

### 4.2 Objekt (Objects-läge)
- M: Lägga ut spelare för **Lag A (hemma)** och **Lag B (borta)**, samt **målvakter**.
- M: Spelare har nummer eller positionsetikett (C, LW, RW, LD, RD, G) och riktning.
- M: Lägga ut puck(ar).
- M: Dra för att flytta, markera, ta bort (Delete-knapp / tangent).
- S: Koner, tränare.
- S: Snabbknapp "Startuppställning 5 mot 5" och "3 mot 2", "2 mot 1".
- K: Former och text med visningstid, fattning (V/H), egna färger.

### 4.3 Rörelser och händelser (Action-läge, skriptat)
- M: Rita åkväg för en spelare med mus/finger (fri hand, utjämnad kurva).
  - Utan puck ritas heldragen linje, med puck vågig linje (hockeystandard).
- M: Passning: välj puckförare → klicka mottagare. Streckad linje.
- M: Skott: välj puckförare → klicka mål. Dubbel/fet pil.
- M: Ordningen spelar roll: åkväg och puckhändelser läggs i en sekvens per spelare.
- S: Startfördröjning per spelare (börja åka efter X sekunder).
- S: Fart per segment (långsam / normal / snabb ≈ 10 / 20 / 28 km/h).
- S: Ångra (Undo) / gör om.
- K: Dump/rim/bank-pass, baklänges + pivot, stopp & vänta, skottyper.

### 4.4 Autonoma botar (Simulerings-läge) – vår differentiator
- M (enkel version): varje spelare utan ritad väg (eller efter att ritad väg tagit slut) styrs av
  ett **beteendeträd/regelsystem** baserat på roll och situation:
  - **Puckförare (anfall):** åker mot mål med pucken, söker yta, skjuter inom skottläge
    (t.ex. < 12 m från mål och fri vinkel), passar om en medspelare är bättre placerad och
    passningslinjen är fri från motståndare.
  - **Anfallare utan puck:** stöd – rör sig till fria ytor framför/bredvid puckföraren, håller
    bredd, undviker att stå i samma passningsskugga, åker in mot mål vid avslut (returer).
  - **Försvarare (lag utan puck):** närmaste spelare pressar puckföraren (gap control: håll
    avstånd ~2–4 m och ligg mellan puck och mål), övriga markerar närmaste farliga motståndare
    eller skyddar slottet (mitten framför mål).
  - **Målvakt:** stannar i målområdet, positionerar sig på linjen mellan puck och målets mitt.
  - **Lösa puckar:** närmaste spelare från vardera lag åker mot pucken.
- M: Rimlig **fysik/kinematik** så rörelsen ser ut som skridskoåkning:
  - Maxfart ~8 m/s (≈ 29 km/h) för vuxna, justerbart för ungdom.
  - Acceleration begränsad (~3–4 m/s²), inbromsning snabbare.
  - Begränsad svängradie som ökar med farten (inga 90°-svängar i full fart).
  - Spelare kan inte gå genom sarg eller varandra (enkel kollisionsundvikning).
  - Puck: hastighet vid pass ~15–20 m/s, skott ~25–35 m/s, friktion, studs mot sarg.
- M: Deterministisk simulering (samma utgångsläge ⇒ samma resultat) så att tränaren kan
  spola fram och tillbaka.
- S: Blandat läge – ritade vägar följs först, sedan tar boten över.
- S: "Spela igen med variation" (slumpfrö) för att visa olika utfall.
- K: Taktiska system som parametrar (forecheck 1-2-2 / 2-1-2, uppspel, powerplay-uppställning),
  offside/icing-regler, tackling, puckkamp.

### 4.5 Uppspelning (Play-läge)
- M: Play / paus / starta om.
- M: Tidslinje-reglage (scrubba fram och tillbaka), visa aktuell tid.
- M: Uppspelningshastighet 0.25× / 0.5× / 1× / 2×.
- S: Visa/dölj ritade linjer och "spår" (trail) bakom spelarna under uppspelning.
- K: 3D-vy (three.js / react-three-fiber), första-/tredjepersonskamera, röstkommentar.

### 4.6 Spara och dela
- M: Spara scenarion lokalt (localStorage) med namn; lista och öppna.
- S: Exportera/importera som JSON-fil.
- K: Molnlagring, delningslänk, bibliotek med taggar, träningsplaner, PDF-/video-export.

---

## 5. Icke-funktionella krav
- **Teknik:** React + TypeScript + Vite. Rendering i **SVG** för 2D (skarpt, lätt att träffa
  objekt med mus/touch). Simuleringsmotorn i ren TypeScript, frikopplad från React.
- **Prestanda:** 60 fps uppspelning med 12 spelare + puck på en iPad.
- **Touch:** fungera med finger/penna på iPad (Pointer Events), inte bara mus.
- **Determinism:** fast tidssteg (t.ex. 1/30 s). Hela förloppet förberäknas till en tidslinje av
  frames ⇒ scrubbning blir trivial.
- **Testbarhet:** motorn ska vara enhetstestbar (Vitest) utan DOM.
- **Språk:** svenskt UI i v1 (texter samlade så att engelska kan läggas till).

---

## 6. Datamodell (förslag)

```ts
type Vec = { x: number; y: number }            // meter, origo i rinkens mitt, x längs rinken

type Team = 'home' | 'away'
type Role = 'F' | 'D' | 'G'

interface Player {
  id: string; team: Team; role: Role; label: string   // "7", "LW"
  pos: Vec; heading: number                          // radianer
  control: 'script' | 'auto'                          // följ ritad väg eller bot
}

interface Puck { id: string; pos: Vec; carrierId?: string }

type Action =
  | { kind: 'skate'; playerId: string; path: Vec[]; speed: 'slow'|'normal'|'fast' }
  | { kind: 'pass';  playerId: string; toPlayerId: string }
  | { kind: 'shoot'; playerId: string; target: 'home'|'away' }   // vilket mål
  | { kind: 'wait';  playerId: string; seconds: number }

interface Scenario {
  id: string; name: string; createdAt: string
  rink: 'iihf' | 'nhl'
  players: Player[]; pucks: Puck[]
  actions: Action[]            // ordnade per spelare (sekvens)
  settings: { durationSec: number; seed: number; maxSpeed: number }
}

interface Frame { t: number; players: Record<string, {pos: Vec; heading: number; vel: Vec}>;
                  pucks: Record<string, {pos: Vec; carrierId?: string}> }
```

---

## 7. UI-skiss

```
┌──────────────────────────────────────────────────────────────────┐
│ Hockey Vision   [Nytt] [Spara] [Öppna]        Läge: (Rita)(Spela)│
├───────────┬──────────────────────────────────────────────────────┤
│ Verktyg   │                                                      │
│ ↖ Välj    │                 R I N K  (SVG)                       │
│ ● Lag A   │                                                      │
│ ● Lag B   │                                                      │
│ ◐ Målvakt │                                                      │
│ • Puck    │                                                      │
│ ～ Åk     │                                                      │
│ ⇢ Passa   │                                                      │
│ ⇒ Skjut   │                                                      │
│ ✕ Ta bort │                                                      │
│ Mallar ▾  │                                                      │
├───────────┴──────────────────────────────────────────────────────┤
│ ▶ ⏸ ⟲   ━━━━━━━●━━━━━━━━━━━━━  3.4 / 10.0 s   [0.5× 1× 2×]       │
│ ☐ Autonoma botar   ☐ Visa linjer   ☐ Visa spår                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 8. Acceptanskriterier för MVP
1. Jag kan öppna appen, se en rink, lägga ut 3 rödvita och 2 blå spelare, en målvakt och en puck.
2. Jag kan rita en åkväg för en spelare och se en linje (vågig om spelaren har puck).
3. Jag kan lägga en passning från puckföraren till en medspelare och ett skott mot mål.
4. Jag trycker Play och ser spelare åka längs sina vägar med mjuk acceleration och rimliga svängar,
   pucken följer föraren, passas och skjuts.
5. Jag kan dra i tidslinjen och se läget vid valfri tidpunkt.
6. Med "Autonoma botar" påslaget rör sig spelare utan ritade vägar själva på ett rimligt sätt:
   försvarare pressar puckföraren, målvakten följer pucken, anfallare stöttar.
7. Jag kan spara scenariot, ladda om sidan och öppna det igen.

---

## 9. Faser (översikt – se PLAN.md för detaljer)
1. **Fas 0** – Projektuppsättning (Vite + React + TS + Vitest).
2. **Fas 1** – Rink + objekt (placera, flytta, ta bort).
3. **Fas 2** – Rita åkvägar, passningar, skott.
4. **Fas 3** – Simuleringsmotor + uppspelning med tidslinje (skriptat).
5. **Fas 4** – Autonoma botar (regelbaserade beteenden).
6. **Fas 5** – Spara/öppna, mallar, polish.
7. **Senare** – 3D-vy, delning, bibliotek, träningsplaner, taktiska system, export till video.

---

## 10. Öppna frågor till tränaren/utbildaren
- Ska botarna följa regler som offside och icing redan tidigt?
- Vilka 3–5 scenarion är viktigast att kunna visa först? (förslag: 2 mot 1, 3 mot 2, uppspel,
  forecheck 1-2-2, försvar i egen zon)
- Ska tränaren kunna "pausa och ändra" mitt i en simulering och låta botarna fortsätta därifrån?
- Används appen mest på iPad vid sargen eller på storskärm i omklädningsrummet?
- IIHF- eller NHL-mått som standard (svenska rinkar varierar)?

---

## Källor
- https://hockeycoachvision.com/ (startsida, /features/, /support/)
- HCV User Manual 2.4 (PDF, länkad från /support/)
- Videotutorials 1–17 på /support/ och YouTube-kanalen "Hockey Coach Vision"
  (t.ex. "My First Drill", "Actions and Player Movement", "Preview & Viewing Options", "Timing Basics")
