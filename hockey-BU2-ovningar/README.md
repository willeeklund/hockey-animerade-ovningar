# Övningar från BU2-kursen

Inskannade övningar som grupperna ritade under kursen BU2 (Barn och ungdom steg 2, Svenska Ishockeyförbundet) helgen 3–4 oktober 2026.

Varje mapp innehåller en grupps skanningar och en `traningspass.json` med animerade övningar på gruppens tema. Filerna byggs in i appen som inbyggda träningspass. Välj dem i panelen **Träningspass**, under rubriken *Inbyggda pass – BU2-kursen*. Där kan man öppna en övning, visa passet i helskärm eller kopiera det till sitt eget träningspass. De inbyggda passen och mallarna i appen ändras inte.

`traningspass.json` har samma format som när man exporterar ett träningspass från appen (Träningspass → Exportera). Ändrar man en övning i appen kan passet exporteras och sparas över filen. Starta om `npm run dev` efter att en fil har lagts till.

## Filnamn och gruppindelning

Bilderna heter `GruppN-M.jpg`, där M är sidans nummer i gruppens skanning.

Skanningarna togs i fem omgångar, och filerna från samma omgång hör till samma grupp.

| Mapp | Originalfiler (CamScanner 2026-10-04) | Hur gruppen är bestämd |
|---|---|---|
| Grupp1 | 12.29_1–5 | Gissad. Står inte på papperen. |
| Grupp2 | 12.35_1–5 | "Grupp 2" står på sammanfattningssidan (Grupp2-5). |
| Grupp3 | 12.31_1–6 | Gissad. Sidorna är numrerade 1–6. |
| Grupp4 | 12.55_1–5 | "Grupp 4" står på första sidan. |
| Grupp5 | 12.33_1–7 | "Grupp 5" står på sidorna Grupp5-2, -3 och -5. |

Grupp 1 och Grupp 3 kan vara omkastade.

## Övningar

Tecken på papperen: △ är röda (Lag A) och ○ blå (Lag B).

Passen i appen följer gruppernas teman, men övningarna är omgjorda så att syftet syns direkt i animeringen. Skanningarna har varit inspiration. Varje övning har:

- **En titel som säger vad som tränas**, och en beskrivning med syfte, upplägg och rotation (ⓘ i helskärm).
- **Köer som flyttar fram.** Spelarna i kön syns blekta. När den första går iväg flyttar de andra fram, och den som är klar ställer sig sist i nästa led enligt rotationen.
- **En puck i spel åt gången.** Nästa repetition startar när pucken är död och förra gruppen har lämnat ytan framför mål. Puckar som inte är i spel, alltså i pucklådan, i målet eller undanlagda, syns blekta.
- **Riktiga beslut.** Målvakten täcker returer, försvarare som vinner pucken spelar ut den ur zonen, och en lös puck hämtas av en spelare från kön.

Chicago five behölls som den var och är den enda övningen där flera puckar är i spel samtidigt.

### Grupp 1 – Anfall och försvar i zon

| Övning | Syfte |
|---|---|
| Give and go: passa tränaren, gå på mål och skjut | Ge och gå, avslut i fart. Två led som byter sida. |
| 1 mot 1: forwarden utmanar, backen håller gapet | Forwarden utmanar i fart, backen håller gapet och stänger mot sargen. |
| 2 mot 1: håll bredden, tvinga backen att välja | Går backen på puckföraren passar han kamraten, annars skott. |

### Grupp 2 – Spelförståelse U14

| Övning | Syfte |
|---|---|
| Uppspel: back – ytter – center i fart | Back hämtar i hörnet, ytter på sargen, center i fart genom mitten. Rotation back → ytter → center. |
| 2 mot 1: puckföraren läser backen | Läsa backen och välja pass eller skott. |
| Powerplay 4 mot 2: pucken går runt boxen | Snabb puckrörelse i box, ingen håller pucken längre än cirka två sekunder, skott med skymning. |

### Grupp 3 – Från uppvärmning till powerplay

| Övning | Syfte |
|---|---|
| Uppvärmning: konslalom med puck och avslut | Puckföring i fart runt koner, sedan skott. |
| Give and go med avslut i fart | Ge och gå med tränaren. |
| Uppspel: backen hämtar, yttern vid sargen, centern i mitten | Uppspel i tre passningar. |
| Powerplay: snabba passningar och skott med skymning | Powerplay 4 mot 2. |

### Grupp 4 – Passningar, uppspel och gapkontroll

| Övning | Syfte |
|---|---|
| Passning i fart: ge och gå med tränaren | Passa och ta emot i fart. |
| Uppspel: tre passningar ut ur zonen | Uppspel back – ytter – center. |
| Gapkontroll: backen möter 1 mot 1 | Backens avstånd och vinkel mot forwarden. |

### Grupp 5 – Uppvärmning, anfall och uppspel

| Övning | Syfte |
|---|---|
| Chicago five: passa och åk efter | Uppvärmning. Passa till den främsta i ett valfritt led på andra sidan och ställ dig sist där. |
| 2 mot 1: anfall med två mot en back | Anfall med överläge. |
| Uppspel: backen hämtar och spelar upp | Uppspel back – ytter – center. |

## Hur övningarna byggs

Övningarna är inspelade med den riktiga simuleringsmotorn. Ett skript fattar besluten medan simuleringen körs: vem som står först i kön, när nästa repetition får starta, vart pucken ska passas och när ett fritt spel är över. Besluten sparas som vanliga instruktioner (åk, passa, skjut, vänta, vänta på pucken, spela fritt, lägg undan pucken), så uppspelningen i appen blir exakt densamma.
