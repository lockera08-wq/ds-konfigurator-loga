# Nasazení konfigurátoru na web

Aplikace je čistě statická: HTML, JS, WASM. Všechny výpočty (načtení modelu, vyřezání loga, export) běží v prohlížeči.
Na server se nikdy nenahrává žádný model ani výsledek. Server jen vydává soubory aplikace.

## Zvoleno: GitHub Pages (zdarma)

Jak to funguje: zdrojové soubory projektu jsou v repozitáři na GitHubu. Při každém odeslání změn (push) do větve `main`
GitHub Actions (`.github/workflows/deploy.yml`) aplikaci sestaví a nahraje na adresu
`https://<uživatel>.github.io/<repozitář>/`.

Podmínky:

- **Veřejný repozitář.** Na bezplatném GitHubu funguje Pages jen u veřejných repozitářů (soukromý vyžaduje GitHub Pro).
  Zdrojový kód i logo (polygony) budou tedy veřejně viditelné. Modely a výstupy se do repozitáře nedávají.
- **Git v počítači** (instalace: `winget install --id Git.Git -e`), nebo GitHub Desktop.

Jednorázové nastavení:

1. Účet na https://github.com (pokud není).
2. Nový repozitář, např. `ds-konfigurator-loga`, veřejný, bez README.
3. V terminálu ve složce projektu (jednou):

```bash
git init -b main
```

```bash
git add .
```

```bash
git commit -m "Konfigurátor loga DS"
```

```bash
git remote add origin https://github.com/<uživatel>/ds-konfigurator-loga.git
```

```bash
git push -u origin main
```

Při prvním pushi se Git zeptá na přihlášení k GitHubu (otevře prohlížeč).

4. Na GitHubu: repozitář → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
5. Záložka **Actions** ukáže běh „Nasazení na GitHub Pages“. Po 1–2 minutách je aplikace na
   `https://<uživatel>.github.io/ds-konfigurator-loga/`.

Každá další změna: `git add .`, `git commit -m "popis"`, `git push` – nasazení proběhne samo.

Skrytá adresa: stránka má `<meta name="robots" content="noindex">`, vyhledávače ji neindexují. Veřejný repozitář je ale
na GitHubu dohledatelný, takže adresa není tajná. Pro heslo by bylo potřeba jiné řešení (Cloudflare Access, viz níže).

## Alternativa: Cloudflare Pages (zdarma)

Jednorázově (ty, asi 5 minut):

1. Založ účet na https://dash.cloudflare.com (stačí e-mail, karta není potřeba).
2. V terminálu ve složce projektu spusť přihlášení, otevře se prohlížeč, potvrď přístup:

```bash
npx wrangler login
```

Pak nasazení (poprvé se zeptá na vytvoření projektu `ds-konfigurator-loga`, potvrď):

```bash
npm run deploy
```

Výsledek: adresa `https://ds-konfigurator-loga.pages.dev` (plus adresa pro každé nasazení zvlášť).
Každé další nasazení = znovu `npm run deploy`.

### Skrytá adresa

Stránka má `robots.txt` s `Disallow: /` a hlavičku `X-Robots-Tag: noindex`, vyhledávače ji neindexují.
Kdo nezná adresu, nenajde ji. Pokud chceš skutečné heslo, v Cloudflare dashboardu zapni
**Zero Trust → Access → Applications** pro doménu `*.pages.dev` projektu (zdarma do 50 uživatelů): přihlášení přes e-mailový kód.

### Vlastní doména (volitelně)

Cloudflare Pages → projekt → Custom domains → např. `logo.davoshop.cz`. Doména musí být u Cloudflare nebo nastavíš CNAME.

## Alternativy

| Služba | Jak | Poznámka |
|---|---|---|
| Netlify | https://app.netlify.com/drop – přetáhni složku `dist` do okna | nejjednodušší, bez CLI; účet nutný pro trvalou adresu |
| GitHub Pages | repozitář + Actions | potřebuje Git (není nainstalovaný) |
| Vlastní hosting (Wedos apod.) | nahrát obsah `dist/` přes FTP | funguje kdekoli, kde jde servírovat statické soubory; `.wasm` musí mít MIME `application/wasm` |

## Co se nasazuje

Složka `dist/` po `npm run build`:

| Soubor | Co to je |
|---|---|
| `index.html`, `assets/index-*.js`, `assets/index-*.css` | aplikace (Three.js, UI) |
| `assets/csg.worker-*.js`, `assets/manifold-*.wasm` | vyřezání ve Web Workeru |
| `DS-logo-polygons.json`, `DS-logo.svg` | logo |
| `_headers`, `robots.txt` | hlavičky a zákaz indexace |

Testovací modely ani výstupy se nenasazují.
