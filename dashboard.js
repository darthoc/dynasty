// Dashboard: a screen of panels, each one a preview of a full page.

const teamsPromise = loadTeams();   // loaded once, shared by every panel

// The week it is right now in the NFL season (the league's own counter lags until a week is fully scored)
const weekPromise = Promise.all([teamsPromise, getJSON("https://api.sleeper.app/v1/state/nfl")]).then(function (res) {
  const state = res[1], settings = res[0].league.settings;
  return state.season_type === "regular" ? Math.min(state.week, settings.playoff_week_start - 1) : settings.leg;
});

function panel(id, title, more, body) {
  document.getElementById(id).innerHTML =
    "<div class='panel-h'><span class='panel-t'>" + title + "</span>" +
    (more ? "<a class='panel-more' href='" + more[1] + "'>" + more[0] + " →</a>" : "") + "</div>" +
    "<div class='panel-b'>" + body + "</div>";
}
function fail(id, title) {
  panel(id, title, null, "<div class='row'><span class='dim'>Couldn't load this panel.</span></div>");
}
function record(t) { return t.wins + "-" + t.losses + (t.ties ? "-" + t.ties : ""); }
function teamLink(t) { return "<a class='grow' href='team.html?id=" + t.id + "'>" + esc(t.name) + "</a>"; }

// ---- Header ----
Promise.all([teamsPromise, weekPromise]).then(function (res) {
  const d = res[0];
  document.getElementById("league-name").textContent = d.league.name;
  document.getElementById("league-sub").textContent =
    d.league.season + " SEASON • " + d.league.total_rosters + " TEAMS • WEEK " + res[1];
});

// ---- Standings ----
teamsPromise.then(function (d) {
  const teams = d.teams.slice().sort(bySeed);
  const spots = d.league.settings.playoff_teams;
  panel("p-standings", "Standings", ["Full table", "standings.html"],
    "<div class='row dim'><span class='pos'>#</span><span class='grow'>TEAM</span><span class='num'>W-L</span><span class='num'>PF</span></div>" +
    teams.map(function (t, i) {
      return "<div class='row" + (i === spots - 1 ? " cutline" : "") + "'><span class='pos'>" + (i + 1) + "</span>" + teamLink(t) +
        "<span class='num'>" + record(t) + "</span><span class='num'>" + t.pf.toFixed(0) + "</span></div>";
    }).join(""));
}).catch(function () { fail("p-standings", "Standings"); });

// ---- This week's matchups ----
Promise.all([teamsPromise, weekPromise]).then(async function (res) {
  const d = res[0], week = res[1];
  const matchups = await getJSON(API + "/matchups/" + week);
  const byId = {};
  d.teams.forEach(function (t) { byId[t.id] = t; });
  const pairs = {};
  matchups.forEach(function (m) {
    if (m.matchup_id === null || m.matchup_id === undefined) return;
    (pairs[m.matchup_id] = pairs[m.matchup_id] || []).push(m);
  });
  const started = matchups.some(function (m) { return m.points > 0; });
  panel("p-week", "Week " + week + " Matchups", ["H2H", "h2h.html"],
    Object.keys(pairs).map(function (id) {
      const p = pairs[id];
      if (p.length !== 2) return "";
      const a = p[0], b = p[1];
      const score = started
        ? "<span class='num'>" + a.points.toFixed(1) + " – " + b.points.toFixed(1) + "</span>"
        : "<span class='num'>vs</span>";
      const lead = started && a.points !== b.points ? (a.points > b.points ? "a" : "b") : "";
      return "<div class='row match'><span class='grow" + (lead === "a" ? " lead" : "") + "'>" + esc(byId[a.roster_id].name) + "</span>" + score +
        "<span class='grow r" + (lead === "b" ? " lead" : "") + "'>" + esc(byId[b.roster_id].name) + "</span></div>";
    }).join("") +
    "<div class='row'><span class='dim'>" + (started ? "Live scores from Sleeper." : "Games haven't started yet.") + "</span></div>");
}).catch(function () { fail("p-week", "This Week"); });

// ---- Playoff picture ----
teamsPromise.then(function (d) {
  const teams = d.teams.slice().sort(bySeed);
  const spots = d.league.settings.playoff_teams;
  panel("p-playoffs", "Playoff Picture", ["Full race", "playoffs.html"],
    teams.slice(0, spots + 2).map(function (t, i) {
      return "<div class='row" + (i === spots - 1 ? " cutline" : "") + "'><span class='pos'>" + (i + 1) + "</span>" + teamLink(t) +
        (i === 0 ? "<span class='pill'>BYE</span>" : "") + (i >= spots ? "<span class='pill out'>BUBBLE</span>" : "") +
        "<span class='num'>" + record(t) + "</span></div>";
    }).join("") +
    "<div class='row'><span class='dim'>Top " + spots + " make the playoffs.</span></div>");
}).catch(function () { fail("p-playoffs", "Playoff Picture"); });

// ---- Power rankings ----
Promise.all([teamsPromise, getJSON(VALUES_URL)]).then(function (res) {
  const ranked = computePower(res[0].teams.map(function (t) { return Object.assign({}, t); }), res[0].rosters, res[1]);
  panel("p-power", "Power Rankings", ["All 12", "power.html"],
    ranked.slice(0, 6).map(function (t, i) {
      return "<div class='row'><span class='rankbox'>" + (i + 1) + "</span>" + teamLink(t) +
        "<span class='num'>" + record(t) + "</span><span class='score'>" + t.score.toFixed(1) + "</span></div>";
    }).join(""));
}).catch(function () { fail("p-power", "Power Rankings"); });

