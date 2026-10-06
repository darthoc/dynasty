// Our league's ID number on Sleeper
const LEAGUE_ID = "1379626677100892160";
const API = "https://api.sleeper.app/v1/league/" + LEAGUE_ID;

// Small helper: "ask the waiter" for one thing and get the answer back
async function getJSON(url) {
  const response = await fetch(url);
  return response.json();
}

// Sleeper stores points as a whole number plus a decimal piece (566 and 48 = 566.48)
// Turns special characters in names into harmless plain text
function esc(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function points(whole, decimal) {
  return whole + (decimal || 0) / 100;
}

async function loadLeague() {
  const league = await getJSON(API);
  document.getElementById("league-name").textContent = league.name;
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
    const owner = userById[r.owner_id] || {};
    const s = r.settings;
    return {
      name: (owner.metadata && owner.metadata.team_name) || owner.display_name || "Unknown",
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
    return "<tr><td>" + (i + 1) + "</td><td>" + esc(t.name) + "</td><td>" + record +
      "</td><td>" + t.pf.toFixed(1) + "</td><td>" + t.pa.toFixed(1) + "</td></tr>";
  });
  document.getElementById("standings-body").innerHTML = rows.join("");
}

loadLeague().catch(function () {
  document.getElementById("league-name").textContent = "Couldn't reach Sleeper";
});
loadStandings().catch(function () {
  document.getElementById("standings-body").innerHTML =
    "<tr><td colspan='5'>Couldn't load standings</td></tr>";
});
