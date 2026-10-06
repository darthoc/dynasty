// Record book: built from every game in every season of the league's history.
// Sleeper links each season's league to the one before it, so we walk that chain backwards.

const SLEEPER = "https://api.sleeper.app/v1/league/";

// Everything we need to know about one season
async function loadSeason(league) {
  const base = SLEEPER + league.league_id;
  const last = Math.min(league.settings.last_scored_leg || 0, 18);
  const weeks = [];
  for (let w = 1; w <= last; w++) weeks.push(w);

  const [rosters, users, bracket, ...matchups] = await Promise.all([
    getJSON(base + "/rosters"),
    getJSON(base + "/users"),
    getJSON(base + "/winners_bracket").catch(function () { return []; }),
  ].concat(weeks.map(function (w) { return getJSON(base + "/matchups/" + w); })));

  const ownerOf = {};
  rosters.forEach(function (r) { ownerOf[r.roster_id] = r.owner_id; });
  const names = {};
  users.forEach(function (u) { names[u.user_id] = teamName(u); });

  const games = [];
  matchups.forEach(function (list, index) {
    const byMatch = {};
    list.forEach(function (m) {
      if (m.matchup_id === null || m.matchup_id === undefined) return;
      (byMatch[m.matchup_id] = byMatch[m.matchup_id] || []).push(m);
    });
    Object.keys(byMatch).forEach(function (id) {
      const pair = byMatch[id];
      if (pair.length !== 2) return;
      games.push({
        season: Number(league.season),
        week: weeks[index],
        playoff: weeks[index] >= league.settings.playoff_week_start,
        a: { owner: ownerOf[pair[0].roster_id], points: pair[0].points },
        b: { owner: ownerOf[pair[1].roster_id], points: pair[1].points },
      });
    });
  });

  // The champion is the winner of the match decided for 1st place
  let champion = null;
  if (league.status === "complete") {
    const final = bracket.filter(function (m) { return m.p === 1; })[0];
    if (final && final.w) champion = ownerOf[final.w];
  }

  return { league: league, season: Number(league.season), names: names, games: games, champion: champion };
}

function pts(x) { return x.toFixed(2); }

