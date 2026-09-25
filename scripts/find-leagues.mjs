// One-off helper: prints the API-Football ids you need for config/competitions.json.
// Usage: APISPORTS_KEY=xxx node scripts/find-leagues.mjs
const KEY = process.env.APISPORTS_KEY;
if (!KEY) { console.error('APISPORTS_KEY is not set'); process.exit(1); }
const get = async (q) => (await (await fetch('https://v3.football.api-sports.io/' + q, { headers: { 'x-apisports-key': KEY } })).json());

const show = (title, body) => {
  console.log('\n== ' + title);
  for (const x of body.response || []) {
    const l = x.league || x.team, cur = (x.seasons || []).find(s => s.current);
    console.log(`  id ${String(l.id).padEnd(6)} ${l.name}${x.country ? ' (' + x.country.name + ')' : ''}${cur ? '  current season: ' + cur.year : ''}`);
  }
};

show('Saudi Arabia competitions', await get('leagues?country=Saudi-Arabia'));
show('AFC competitions', await get('leagues?search=AFC'));
show('UEFA Champions League', await get('leagues?search=UEFA Champions'));
show('Saudi Arabia national team', await get('teams?name=Saudi Arabia'));
const status = await get('status');
console.log('\n== Account', JSON.stringify(status.response?.subscription), 'requests today:', JSON.stringify(status.response?.requests));
