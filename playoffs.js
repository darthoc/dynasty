// Playoff race page: current seeding, exact clinch labels, and simulated odds

const SIMS = 10000;

// A random number that follows a bell curve (mean 0, spread 1)
function bellRandom() {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Play the rest of the season SIMS times. Returns, per team, how often it
// made the playoffs and how often it earned the #1 seed (the bye).
function simulate(teams, games, scores, spots) {
  // Each team's typical score = its average so far (nudged toward the league
  // average, because 4 games is a small sample). Spread = how much scores bounce.
  const all = [];
  Object.keys(scores).forEach(function (id) { scores[id].forEach(function (p) { all.push(p); }); });
  const leagueAvg = all.reduce(function (a, b) { return a + b; }, 0) / all.length;

  const mean = {};
  let sumSq = 0, n = 0;
  teams.forEach(function (t) {
    const list = scores[t.id] || [];
    const total = list.reduce(function (a, b) { return a + b; }, 0);
    const PRIOR = 3; // "pretend" the team also played 3 average games
    mean[t.id] = (total + PRIOR * leagueAvg) / (list.length + PRIOR);
    const own = total / (list.length || 1);
    list.forEach(function (p) { sumSq += (p - own) * (p - own); n++; });
  });
  const spread = Math.max(Math.sqrt(sumSq / Math.max(n - teams.length, 1)), 15);

  const made = {}, bye = {};
  teams.forEach(function (t) { made[t.id] = 0; bye[t.id] = 0; });

  for (let s = 0; s < SIMS; s++) {
    const sim = teams.map(function (t) { return { id: t.id, wins: t.wins, pf: t.pf }; });
    const byId = {};
    sim.forEach(function (t) { byId[t.id] = t; });

    games.forEach(function (g) {
      const a = mean[g.a] + spread * bellRandom();
      const b = mean[g.b] + spread * bellRandom();
      byId[g.a].pf += a;
      byId[g.b].pf += b;
      if (a > b) byId[g.a].wins++; else byId[g.b].wins++;
    });

    sim.sort(bySeed);
    sim.forEach(function (t, i) {
      if (i < spots) made[t.id]++;
      if (i === 0) bye[t.id]++;
    });
  }

  const odds = {};
  teams.forEach(function (t) {
    odds[t.id] = { made: made[t.id] / SIMS, bye: bye[t.id] / SIMS };
  });
  return odds;
}

function percent(x) {
  if (x >= 0.995) return "100%";
  if (x <= 0.0005) return "0%";
  if (x < 0.01) return "<1%";
  return Math.round(x * 100) + "%";
}

async function loadRace() {
  const data = await loadTeams();
  const league = data.league;
  const teams = data.teams;
  const spots = league.settings.playoff_teams;
  const [games, scores] = await Promise.all([loadRemainingGames(league), loadScores(league)]);

  // How many games each team still has to play
  const left = {};
  teams.forEach(function (t) { left[t.id] = 0; });
  games.forEach(function (g) { left[g.a]++; left[g.b]++; });

  const odds = simulate(teams, games, scores, spots);
  teams.sort(bySeed);

  // Worst case = lose every remaining game. Best case = win every remaining game.
  // We only say "clinched" or "eliminated" when it is mathematically certain.
  function status(t) {
    const worst = t.wins;
    const best = t.wins + left[t.id];
    const threats = teams.filter(function (o) { return o !== t && o.wins + left[o.id] >= worst; }).length;
    const ahead = teams.filter(function (o) { return o !== t && o.wins > best; }).length;
    if (threats < spots) return "CLINCHED";
    if (ahead >= spots) return "ELIMINATED";
    return "";
  }

  const mostLeft = Math.max.apply(null, Object.keys(left).map(function (id) { return left[id]; }));
  document.getElementById("race-sub").textContent =
    spots + " OF " + teams.length + " TEAMS MAKE IT • " + mostLeft + " GAMES LEFT";

  const rows = teams.map(function (t, i) {
    const tag = status(t);
    const badge = tag ? " <span class='tag " + tag.toLowerCase() + "'>" + (tag === "CLINCHED" ? "CLINCHED" : "OUT") + "</span>" : "";
    const record = t.wins + "-" + t.losses + (t.ties ? "-" + t.ties : "");
    const cutLine = i === spots - 1 ? " class='cut'" : "";
    return "<tr" + cutLine + "><td>" + (i + 1) + "</td>" +
      "<td><a href='team.html?id=" + t.id + "'>" + esc(t.name) + "</a>" + badge + "</td>" +
      "<td>" + record + "</td><td>" + t.pf.toFixed(0) + "</td>" +
      "<td class='odds'>" + percent(odds[t.id].made) + "</td>" +
      "<td class='odds dim'>" + percent(odds[t.id].bye) + "</td></tr>";
  });
  document.getElementById("seed-body").innerHTML = rows.join("");
  document.getElementById("race-note").textContent =
    "Odds come from simulating the rest of the season " + SIMS.toLocaleString() +
    " times, using each team's scoring so far. Early in the season this is a rough guide, not a prediction. " +
    "Seed 1 gets a first-round bye. Ties are broken by points scored. " +
    "Clinched/Out only appear when it is mathematically certain.";
}

loadRace().catch(function () {
  document.getElementById("seed-body").innerHTML =
    "<tr><td colspan='6'>Couldn't load the playoff race</td></tr>";
});