async function loadRecords() {
  // Walk back through every season of the league (newest first)
  const leagues = [];
  let league = await getJSON(API);
  while (league && leagues.length < 25) {
    leagues.push(league);
    if (!league.previous_league_id) break;
    league = await getJSON(SLEEPER + league.previous_league_id);
  }
  const seasons = await Promise.all(leagues.map(loadSeason));

  // One name per manager (their newest name wins) and a link to their team page if they're still in the league
  const nameOf = {};
  seasons.forEach(function (s) {
    Object.keys(s.names).forEach(function (id) { if (!nameOf[id]) nameOf[id] = s.names[id]; });
  });
  const current = await getJSON(API + "/rosters");
  const rosterOfOwner = {};
  current.forEach(function (r) { rosterOfOwner[r.owner_id] = r.roster_id; });

  function who(owner) {
    const name = esc(nameOf[owner] || "Unknown");
    return rosterOfOwner[owner] ? "<a href='team.html?id=" + rosterOfOwner[owner] + "'>" + name + "</a>" : name;
  }
  function when(g) { return g.season + " Wk " + g.week + (g.playoff ? " (playoffs)" : ""); }

  const games = [];
  seasons.forEach(function (s) { s.games.forEach(function (g) { games.push(g); }); });
  games.sort(function (a, b) { return a.season - b.season || a.week - b.week; });

  // ---- Single-game records ----
  const performances = [];
  games.forEach(function (g) {
    performances.push({ owner: g.a.owner, score: g.a.points, opp: g.b.owner, oppScore: g.b.points, g: g });
    performances.push({ owner: g.b.owner, score: g.b.points, opp: g.a.owner, oppScore: g.a.points, g: g });
  });
  function perfRow(p) {
    return { who: who(p.owner), value: pts(p.score), detail: "vs " + esc(nameOf[p.opp] || "?") + " (" + pts(p.oppScore) + ") • " + when(p.g) };
  }
  const byHigh = performances.slice().sort(function (a, b) { return b.score - a.score; });
  const byLow = performances.slice().sort(function (a, b) { return a.score - b.score; });

  const decided = performances.filter(function (p) { return p.score > p.oppScore; });
  const byBlowout = decided.slice().sort(function (a, b) { return (b.score - b.oppScore) - (a.score - a.oppScore); });
  const byClose = decided.slice().sort(function (a, b) { return (a.score - a.oppScore) - (b.score - b.oppScore); });
  function marginRow(p) {
    return { who: who(p.owner), value: pts(p.score - p.oppScore), detail: "beat " + esc(nameOf[p.opp] || "?") + " " + pts(p.score) + "–" + pts(p.oppScore) + " • " + when(p.g) };
  }
  const byCombined = games.slice().sort(function (a, b) { return (b.a.points + b.b.points) - (a.a.points + a.b.points); });
  function combinedRow(g) {
    return { who: who(g.a.owner) + " vs " + who(g.b.owner), value: pts(g.a.points + g.b.points), detail: pts(g.a.points) + "–" + pts(g.b.points) + " • " + when(g) };
  }

  // ---- Streaks: runs of consecutive wins (or losses) for each manager, across seasons ----
  const runs = { W: [], L: [] };
  const byOwner = {};
  performances.forEach(function (p) { (byOwner[p.owner] = byOwner[p.owner] || []).push(p); });
  Object.keys(byOwner).forEach(function (owner) {
    let kind = null, run = [];
    function close() { if (kind && run.length) runs[kind].push({ owner: owner, games: run }); }
    byOwner[owner].forEach(function (p) {
      const result = p.score > p.oppScore ? "W" : p.score < p.oppScore ? "L" : "T";
      if (result === kind) { run.push(p); }
      else { close(); kind = result === "T" ? null : result; run = kind ? [p] : []; }
    });
    close();
  });
  function streakRows(kind) {
    return runs[kind].sort(function (a, b) { return b.games.length - a.games.length; }).slice(0, 5).map(function (r) {
      const first = r.games[0].g, lastG = r.games[r.games.length - 1].g;
      return { who: who(r.owner), value: r.games.length, detail: first.season + " Wk " + first.week + " → " + lastG.season + " Wk " + lastG.week };
    });
  }

  // ---- Season totals (regular season only, finished seasons only) ----
  const totals = [];
  const allTime = {};
  seasons.forEach(function (s) {
    const t = {};
    s.games.filter(function (g) { return !g.playoff; }).forEach(function (g) {
      [[g.a, g.b], [g.b, g.a]].forEach(function (pair) {
        const me = pair[0], opp = pair[1];
        [t, allTime].forEach(function (book) {
          const row = book[me.owner] = book[me.owner] || { owner: me.owner, w: 0, l: 0, t: 0, pf: 0, pa: 0 };
          row.pf += me.points; row.pa += opp.points;
          if (me.points > opp.points) row.w++; else if (me.points < opp.points) row.l++; else row.t++;
        });
      });
    });
    if (s.league.status === "complete") {
      Object.keys(t).forEach(function (owner) { totals.push(Object.assign({ season: s.season }, t[owner])); });
    }
  });
  // (allTime above also received this season's numbers via the loop)

  function winPct(r) { const n = r.w + r.l + r.t; return n ? (r.w + r.t / 2) / n : 0; }
  function seasonRows(list, valueFn, detailFn) {
    return list.slice(0, 5).map(function (r) {
      return { who: who(r.owner), value: valueFn(r), detail: detailFn(r) + " • " + r.season };
    });
  }
  const finished = totals.length > 0;

  // ---- Build the page ----
  function card(title, rows, empty) {
    const body = rows.length
      ? "<div class='rec-top'><div class='rec-who'>" + rows[0].who + "</div><div class='rec-val'>" + rows[0].value + "</div></div>" +
        "<div class='tl-sub'>" + rows[0].detail + "</div>" +
        rows.slice(1).map(function (r, i) {
          return "<div class='rec-row'><span>" + (i + 2) + ". " + r.who + " <span class='dim'>" + r.detail + "</span></span><span>" + r.value + "</span></div>";
        }).join("")
      : "<div class='blurb empty'>" + (empty || "Nothing on record yet") + "</div>";
    return "<div class='rec-card'><div class='rec-title'>" + title + "</div>" + body + "</div>";
  }

  const html = [];
  html.push("<h2 class='section-title'>Single Game</h2>");
  html.push(card("Highest score", byHigh.slice(0, 5).map(perfRow)));
  html.push(card("Lowest score", byLow.slice(0, 5).map(perfRow)));
  html.push(card("Biggest blowout", byBlowout.slice(0, 5).map(marginRow)));
  html.push(card("Closest win", byClose.slice(0, 5).map(marginRow)));
  html.push(card("Highest combined score", byCombined.slice(0, 5).map(combinedRow)));

  html.push("<h2 class='section-title'>Streaks</h2>");
  html.push(card("Longest win streak", streakRows("W")));
  html.push(card("Longest losing streak", streakRows("L")));

  html.push("<h2 class='section-title'>Seasons</h2>");
  const wait = "Unlocks when a season finishes";
  html.push(card("Most points in a season", finished ? seasonRows(totals.slice().sort(function (a, b) { return b.pf - a.pf; }), function (r) { return pts(r.pf); }, function (r) { return r.w + "-" + r.l; }) : [], wait));
  html.push(card("Fewest points in a season", finished ? seasonRows(totals.slice().sort(function (a, b) { return a.pf - b.pf; }), function (r) { return pts(r.pf); }, function (r) { return r.w + "-" + r.l; }) : [], wait));
  html.push(card("Best regular-season record", finished ? seasonRows(totals.slice().sort(function (a, b) { return winPct(b) - winPct(a) || b.pf - a.pf; }), function (r) { return r.w + "-" + r.l + (r.t ? "-" + r.t : ""); }, function (r) { return pts(r.pf) + " PF"; }) : [], wait));

  const champs = seasons.filter(function (s) { return s.champion; }).sort(function (a, b) { return b.season - a.season; });
  html.push(card("League champions", champs.map(function (s) { return { who: who(s.champion), value: s.season, detail: "Champion" }; }), "No champion yet. The " + seasons[0].season + " season is still in progress."));

  const table = Object.keys(allTime).map(function (k) { return allTime[k]; })
    .sort(function (a, b) { return winPct(b) - winPct(a) || b.pf - a.pf; });
  html.push("<h2 class='section-title'>All-Time Standings</h2>");
  html.push("<table class='standings'><thead><tr><th>#</th><th>Manager</th><th>W-L</th><th>Win%</th><th>PF</th></tr></thead><tbody>" +
    table.map(function (r, i) {
      return "<tr><td>" + (i + 1) + "</td><td>" + who(r.owner) + "</td><td>" + r.w + "-" + r.l + (r.t ? "-" + r.t : "") +
        "</td><td>" + (winPct(r) * 100).toFixed(1) + "</td><td>" + r.pf.toFixed(0) + "</td></tr>";
    }).join("") + "</tbody></table>");

  document.getElementById("records-list").innerHTML = html.join("");
  document.getElementById("records-sub").textContent =
    seasons.length + " SEASON" + (seasons.length === 1 ? "" : "S") + " • " + games.length + " GAMES ON RECORD";
  document.getElementById("records-note").textContent =
    "Built from every game since the league began, and it updates itself as games are played. " +
    "Season totals and all-time standings count regular-season games only. Streaks and single-game records include the playoffs.";
}

loadRecords().catch(function (e) {
  document.getElementById("records-list").textContent = "Couldn't load the record book";
  console.error(e);
});
