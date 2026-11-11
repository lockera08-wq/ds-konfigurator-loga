# Konfigurátor loga DS – plán projektu

Stav: návrh ke schválení (verze 1, 11. 11. 2026)

## 1. Cíl

Webová aplikace (konfigurátor), ve které:

1. nahraju libovolný 3D model (STL, později i 3MF/OBJ),
2. na jeho povrch „připnu“ logo DS – zapuštěný kruh, ve kterém je logo vystouplé,
3. logo mohu táhnout myší po povrchu modelu, otáčet, zvětšovat/zmenšovat, měnit hloubku zapuštění i výšku reliéfu,
4. logo je vždy vidět, kde je (zvýrazněný obrys + ukazatel),
5. výsledný model stáhnu jako STL (a volitelně 3MF se samostatným tělesem loga pro vícebarevný tisk v Bambu Studiu).

## 2. Co máme k dispozici v PC

| Nástroj | Stav | Použití v projektu |
|---|---|---|
| Node.js 26 + npm | nainstalováno | běh a sestavení webové aplikace |
| Blender | nainstalováno | záloha pro přípravu loga / kontrolu modelů |
| OpenSCAD | nainstalováno | záloha pro skriptovou variantu |
| Bambu Studio | nainstalováno | kontrola výstupu, slicování, vícebarevný tisk |
| PrusaSlicer | nainstalováno | kontrola výstupu |
| Python | pouze zástupce ze Storu, nefunkční | zatím nepotřebujeme |
| Git | není | doporučím nainstalovat kvůli verzování |

## 3. Doporučená architektura (varianta A)

Jednostránková webová aplikace běžící v prohlížeči. Vše se počítá u uživatele, žádný server není potřeba. Později ji lze vložit do e-shopu.

| Vrstva | Technologie | Proč |
|---|---|---|
| 3D zobrazení | Three.js | standard pro 3D v prohlížeči, načítání STL, ovládání kamery |
| Umístění loga na povrch | raycasting (paprsek z myši na síť modelu) | dává bod dopadu a normálu povrchu; logo se natočí kolmo k povrchu |
| Booleovské operace (zapuštění kruhu, vystouplé logo) | Manifold (WebAssembly) | robustní, rychlý, výstup je vždy vodotěsný = tisknutelný |
| Oprava děravých STL | three-bvh-csg jako záloha + hlášení problémů | Manifold vyžaduje uzavřenou síť; mnoho STL z internetu ji nemá |
| Logo | SVG → extruze (Three.js ExtrudeGeometry) | vektor je nutný pro čisté hrany; z PNG se musí nejdřív vektorizovat |
| Export | STL (binární), 3MF | STL pro kohokoli, 3MF zachová logo jako samostatné těleso pro vícebarevný tisk |
| UI | HTML + CSS, bez těžkého frameworku (nebo React, pokud bude integrace do shopu) | rychlý start, snadná integrace |
| Build | Vite | rychlý vývoj a jeden statický výstup, který jde kamkoli nahrát |

## 4. Jak bude fungovat logo na modelu

Parametry, které uživatel ovládá:

| Parametr | Výchozí | Rozsah | Poznámka |
|---|---|---|---|
| Průměr kruhu | 20 mm | 5–200 mm | zapuštěný kruh |
| Hloubka zapuštění | 1,0 mm | 0–10 mm | kolik se kruh zapustí do povrchu |
| Výška reliéfu loga | 0,8 mm | 0–10 mm | o kolik logo vystupuje ze dna kruhu |
| Velikost loga v kruhu | 75 % průměru | 20–100 % | okraj mezi logem a hranou kruhu |
| Otočení | 0° | 0–360° | kolem osy kolmé k povrchu |
| Vysunutí/zasunutí | 0 mm | ±10 mm | posun celé sestavy podél normály povrchu |
| Zrcadlení | ne | ano/ne | pro vnitřní strany |

Chování:

- Klik na model = připnutí loga do bodu dopadu, natočené podle normály povrchu.
- Tažení myší při držení loga = logo klouže po povrchu (každý pohyb znovu vystřelí paprsek a aktualizuje pozici i normálu).
- Logo je vždy zvýrazněné (barevný obrys kruhu + malý ukazatel), i když je skryté za modelem (průhledný obrys).
- Náhled booleovské operace se přepočítá po puštění myši nebo po změně parametru (ne při každém pixelu tažení, aby to bylo svižné).
- Na zakřiveném povrchu: kruh se zapustí rovinně (jednoduché, tisknutelné). Varianta „přizpůsobit zakřivení“ je rozšíření pro později.

## 5. Fáze stavby (krok po kroku)

