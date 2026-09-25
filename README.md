# صافرة · Safra

An ad-free Arabic football schedule for Saudi fans: Roshn Saudi League, King's Cup, Saudi national team, AFC Champions League Elite, UEFA Champions League and Europe's top five leagues, all in Riyadh time.

## How it works

```
API-Football ──(every 15 min)──> GitHub Actions: scripts/update.mjs ──> data.json ──> GitHub Pages: index.html
```

- `index.html` is the whole site: one static page that reads `data.json` and re-checks it every 5 minutes while open.
- `scripts/update.mjs` calls API-Football, translates team names to Arabic, and writes `data.json`.
- `.github/workflows/update.yml` runs the script every 15 minutes and commits `data.json` when it changes. GitHub Pages then republishes the site.
- Your API key lives only in GitHub's encrypted secrets. It never reaches the page or the browser.

## Setup (about 20 minutes)

1. **API account.** Sign up at [api-football.com](https://www.api-football.com) (via the API-Sports dashboard) and copy your API key. Start on the free plan to test; switch to **Pro ($19/mo)** before going live. The free plan (100 requests/day) is too small for automatic runs and may not include the current season.
2. **Check the league ids.** On your computer, with Node 20+:
   ```bash
   APISPORTS_KEY=your_key npm run find-leagues
   ```
   Compare the output with `config/competitions.json` and fix any entry marked `"verify": true` (King's Cup, AFC Champions League Elite, Saudi national team). Confirm the Saudi league shows current season 2026.
3. **Create the repository.** On GitHub, create a new repository (for example `safra`) and upload all these files, including the hidden `.github` folder.
4. **Add the key.** Repository → Settings → Secrets and variables → Actions → New repository secret. Name: `APISPORTS_KEY`, value: your key.
5. **Turn on Pages.** Settings → Pages → Source: *Deploy from a branch* → Branch: `main`, folder `/ (root)`.
6. **First run.** Actions tab → *Update match data* → *Run workflow*. When it turns green, open `https://<your-username>.github.io/safra/`.
7. **Your own domain (optional).** Settings → Pages → Custom domain, then add the DNS record your registrar asks for.

## Everyday maintenance

| Task | Where |
|---|---|
| Add Arabic names for new teams | After a run, `missing-names.txt` lists names without Arabic. Add them to `config/teams-ar.json`. |
| Notice bar, key dates, pinned match | `config/editorial.json`. Leave `spotlight` as `null` to let the script pick the next top-4 Saudi clash. |
| New season | Change `season` in `config/competitions.json` each August (2027 for 2027/28). |
| Add or remove a competition | `config/competitions.json`, then add its label in `COMPS` inside `index.html`. |
| Which European clubs count as "big" | `bigClubs` in `config/competitions.json`. |

## Request budget

Each run makes about 16 calls (10 fixture lists plus 6 tables). At every 15 minutes that is about 1,500 calls a day, well inside Pro's 7,500. To use fewer, change the cron line in `update.yml` (for example `*/30`).

## Safety built in

- If a competition fails or returns nothing, its previous data is kept.
- `data.json` is only replaced when the new file passes validation. A bad run never blanks the site.
- The page shows a red "may be out of date" note if the data is more than 6 hours old.

## Testing without a key

```bash
npm run mock      # builds data.json from test/mock/*.json
npm run serve     # then open http://localhost:8080
```
`npm run mock` overwrites `data.json`, so don't commit its output. Restore the real file with `git checkout data.json`.

## Before going public

Read API-Football's terms of use to confirm your plan allows showing its data on a public website.
