// Home page: league header + standings (shared tools live in common.js)

async function loadLeague() {
  const league = await getJSON(API);
  const nameEl = document.getElementById("league-name");
  if (nameEl) nameEl.textContent = league.name;
  document.getElementById("league-sub").textContent =
    league.season + " SEASON • " + league.total_rosters + " TEAMS";
}

async function loadStandings() {
  // Two lists: the teams (records + points) and the people (names)
  const [rosters, users] = await Promise.all([
    getJSON(API + "/rosters"),
    getJSON(API + "/users"),
  ]);

  // Build a lookup so we can find a person from their ID
  const userById = {};
  users.forEach(function (u) { userById[u.user_id] = u; });

  const teams = rosters.map(function (r) {
    const s = r.settings;
    return {
      id: r.roster_id,
      name: teamName(userById[r.owner_id]),
      wins: s.wins,
      losses: s.losses,
      ties: s.ties,
      pf: points(s.fpts, s.fpts_decimal),
      pa: points(s.fpts_against, s.fpts_against_decimal),
    };
  });

  // Sort: most wins first, ties broken by points scored
  teams.sort(function (a, b) { return b.wins - a.wins || b.pf - a.pf; });

  const rows = teams.map(function (t, i) {
    const record = t.wins + "-" + t.losses + (t.ties ? "-" + t.ties : "");
    return "<tr><td>" + (i + 1) + "</td>" +
      "<td><a href='team.html?id=" + t.id + "'>" + esc(t.name) + "</a></td>" +
      "<td>" + record + "</td><td>" + t.pf.toFixed(1) + "</td><td>" + t.pa.toFixed(1) + "</td></tr>";
  });
  document.getElementById("standings-body").innerHTML = rows.join("");
}

loadLeague().catch(function () {
  const nameEl = document.getElementById("league-name");
  if (nameEl) nameEl.textContent = "Couldn't reach Sleeper";
});
loadStandings().catch(function () {
  document.getElementById("standings-body").innerHTML =
    "<tr><td colspan='5'>Couldn't load standings</td></tr>";
});