// ---- Latest trades ----
loadTradeData().then(function (td) {
  const latest = td.trades.slice(-4).reverse();
  function name(id) { return esc(td.teamById[id] ? td.teamById[id].name : "Team " + id); }
  panel("p-trades", "Latest Trades", ["All trades", "trades.html"],
    latest.map(function (tr) {
      const date = new Date(tr.created).toLocaleDateString(undefined, { month: "short", day: "numeric" });
      const lines = Object.keys(tr.sides).map(function (rid) {
        const s = tr.sides[rid], items = [];
        s.players.forEach(function (pid) { items.push(td.info[pid] ? td.info[pid].player.name : "a player"); });
        s.picks.forEach(function (p) {
          const hit = td.pickResult(p.season, p.round, p.original);
          items.push(hit && td.info[hit.playerId] ? td.info[hit.playerId].player.name : p.season + " Rd " + p.round);
        });
        return "<b>" + name(rid) + "</b> got " + esc(items.join(", "));
      });
      return "<div class='row'><span class='datechip'>" + date + "</span><div class='grow small'>" + lines.join("<br>") + "</div></div>";
    }).join("") || "<div class='row'><span class='dim'>No trades yet.</span></div>");
}).catch(function () { fail("p-trades", "Latest Trades"); });

// ---- Season highlights ----
teamsPromise.then(async function (d) {
  const games = await loadGames(d.league);
  const byId = {};
  d.teams.forEach(function (t) { byId[t.id] = t; });
  const perf = [];
  games.forEach(function (g) {
    perf.push({ team: g.a.id, pts: g.a.points, opp: g.b.points, week: g.week });
    perf.push({ team: g.b.id, pts: g.b.points, opp: g.a.points, week: g.week });
  });
  const high = perf.slice().sort(function (a, b) { return b.pts - a.pts; })[0];
  const low = perf.slice().sort(function (a, b) { return a.pts - b.pts; })[0];
  const wins = perf.filter(function (p) { return p.pts > p.opp; });
  const blow = wins.slice().sort(function (a, b) { return (b.pts - b.opp) - (a.pts - a.opp); })[0];
  const close = wins.slice().sort(function (a, b) { return (a.pts - a.opp) - (b.pts - b.opp); })[0];
  function row(label, p, text) {
    return "<div class='row'><div class='grow'><div class='dim small'>" + label + "</div><b>" + esc(byId[p.team].name) + "</b> <span class='dim'>Wk " + p.week + "</span></div><span class='num big'>" + text + "</span></div>";
  }
  panel("p-highlights", "Season Highlights", ["Record book", "records.html"],
    games.length
      ? row("HIGHEST SCORE", high, high.pts.toFixed(2)) + row("LOWEST SCORE", low, low.pts.toFixed(2)) +
        row("BIGGEST BLOWOUT", blow, "+" + (blow.pts - blow.opp).toFixed(1)) + row("CLOSEST WIN", close, "+" + (close.pts - close.opp).toFixed(2))
      : "<div class='row'><span class='dim'>No games played yet.</span></div>");
}).catch(function () { fail("p-highlights", "Season Highlights"); });

// ---- Pick capital ----
loadPickData().then(function (pd) {
  const teams = pd.teams.slice().sort(function (a, b) { return b.total - a.total; }).slice(0, 5);
  const first = pd.years[0];
  panel("p-picks", "Pick Capital " + first + "–" + pd.years[pd.years.length - 1], ["Pick tracker", "picks.html"],
    teams.map(function (t, i) {
      const firsts = t.owned.filter(function (p) { return p.round === 1; }).length;
      return "<div class='row'><span class='pos'>" + (i + 1) + "</span><a class='grow' href='team.html?id=" + t.id + "'>" + esc(t.name) + "</a>" +
        "<span class='num'>" + firsts + " firsts • " + t.owned.length + " picks</span></div>";
    }).join("") +
    "<div class='row'><span class='dim'>Ranked by total pick value.</span></div>");
}).catch(function () { fail("p-picks", "Pick Capital"); });

// ---- League history (big trades) ----
fetch("history.json", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : []; }).then(function (history) {
  history.sort(function (a, b) { return b.created - a.created; });
  panel("p-history", "League History", ["All blockbusters", "history.html"],
    history.slice(0, 3).map(function (h) {
      const date = new Date(h.created).toLocaleDateString(undefined, { month: "short", day: "numeric" });
      return "<div class='row'><span class='datechip'>" + date + "</span><div class='grow small'>" +
        h.sides.map(function (s) { return "<b>" + esc(s.team) + "</b>"; }).join(" ⇄ ") +
        "<br><span class='dim'>" + h.moved.toLocaleString() + " value moved</span></div>" +
        "<a class='panel-more' href='trees.html?trade=" + esc(h.id) + "'>Tree →</a></div>";
    }).join("") || "<div class='row'><span class='dim'>No blockbuster trades yet.</span></div>");
}).catch(function () { fail("p-history", "League History"); });
