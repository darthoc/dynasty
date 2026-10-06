// Team page, laid out like a manager game: squad table on the left, panels on the right.
// Which team? The number after "?id=" in the address.

const params = new URLSearchParams(location.search);
const rosterId = Number(params.get("id"));

const TIERS = [
  { name: "Elite", min: 7000, color: "#ffd24a" },
  { name: "Star", min: 4000, color: "#c77dff" },
  { name: "Starter", min: 1500, color: "#4aa8ff" },
  { name: "Depth", min: 0, color: "#8a8f99" },
];
function tierOf(value) {
  for (let i = 0; i < TIERS.length; i++) if (value >= TIERS[i].min) return TIERS[i];
  return TIERS[TIERS.length - 1];
}

function panel(id, title, more, body) {
  document.getElementById(id).innerHTML =
    "<div class='panel-h'><span class='panel-t'>" + title + "</span>" +
    (more ? "<a class='panel-more' href='" + more[1] + "'>" + more[0] + " →</a>" : "") + "</div>" +
    "<div class='panel-b'>" + body + "</div>";
}
function fail(id, title) {
  panel(id, title, null, "<div class='row'><span class='dim'>Couldn't load this panel.</span></div>");
}

async function loadTeam() {
  const [base, values] = await Promise.all([loadTeams(), getJSON(VALUES_URL)]);
  const league = base.league, teams = base.teams, rosters = base.rosters;
  const me = teams.filter(function (t) { return t.id === rosterId; })[0];
  const roster = rosters.filter(function (r) { return r.roster_id === rosterId; })[0];
  if (!me || !roster) { document.getElementById("team-name").textContent = "Team not found"; return; }

  const byId = {};
  teams.forEach(function (t) { byId[t.id] = t; });

  document.title = me.name + " | Dynasty League";
  document.getElementById("team-kicker").textContent = (me.username || "TEAM").toUpperCase();
  document.getElementById("team-name").textContent = me.name;
  const record = me.wins + "-" + me.losses + (me.ties ? "-" + me.ties : "");
  document.getElementById("team-sub").textContent = record + " • " + me.pf.toFixed(1) + " PF";

  // ---- Player info from FantasyCalc ----
  const info = {};
  values.forEach(function (v) { if (v.player.sleeperId) info[v.player.sleeperId] = v; });
  function valueOf(id) { return info[id] ? info[id].value : 0; }
  function player(id) {
    const v = info[id];
    const isTeam = /^[A-Z]{2,3}$/.test(id);
    return {
      id: id,
      name: v ? v.player.name : isTeam ? id + " Defense" : "Player #" + id,
      pos: v ? v.player.position : isTeam ? "DEF" : "?",
      age: v && v.player.maybeAge ? Math.round(v.player.maybeAge) : "-",
      nfl: v ? (v.player.maybeTeam || "FA") : (isTeam ? id : "-"),
      value: valueOf(id),
    };
  }
  function ordinalOf(n) { return ordinal(n); }

  // ---- Ranks versus the other 11 teams ----
  function sum(ids) { return ids.reduce(function (t, id) { return t + valueOf(id); }, 0); }
  function measures(r) {
    const all = r.players || [], starters = r.starters || [];
    return { value: sum(all), starters: sum(starters), bench: sum(all.filter(function (id) { return starters.indexOf(id) === -1; })) };
  }
  const mine = measures(roster), others = rosters.map(measures);
  function rank(key) { return 1 + others.filter(function (m) { return m[key] > mine[key]; }).length; }

  const seed = 1 + teams.slice().sort(bySeed).map(function (t) { return t.id; }).indexOf(me.id);
  const powerList = computePower(teams.map(function (t) { return Object.assign({}, t); }), rosters, values);
  const power = 1 + powerList.map(function (t) { return t.id; }).indexOf(me.id);

  document.getElementById("stat-tiles").innerHTML = [
    ["SEED", ordinalOf(seed)], ["POWER", "#" + power], ["ROSTER", ordinalOf(rank("value"))],
    ["STARTERS", ordinalOf(rank("starters"))], ["BENCH", ordinalOf(rank("bench"))],
  ].map(function (s) { return "<div class='stat'><div class='stat-v'>" + s[1] + "</div><div class='stat-l'>" + s[0] + "</div></div>"; }).join("");

  // ---- Key players ----
  const everyone = (roster.players || []).map(player).sort(function (a, b) { return b.value - a.value; });
  panel("p-key", "Key Players", null,
    "<div class='key-strip'>" + everyone.slice(0, 5).map(function (p) {
      return "<a class='key-player' href='trees.html?p=" + esc(p.id) + "'>" +
        "<img src='https://sleepercdn.com/content/nfl/players/thumb/" + esc(p.id) + ".jpg' alt='' onerror=\"this.style.visibility='hidden'\">" +
        "<div class='key-meta'>" + esc(p.pos) + " • " + esc(p.nfl) + "</div><div class='key-name'>" + esc(p.name) + "</div>" +
        "<div>" + starsHtml(p.value) + "</div></a>";
    }).join("") + "</div>");

  // ---- Squad table: lineup, bench, IR, taxi ----
  const slots = (league.roster_positions || []).filter(function (p) { return p !== "BN"; });
  const starters = (roster.starters || []);
  const reserve = roster.reserve || [], taxi = roster.taxi || [];
  const used = {};
  starters.concat(reserve, taxi).forEach(function (id) { used[id] = true; });
  const bench = (roster.players || []).filter(function (id) { return !used[id]; }).map(player).sort(function (a, b) { return b.value - a.value; });

  function squadRow(p, slot) {
    const t = tierOf(p.value);
    return "<tr><td><span class='slot-tag'>" + esc(slot) + "</span></td>" +
      "<td><a class='pcell' href='trees.html?p=" + esc(p.id) + "'><img src='https://sleepercdn.com/content/nfl/players/thumb/" + esc(p.id) + ".jpg' alt='' onerror=\"this.style.visibility='hidden'\">" +
      "<span class='pn'>" + esc(p.name) + "</span> <span class='ppos pos-" + esc(p.pos) + "'>" + esc(p.pos) + "</span></a></td>" +
      "<td>" + esc(p.age) + "</td><td>" + esc(p.nfl) + "</td>" +
      "<td><span class='tier-tag' style='color:" + t.color + "'>● " + t.name + "</span></td>" +
      "<td class='r'>" + (p.value ? starsHtml(p.value) : "") + "</td></tr>";
  }
  function group(label, rows) {
    return rows.length ? "<tr class='grp'><td colspan='6'>" + label + "</td></tr>" + rows.join("") : "";
  }
  const starterRows = starters.map(function (id, i) {
    return id && id !== "0" ? squadRow(player(id), slots[i] || "ST") : "<tr><td><span class='slot-tag'>" + esc(slots[i] || "ST") + "</span></td><td colspan='5' class='dim'>Empty slot</td></tr>";
  });
  panel("p-squad", "Squad • " + (roster.players || []).length + " players", null,
    "<table class='squad'><thead><tr><th></th><th>Player</th><th>Age</th><th>NFL</th><th>Tier</th><th class='r'>Rating</th></tr></thead><tbody>" +
    group("STARTING LINEUP", starterRows) +
    group("BENCH", bench.map(function (p) { return squadRow(p, "BN"); })) +
    group("INJURED RESERVE", reserve.map(player).map(function (p) { return squadRow(p, "IR"); })) +
    group("TAXI SQUAD", taxi.map(player).map(function (p) { return squadRow(p, "TX"); })) +
    "</tbody></table>");

  // ---- Tiers and position rankings ----
  function posValue(r, pos) {
    return (r.players || []).reduce(function (t, id) { return t + (info[id] && info[id].player.position === pos ? info[id].value : 0); }, 0);
  }
  const counts = TIERS.map(function () { return 0; });
  everyone.forEach(function (p) { counts[TIERS.indexOf(tierOf(p.value))]++; });
  panel("p-ranks", "Roster Strength", null,
    "<div class='tiers'>" + TIERS.map(function (t, i) {
      return "<div class='tier'><div class='tier-gem' style='background:" + t.color + "'></div><div class='tier-count'>" + counts[i] + "</div><div class='tier-name'>" + t.name.toUpperCase() + "</div></div>";
    }).join("") + "</div>" +
    ["QB", "RB", "WR", "TE"].map(function (pos) {
      const mineV = posValue(roster, pos);
      const place = 1 + rosters.filter(function (r) { return posValue(r, pos) > mineV; }).length;
      const tone = place <= 4 ? "good" : place >= 9 ? "bad" : "mid";
      return "<div class='row'><span class='ppos pos-" + pos + "'>" + pos + "</span><span class='grow dim'>of 12 teams</span><span class='rank-place " + tone + "'>" + ordinalOf(place) + "</span></div>";
    }).join(""));

  // ---- Panels that need extra data load on their own ----
  Promise.all([loadGames(league), loadRemainingGames(league)]).then(function (res) {
    const played = res[0].filter(function (g) { return g.a.id === me.id || g.b.id === me.id; }).sort(function (a, b) { return a.week - b.week; });
    const upcoming = res[1].filter(function (g) { return g.a === me.id || g.b === me.id; }).sort(function (a, b) { return a.week - b.week; });
    const rows = played.map(function (g) {
      const mineSide = g.a.id === me.id ? g.a : g.b, theirs = g.a.id === me.id ? g.b : g.a;
      const r = mineSide.points > theirs.points ? "w" : mineSide.points < theirs.points ? "l" : "t";
      return "<div class='row'><span class='pos wk'>Wk " + g.week + "</span><span class='res " + r + "'>" + r.toUpperCase() + "</span>" +
        "<a class='grow' href='team.html?id=" + theirs.id + "'>vs " + esc(byId[theirs.id].name) + "</a>" +
        "<span class='num'>" + mineSide.points.toFixed(1) + " – " + theirs.points.toFixed(1) + "</span></div>";
    }).concat(upcoming.map(function (g, i) {
      const opp = g.a === me.id ? g.b : g.a;
      return "<div class='row'><span class='pos wk'>Wk " + g.week + "</span>" + (i === 0 ? "<span class='pill'>NEXT</span>" : "<span class='res n'>–</span>") +
        "<a class='grow' href='team.html?id=" + opp + "'>vs " + esc(byId[opp].name) + "</a></div>";
    }));
    panel("p-fixtures", "Fixtures & Results", ["Head-to-head", "h2h.html?team=" + me.id], "<div class='scroll'>" + (rows.join("") || "<div class='row dim'>No games yet.</div>") + "</div>");
  }).catch(function () { fail("p-fixtures", "Fixtures & Results"); });

  loadPickData().then(function (pd) {
    const t = pd.teamById[me.id];
    const chips = pd.years.map(function (year) {
      const mineP = t.owned.filter(function (p) { return p.year === year; });
      return "<div class='row'><span class='pos wk'>" + year + "</span><div class='grow chips'>" +
        mineP.map(function (p) {
          return "<span class='chip" + (p.from ? " got" : "") + "'>R" + p.round + (p.from ? " <span class='from'>← " + esc(pd.teamById[p.from].name) + "</span>" : "") + "</span>";
        }).join("") + "</div></div>";
    }).join("");
    const away = t.away.length ? "<div class='row'><span class='dim'>Traded away: " + t.away.map(function (p) { return p.year + " R" + p.round + " → " + esc(pd.teamById[p.to].name); }).join(", ") + "</span></div>" : "";
    panel("p-picks", "Draft Picks", ["Pick tracker", "picks.html"], chips + away);
  }).catch(function () { fail("p-picks", "Draft Picks"); });

  loadTradeData().then(function (td) {
    function items(side) {
      const out = side.players.map(function (pid) { return td.info[pid] ? td.info[pid].player.name : "a player"; });
      side.picks.forEach(function (p) {
        const hit = td.pickResult(p.season, p.round, p.original);
        out.push(hit && td.info[hit.playerId] ? td.info[hit.playerId].player.name : p.season + " Rd " + p.round);
      });
      return out.join(", ") || "nothing";
    }
    const mine2 = td.trades.filter(function (tr) { return tr.sides[me.id]; }).slice(-4).reverse();
    const body = mine2.map(function (tr) {
      const date = new Date(tr.created).toLocaleDateString(undefined, { month: "short", day: "numeric" });
      const sent = Object.keys(tr.sides).filter(function (rid) { return Number(rid) !== me.id; }).map(function (rid) { return items(tr.sides[rid]); }).join("; ");
      return "<div class='row'><span class='datechip'>" + date + "</span><div class='grow small'><b>Got:</b> " + esc(items(tr.sides[me.id])) + "<br><b>Sent:</b> " + esc(sent) + "</div></div>";
    }).join("");
    panel("p-trades", "Trades • " + td.trades.filter(function (tr) { return tr.sides[me.id]; }).length + " total", ["Trade tree", "trees.html?team=" + me.id],
      body || "<div class='row'><span class='dim'>No trades yet.</span></div>");
  }).catch(function () { fail("p-trades", "Trades"); });
}

loadTeam().catch(function (e) {
  document.getElementById("team-name").textContent = "Couldn't load team";
  console.error(e);
});
