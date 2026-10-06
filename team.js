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

  function valueOf(id) { return info[id] ? info[id].value : 0; }

  const players = (roster.players || []).map(function (id) {
    const v = info[id];
    const isTeam = /^[A-Z]{2,3}$/.test(id); // team defenses are stored like "LAR"
    return {
      id: id,
      name: v ? v.player.name : isTeam ? id + " Defense" : "Player #" + id,
      pos: v ? v.player.position : isTeam ? "DEF" : "?",
      age: v && v.player.maybeAge ? v.player.maybeAge.toFixed(0) : "-",
      value: valueOf(id),
    };
  });
  players.sort(function (a, b) { return b.value - a.value; });

  // ---- Hero card: rank this team against all 12 on three measures ----
  function sum(ids) {
    return ids.reduce(function (total, id) { return total + valueOf(id); }, 0);
  }
  function measures(r) {
    const all = r.players || [];
    const starters = r.starters || [];
    return {
      value: sum(all),
      starters: sum(starters),
      bench: sum(all.filter(function (id) { return starters.indexOf(id) === -1; })),
    };
  }
  const mine = measures(roster);
  const others = rosters.map(measures);
  function rank(key) {
    return 1 + others.filter(function (m) { return m[key] > mine[key]; }).length;
  }
  function ordinal(n) {
    const s = ["th", "st", "nd", "rd"], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  document.getElementById("badges").innerHTML = [
    ["VALUE", "value"], ["STARTERS", "starters"], ["BENCH", "bench"],
  ].map(function (b) {
    return "<div class='badge'><div class='badge-num'>" + ordinal(rank(b[1])) + "</div>" +
      "<div class='badge-label'>" + b[0] + "</div></div>";
  }).join("");

  // ---- Roster tiers: how many players fall into each value bracket ----
  const TIERS = [
    { name: "Elite", min: 7000, color: "#ffd24a" },
    { name: "Star", min: 4000, color: "#c77dff" },
    { name: "Starter", min: 1500, color: "#4aa8ff" },
    { name: "Depth", min: 0, color: "#8a8f99" },
  ];
  const tierCounts = TIERS.map(function () { return 0; });
  players.forEach(function (p) {
    for (let i = 0; i < TIERS.length; i++) {
      if (p.value >= TIERS[i].min) { tierCounts[i]++; break; }
    }
  });
  document.getElementById("tiers").innerHTML = TIERS.map(function (t, i) {
    return "<div class='tier'><div class='tier-gem' style='background:" + t.color + "'></div>" +
      "<div class='tier-count'>" + tierCounts[i] + "</div>" +
      "<div class='tier-name'>" + t.name.toUpperCase() + "</div></div>";
  }).join("");

  // ---- Position-group rankings: total value at each position, ranked among 12 teams ----
  function posValue(r, pos) {
    return (r.players || []).reduce(function (total, id) {
      return total + (info[id] && info[id].player.position === pos ? info[id].value : 0);
    }, 0);
  }
  document.getElementById("ranks").innerHTML = ["QB", "RB", "WR", "TE"].map(function (pos) {
    const myValue = posValue(roster, pos);
    const place = 1 + rosters.filter(function (r) { return posValue(r, pos) > myValue; }).length;
    const tone = place <= 4 ? "good" : place >= 9 ? "bad" : "mid";
    return "<div class='rank-row'><span>" + pos + "</span>" +
      "<span class='rank-val'>" + myValue + "</span>" +
      "<span class='rank-place " + tone + "'>" + ordinal(place) + "</span></div>";
  }).join("");

  document.getElementById("top5").innerHTML = players.slice(0, 5).map(function (p) {
    return "<div class='top-player'>" +
      "<img src='https://sleepercdn.com/content/nfl/players/thumb/" + esc(p.id) + ".jpg' alt='' " +
      "onerror=\"this.style.visibility='hidden'\">" +
      "<div class='top-meta'>" + esc(p.pos) + " | " + (p.value || "-") + "</div>" +
      "<div class='top-name'>" + esc(p.name) + "</div></div>";
  }).join("");

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
