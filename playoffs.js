// Playoff race page: current seeding + exact clinch / elimination labels

async function loadRace() {
  const data = await loadTeams();
  const league = data.league;
  const teams = data.teams;
  const spots = league.settings.playoff_teams;
  const games = await loadRemainingGames(league);

  // How many games each team still has to play
  const left = {};
  teams.forEach(function (t) { left[t.id] = 0; });
  games.forEach(function (g) { left[g.a]++; left[g.b]++; });

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

  document.getElementById("race-sub").textContent =
    spots + " OF " + teams.length + " TEAMS MAKE IT • PLAYOFFS START WEEK " + league.settings.playoff_week_start;

  const rows = teams.map(function (t, i) {
    const tag = status(t);
    const badge = tag ? " <span class='tag " + tag.toLowerCase() + "'>" + (tag === "CLINCHED" ? "CLINCHED" : "OUT") + "</span>" : "";
    const record = t.wins + "-" + t.losses + (t.ties ? "-" + t.ties : "");
    const cutLine = i === spots - 1 ? " class='cut'" : "";
    return "<tr" + cutLine + "><td>" + (i + 1) + "</td>" +
      "<td><a href='team.html?id=" + t.id + "'>" + esc(t.name) + "</a>" + badge + "</td>" +
      "<td>" + record + "</td><td>" + t.pf.toFixed(1) + "</td><td>" + left[t.id] + "</td></tr>";
  });
  document.getElementById("seed-body").innerHTML = rows.join("");
  document.getElementById("race-note").textContent =
    "Seed 1 gets a first-round bye. Ties in the standings are broken by points scored. " +
    "Clinched/Out only appear when it is mathematically certain.";
}

loadRace().catch(function () {
  document.getElementById("seed-body").innerHTML =
    "<tr><td colspan='5'>Couldn't load the playoff race</td></tr>";
});
