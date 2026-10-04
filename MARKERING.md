# Markeringsspel: principer och algoritm

Det här dokumentet beskriver hur en spelare som har fått en markering (`Markera`) positionerar sig. Principerna kommer från vanlig coachlitteratur om man-man-täckning och gap control. Siffrorna är startvärden som är tänkta att justeras tillsammans med tränare.

## Principer

1. **Målsidan.** Markeraren ligger mellan sin spelare och det egna målet, aldrig bakom. Det kallas "defensive side" eller "inside position".
2. **Gap control mot puckföraren.** Avståndet mäts i klubblängder. Ungefär 1,5 klubblängd i neutralzonen och ungefär 1 klubblängd i egen zon. Avståndet krymper ju närmare målet spelet kommer och växer med motståndarens fart, så att markeraren inte blir passerad.
3. **Inside-out.** Mot puckföraren förskjuts markeraren lite mot mitten av isen. Då styrs anfallaren ut mot sargen, där det är mindre farligt.
4. **Nära pucken (stark sida).** Markeraren ligger tätt på spelaren, ungefär en klubblängd eller mindre. Positionen förskjuts lite mot pucken så att klubban hamnar i passningslinjen.
5. **Långt från pucken (svag sida).** Markeraren sjunker in mot slottet och skyddar mitten och bortre stolpen ("one on the puck, one on the net"). Avståndet till den egna spelaren får aldrig bli så stort att markeraren inte hinner ta igen det.
6. **Framför mål.** Kropp mot kropp, under en meter, alltid på målsidan.
7. **Se både puck och spelare** ("puck–you–man"-triangeln). Utan puck riktas blicken mellan sin spelare och pucken. Har den markerade spelaren pucken riktas blicken mot spelaren.
8. **Följ med i farten.** Markeraren matchar motståndarens fart och läser in var spelaren är på väg (0,4 sekunder framåt).
9. **När det egna laget vinner pucken** släpper markeraren och går över till anfallsspel. Markeringen tas upp igen om motståndarna återtar pucken.

## Algoritm

Indata är den markerade spelarens position och fart, det egna målets position, puckens position och om den markerade spelaren har pucken. En klubblängd räknas som 1,6 m.

| Situation | Avstånd på målsidan | Förskjutning |
|---|---|---|
| Har pucken, långt från mål (> 20 m) | 1,5 klubblängd + 0,15 s × fart | 0,4 m mot mitten (inside-out) |
| Har pucken, i egen zon (8–20 m) | 1 klubblängd | 0,4 m mot mitten |
| Har pucken, nära mål (< 8 m) | 0,7 klubblängd | 0,4 m mot mitten |
| Utan puck, framför mål (< 6 m) | 0,6 klubblängd | mot pucken 0,6 m |
| Utan puck, nära pucken (< 10 m) | 0,8 klubblängd | mot pucken 0,6 m |
| Utan puck, långt från pucken | 1 klubblängd | mot pucken 0,3 m, sjunker sedan upp till 30 % mot slottet (max 3,5 m från spelaren) |

Positionen räknas från var den markerade spelaren är om 0,4 sekunder. Den hålls innanför sargen. Farten är motståndarens fart plus ett tillägg som stänger avståndet.

Samma beräkning används på två ställen:
- **I simuleringen**, varje tidssteg.
- **I redigeringsläget**, där en markerande spelare direkt flyttar med när du drar motståndaren eller pucken.

Koden finns i [`app/src/engine/marking.ts`](app/src/engine/marking.ts).

## Källor

- [Explained: Man-to-Man Defensive Zone Coverage – The Coaches Site](https://members.thecoachessite.com/article/what-is-man-to-man-defensive-zone-coverage-in-hockey)
- [Elite Hockey Canada – Gap Control](https://www.elitehockeycanada.com/team-play/zone-play/role-and-responsibilities/gap-control)
- [Mastering Gap Control – King Cobras Hockey](https://www.kingcobrashockey.com/article/closing-the-gap-the-foundation-of-elite-defensive-play)
- [Defense Gap Control & Angling – HockeyShare](https://www.hockeyshare.com/drill/189345)
- [Defensive Zone Coverage Habits – Rinkhive](https://training.rinkhive.com/2026/03/16/defensive-zone-coverage-habits-positioning-stick-responsibility/)
- [Hockey Defensive Zone Coverage: Man vs Zone vs Hybrid](https://hoopsking.com/blogs/ice-hockey/hockey-defensive-zone-coverage)
