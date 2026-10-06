// Team page: shows one team's roster. Which team? The number after "?id=" in the address.

const params = new URLSearchParams(location.search);
const rosterId = Number(params.get("id"));

async function loadTeam() {
  const [rosters, users, values] = await Promise.all([
    getJSON(API + "/rosters"),
    getJSON(API + "/users"),
    // FantasyCalc: dynasty trade values (also gives names, ages, positions)
    getJSON("https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=1&numTeams=12&ppr=1"),
  ]);

  const roster = rosters.find(function (r) { return r.roster_id === rosterId; });
  if (!roster) {
    document.getElementById("team-name").textContent = "Team not found";
    return;
  }

  const owner = users.find(function (u) { return u.user_id === roster.owner_id; });
  const s = roster.settings;
  document.title = teamName(owner) + " | Dynasty League";
  document.getElementById("team-kicker").textContent = owner ? owner.display_name.toUpperCase() : "TEAM";
  document.getElementById("team-name").textContent = teamName(owner);
  document.getElementById("team-sub").textContent =
    s.wins + "-" + s.losses + (s.ties ? "-" + s.ties : "") + " • " +
    points(s.fpts, s.fpts_decimal).toFixed(1) + " PF";

  // Look up FantasyCalc info by Sleeper player ID
  const info = {};
  values.forEach(function (v) { info[v.player.sleeperId] = v; });

  const players = (roster.players || []).map(function (id) {
    const v = info[id];
    return {
      id: id,
      name: v ? v.player.name : "Player #" + id,
      pos: v ? v.player.position : "?",
      age: v && v.player.maybeAge ? v.player.maybeAge.toFixed(0) : "-",
      value: v ? v.value : 0,
    };
  });
  players.sort(function (a, b) { return b.value - a.value; });

  document.getElementById("roster").innerHTML = players.map(function (p) {
    return "<div class='player'>" +
      "<img src='https://sleepercdn.com/content/nfl/players/thumb/" + esc(p.id) + ".jpg' alt='' " +
      "onerror=\"this.style.visibility='hidden'\">" +
      "<div class='pinfo'><div class='pname'>" + esc(p.name) + "</div>" +
      "<div class='pmeta'>" + esc(p.pos) + " • AGE " + esc(p.age) + "</div></div>" +
      "<div class='pvalue'>" + (p.value || "-") + "</div></div>";
  }).join("");
}

loadTeam().catch(function () {
  document.getElementById("team-name").textContent = "Couldn't load team";
});