| Fáze | Co vznikne | Výstup pro kontrolu |
|---|---|---|
| 0. Příprava loga | vektorové logo DS (SVG), test extruze do 3D | náhled loga ve 3D |
| 1. Kostra aplikace | projekt (Vite + Three.js), načtení STL, otáčení kamery, mřížka, rozměry modelu | nahraju STL a vidím ho |
| 2. Připnutí loga | klik → logo na povrchu, tažení po povrchu, zvýraznění | logo „jezdí“ po modelu |
| 3. Panel parametrů | posuvníky: průměr, hloubka, reliéf, velikost, otočení, vysunutí, zrcadlení | vše se mění živě |
| 4. Booleovské operace | zapuštěný kruh + vystouplé logo opravdu vyřezané do modelu (Manifold) | skutečná geometrie, ne jen náhled |
| 5. Export | stažení STL a 3MF, kontrola v Bambu Studiu | vytisknutelný soubor |
| 6. Vychytávky | více log najednou, zpět/vpřed, uložení nastavení, presety, kontrola a oprava děravých STL | pohodlné používání |
| 7. Nasazení | lokálně, nebo nahrání na web, nebo vložení do e-shopu | odkaz, kde to běží |

Po každé fázi ukážu výsledek, ty odsouhlasíš a jdeme dál.

## 6. Rozhodnutí ke schválení (verze 1)

Viz tabulky v chatu. Po schválení je zapíšu sem do sekce „Schválená rozhodnutí“.

## 7. Schválená rozhodnutí

| Rozhodnutí | Schválená varianta | Datum |
|---|---|---|
| 1. Platforma | A – vlastní webová aplikace (Three.js + Manifold) | 11. 11. 2026 |
| 0. Vektorizace loga | A – automaticky z obrázku (potrace), ke kontrole | 11. 11. 2026 (zadavatel nechal na mně) |
| 2. Motor pro vyřezání | A – Manifold (WebAssembly), záloha three-bvh-csg | 11. 11. 2026 (zadavatel nechal na mně) |
| 3. Tvar loga | A – zapuštěný kruh, logo vystouplé, vršek v rovině povrchu; vysunutí posuvníkem | 11. 11. 2026 (zadavatel nechal na mně) |
| 4. Výstup | A+B – STL i 3MF (logo jako samostatné těleso) | 11. 11. 2026 (zadavatel nechal na mně) |
| 5. Běh | A – zatím lokálně, hosting ve fázi 7 | 11. 11. 2026 (zadavatel nechal na mně) |
| 6. Ovládání loga | A – klik připne, tažení myší po povrchu, horní strana loga automaticky nahoru, oranžový obrys viditelný skrz model, levé tlačítko na logu = tažení | 11. 11. 2026 |
| 7. Provedení na háčku | A – zapuštěný kruh 0,4 mm, logo vystouplé 0,4 mm, vršek v rovině hřbetů, kruh 8 mm | 11. 11. 2026 |
| 8. Tisk testu | A – tryska 0,4, vrstva 0,12 mm, PETG, orientace jako v původním projektu | 11. 11. 2026 |
| 9. Vyřezání | A – vršek loga zarovnaný na nejvyšší bod v kruhu (hřbety), rovné dno, automatické zesílení tenkých míst (výchozí min. 0,5 mm), přepočet automaticky po puštění myši / změně parametru, pokus o opravu děravého modelu | 11. 11. 2026 |
| 10. Export | A – binární STL (jedno těleso), 3MF s jedním objektem a dvěma částmi (model + logo DS), název originál + „-logo-DS“, původní souřadnice, kontrola uzavřenosti | 11. 11. 2026 |
| 11. Vychytávky | A – více log, uložení/načtení JSON + automatické uložení v prohlížeči, zpět/vpřed, presety velikostí, automatický pokus o opravu děravých STL, varování na hraně, výběr dílu z 3MF | 11. 11. 2026 |
| 12. Nasazení | B – statický hosting na webu; vše se počítá v prohlížeči, modely se nikam nenahrávají. Upřesněno: GitHub Pages (veřejný repozitář, nasazení přes GitHub Actions) | 11. 11. 2026 |

## 7b. Průběh

| Fáze | Stav | Poznámka |
|---|---|---|
| 0. Příprava loga | hotovo 11. 11. 2026 | `logo/DS-logo.svg`, porovnání v `logo/DS-logo-porovnani.png`; extruze do 3D ověřena v aplikaci |
| 1. Kostra aplikace | hotovo 11. 11. 2026 | nahrání STL i 3MF (tlačítko i přetažení), ukázkový model, rozměry, mřížka, drátový model, náhled loga vedle modelu; u 3MF sady se načte 1 kus |
| 2. Připnutí loga | hotovo 11. 11. 2026 | klik = připnutí, tažení po povrchu (rychlý raycasting přes BVH i na 379 tis. trojúhelnících), orientace nahoru, oranžový obrys a terčík viditelné skrz model, ověřeno na háčku |
| 3. Panel parametrů | hotovo 11. 11. 2026 | průměr, zapuštění, reliéf, velikost loga, otočení, vysunutí, zrcadlení; varování k tisku podle šířky loga |
| 4. Booleovské operace | hotovo 11. 11. 2026 | Manifold ve Web Workeru; háček (379 tis. trojúhelníků) ≈ 1,5 s; dorovnání na nejvyšší bod v kruhu; výplň drážek pod kruhem (medailon, volitelné); zesílení tenkých míst loga (min. tah); vyhlazená normála z okolí bodu (žebrování); tlačítko „Přiblížit na logo“ |
| 5. Export | hotovo 11. 11. 2026 | tlačítka Stáhnout STL / 3MF; STL = jedno uzavřené těleso (logo překrývá 0,3 mm do dna), 3MF = jeden objekt se dvěma částmi; původní souřadnice; kontrola uzavřenosti; CLI `npm run apply` vyrobí soubory bez prohlížeče; první testovací soubory ve `vystup/` |
| 6. Vychytávky | hotovo 11. 11. 2026 | více log (seznam, Přidat/Odebrat, Delete), zpět/vpřed (Ctrl+Z/Y), Uložit/Načíst nastavení (JSON, stejný formát bere i CLI `--config`), automatické uložení posledního stavu v prohlížeči pro každý model, presety Háček 8 / Střední 20 / Velké 40, pokus o opravu děravé sítě (sloučení vrcholů s rostoucí tolerancí) + srozumitelné hlášení, varování když kruh přesahuje hranu, výběr dílu z 3MF s více díly |
| 7. Nasazení | připraveno 11. 11. 2026, čeká na Git + GitHub účet | produkční build ověřen (`vite preview` i v podsložce jako na Pages); workflow `.github/workflows/deploy.yml` nasazuje při pushi do `main`; návod v NASAZENI.md; zákaz indexace (meta robots); Cloudflare jako alternativa (`npm run deploy`) |

Oprava v průběhu fáze 5: logo z potrace je jeden souvislý obrys (díra v D je spojená s okolím úzkou mezerou), SVGLoader ho četl špatně. Logo se teď načítá z `public/DS-logo-polygons.json` (`npm run logo:polygons`), stejný soubor používá aplikace i CLI.

## 7c. Testovací produkt: háček DS-007 (S)

Zdroj: `produkty/DS-007-hacky-S-sada-20ks.3mf` (Bambu Studio projekt, 20 ks na podložce, všechny odkazují na jednu síť).
Jeden kus vytažen do `produkty/DS-007-hacek-S.stl` (378 740 trojúhelníků).

| Měření | Hodnota |
|---|---|
| Rozměry háčku | 30 × 9,4 × 60 mm (S leží v rovině XZ, tloušťka 9,4 mm v ose Y) |
| Tloušťka tahu S (v rovině S) | ≈ 5–6 mm (první odhad 2 mm byl chybný, měřil jen lištu na okraji) |
| Rovné boky S (y = ±4,7) | hladké, přečnívají jako lišty 0,6 mm nad hřbety žeber |
| Vnější pás (po obvodu S) | 9,4 mm široký: 2 krajní lišty + 3 hřbety × 0,6 mm + 4 drážky × 1,6 mm, hloubka drážky 0,8 mm, zakřivený (R ≈ 15 mm) |
| Místo pro logo | vnější žebrovaný pás, kruh 8 mm; dno medailonu 0,4 mm pod lištami = 0,2 mm nad hřbety |

Logo DS – tloušťky tahů (z vektoru): typický tah ≈ 14 % šířky loga, špičky S a klín mezi D a S ≈ 3–9 % šířky.

| Šířka loga | Typický tah | Nejtenčí místa | Tisk 0,4 mm tryska |
|---|---|---|---|
| 6 mm (kruh 8 mm) | 0,85 mm | 0,2–0,5 mm | čitelné, špičky se zaoblí; nutná „tisková“ úprava loga |
| 8 mm (kruh 10,5 mm) | 1,1 mm | 0,2–0,7 mm | dobré, ale kruh přesahuje pás 9,4 mm |
| 15 mm (kruh 20 mm) | 2,1 mm | 0,4–1,4 mm | dobré; na jiných, větších produktech |
| 30 mm (kruh 40 mm) | 4,2 mm | 0,85–2,8 mm | výborné včetně klínu mezi D a S |

Závěr: na háček se vejde kruh ≈ 8 mm na žebrovaný pás. Zapuštění 0,4 mm je bezpečné (tah 5–6 mm). Pro malé velikosti aplikace automaticky zesílí tenká místa loga (minimální tloušťka tahu nastavitelná, výchozí 0,5 mm).

## 7a. Podklady

| Soubor | Popis |
|---|---|
| `logo/DS-logo-original.webp` | originál loga DS od zadavatele, rastr 1228×758 px, bílé logo na tmavě modrém pozadí |

## 8. Rizika

| Riziko | Dopad | Řešení |
|---|---|---|
| Logo pouze jako PNG | neostré hrany, nutná vektorizace | poprosit o SVG/AI/PDF, jinak vektorizuji sám a dám ke kontrole |
| Děravé/nezavřené STL | boolean selže | detekce + automatická oprava + hlášení; záložní CSG engine |
| Velmi hustý model (miliony trojúhelníků) | pomalý výpočet v prohlížeči | zjednodušení sítě jen pro náhled, boolean na originálu po stisku tlačítka |
| Logo přes hranu modelu | kruh „ukousne“ roh | varování v UI, uživatel posune |
