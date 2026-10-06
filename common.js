// Shared tools used by every page on the site

// Our league's ID number on Sleeper
const LEAGUE_ID = "1379626677100892160";
const API = "https://api.sleeper.app/v1/league/" + LEAGUE_ID;

// Small helper: "ask the waiter" for one thing and get the answer back
async function getJSON(url) {
  const response = await fetch(url);
  return response.json();
}

// Turns special characters in names into harmless plain text
function esc(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Sleeper stores points as a whole number plus a decimal piece (566 and 48 = 566.48)
function points(whole, decimal) {
  return whole + (decimal || 0) / 100;
}

// A team's display name: custom team name if they set one, else their username
function teamName(owner) {
  return ((owner && ((owner.metadata && owner.metadata.team_name) || owner.display_name)) || "Unknown").trim();
}

// Loads every team with name, record and points, plus the league settings.
// Returns { league, teams } where each team has: id, name, wins, losses, ties, pf, pa
async function loadTeams() {
  const [league, rosters, users] = await Promise.all([
    getJSON(API),
    getJSON(API + "/rosters"),
    getJSON(API + "/users"),
  ]);
  const userById = {};
  users.forEach(function (u) { userById[u.user_id] = u; });

  const teams = rosters.map(function (r) {
    const s = r.settings;
    return {
      id: r.roster_id,
      name: teamName(userById[r.owner_id]),
      username: ((userById[r.owner_id] || {}).display_name || "").trim(),
      wins: s.wins,
      losses: s.losses,
      ties: s.ties,
      pf: points(s.fpts, s.fpts_decimal),
      pa: points(s.fpts_against, s.fpts_against_decimal),
    };
  });
  return { league: league, teams: teams, rosters: rosters };
}

// Best-first order used everywhere: most wins, then most points scored
function bySeed(a, b) {
  return b.wins - a.wins || b.pf - a.pf;
}

// The regular-season games still to be played, as a list of { a: rosterId, b: rosterId }
async function loadRemainingGames(league) {
  const s = league.settings;
  const weeks = [];
  for (let w = s.last_scored_leg + 1; w < s.playoff_week_start; w++) weeks.push(w);
  const results = await Promise.all(weeks.map(function (w) {
    return getJSON(API + "/matchups/" + w);
  }));
  const games = [];
  results.forEach(function (matchups, index) {
    const byMatch = {};
    matchups.forEach(function (m) {
      (byMatch[m.matchup_id] = byMatch[m.matchup_id] || []).push(m.roster_id);
    });
    Object.keys(byMatch).forEach(function (id) {
      if (byMatch[id].length === 2) games.push({ a: byMatch[id][0], b: byMatch[id][1], week: weeks[index] });
    });
  });
  return games;
}

// Every score each team has put up this season: { rosterId: [week1, week2, ...] }
async function loadScores(league) {
  const weeks = [];
  for (let w = 1; w <= league.settings.last_scored_leg; w++) weeks.push(w);
  const results = await Promise.all(weeks.map(function (w) {
    return getJSON(API + "/matchups/" + w);
  }));
  const scores = {};
  results.forEach(function (matchups) {
    matchups.forEach(function (m) {
      (scores[m.roster_id] = scores[m.roster_id] || []).push(m.points);
    });
  });
  return scores;
}

// ---------- Trade + draft data (used by the trade feed and trade trees) ----------

// A trade counts as "big" when the total value of everything exchanged is above this
const BIG_TRADE = 9000;

const VALUES_URL = "https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=1&numTeams=12&ppr=1";

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// Loads everything about trades. Returns:
//   teams / teamById  - names
//   info              - FantasyCalc info by Sleeper player ID (name, position, value)
//   pickResult(season, round, originalRosterId) - the player a pick became, or null
//   pickValue(season, round) - FantasyCalc value of a future pick (0 if unknown)
//   trades            - oldest first: { id, created, sides: { rosterId: { players, picks, faab } } }
async function loadTradeData() {
  const base = await loadTeams();
  const league = base.league;
  const teamById = {};
  base.teams.forEach(function (t) { teamById[t.id] = t; });

  const weeks = [];
  for (let w = 0; w <= 18; w++) weeks.push(w);
  const [values, drafts, ...weekly] = await Promise.all([
    getJSON(VALUES_URL),
    getJSON(API + "/drafts"),
  ].concat(weeks.map(function (w) {
    return getJSON(API + "/transactions/" + w).catch(function () { return []; });
  })));

  const info = {};
  const pickValues = {};
  values.forEach(function (v) {
    if (v.player.position === "PICK") pickValues[v.player.name] = v.value;
    else info[v.player.sleeperId] = v;
  });

  // Turn each finished draft into: "2026 round 3, originally owned by roster 5" -> player taken
  const results = {};
  const byPlayer = {}; // player ID -> the draft pick that became him
  await Promise.all(drafts.map(async function (d) {
    if (d.status !== "complete") return;
    const [draft, picks] = await Promise.all([
      getJSON("https://api.sleeper.app/v1/draft/" + d.draft_id),
      getJSON("https://api.sleeper.app/v1/draft/" + d.draft_id + "/picks"),
    ]);
    picks.forEach(function (p) {
      const original = draft.slot_to_roster_id[p.draft_slot];
      const hit = {
        playerId: p.player_id, pickNo: p.pick_no, round: p.round,
        season: d.season, original: original, by: p.roster_id,
      };
      results[d.season + "-" + p.round + "-" + original] = hit;
      byPlayer[p.player_id] = hit;
    });
  }));

  const trades = [];
  weekly.forEach(function (list) {
    (Array.isArray(list) ? list : []).forEach(function (t) {
      if (t.type !== "trade" || t.status !== "complete") return;
      const sides = {};
      t.roster_ids.forEach(function (id) { sides[id] = { players: [], picks: [], faab: 0, from: {} }; });
      Object.keys(t.adds || {}).forEach(function (pid) {
        sides[t.adds[pid]].players.push(pid);
        sides[t.adds[pid]].from[pid] = (t.drops || {})[pid];
      });
      (t.draft_picks || []).forEach(function (p) {
        sides[p.owner_id].picks.push({ season: p.season, round: p.round, original: p.roster_id, from: p.previous_owner_id });
      });
      (t.waiver_budget || []).forEach(function (b) { sides[b.receiver].faab += b.amount; });
      trades.push({ id: t.transaction_id, created: t.created, sides: sides });
    });
  });
  trades.sort(function (a, b) { return a.created - b.created; });

  return {
    league: league,
    teams: base.teams,
    teamById: teamById,
    info: info,
    trades: trades,
    rosters: base.rosters,
    pickResults: results,
    pickOf: function (playerId) { return byPlayer[playerId] || null; },
    pickResult: function (season, round, original) {
      return results[season + "-" + round + "-" + original] || null;
    },
    pickValue: function (season, round) {
      return pickValues[season + " " + ordinal(round)] || 0;
    },
  };
}

// ---------- Future picks ----------

// Who owns every future rookie-draft pick, and what each pick is worth.
// Returns { league, years, rounds, teams: [{ id, name, owned, away, total }], draftFor(year) }
//   owned: [{ year, round, from }]   from = the original team's id if the pick was acquired in a trade
//   away:  [{ year, round, to }]     picks this team traded away
async function loadPickData() {
  const base = await loadTeams();
  const league = base.league;
  const [traded, values, drafts] = await Promise.all([
    getJSON(API + "/traded_picks"),
    getJSON(VALUES_URL),
    getJSON(API + "/drafts"),
  ]);

  const season = Number(league.season);
  const years = [season + 1, season + 2, season + 3];
  const rounds = league.settings.draft_rounds;

  const pickValue = {};
  values.forEach(function (v) { if (v.player.position === "PICK") pickValue[v.player.name] = v.value; });
  function valueOf(year, round) { return pickValue[year + " " + ordinal(round)] || 0; }

  // Everyone starts owning their own pick; a trade changes the owner
  const owner = {};
  traded.forEach(function (tp) {
    owner[tp.season + "-" + tp.round + "-" + tp.roster_id] = tp.owner_id;
  });

  const teams = base.teams.map(function (t) {
    return { id: t.id, name: t.name, owned: [], away: [], total: 0 };
  });
  const byId = {};
  teams.forEach(function (t) { byId[t.id] = t; });

  years.forEach(function (year) {
    for (let round = 1; round <= rounds; round++) {
      base.teams.forEach(function (orig) {
        const now = owner[year + "-" + round + "-" + orig.id] || orig.id;
        byId[now].owned.push({ year: year, round: round, from: now === orig.id ? null : orig.id });
        byId[now].total += valueOf(year, round);
        if (now !== orig.id) byId[orig.id].away.push({ year: year, round: round, to: now });
      });
    }
  });

  return {
    league: league,
    years: years,
    rounds: rounds,
    teams: teams,
    teamById: byId,
    valueOf: valueOf,
    standings: base.teams,
    ownerOf: function (year, round, original) {
      return owner[year + "-" + round + "-" + original] || original;
    },
    // Value of a specific draft slot, using FantasyCalc's Early / Mid / Late tiers
    slotValue: function (year, round, slot) {
      const tier = slot <= 4 ? "Early" : slot <= 8 ? "Mid" : "Late";
      return pickValue[year + " " + ordinal(round) + " (" + tier + ")"] || valueOf(year, round);
    },
    draftFor: function (year) {
      return drafts.filter(function (d) { return Number(d.season) === year; })[0] || null;
    },
  };
}


// Every game that has been played: [{ week, a: { id, points }, b: { id, points } }]
async function loadGames(league) {
  const weeks = [];
  for (let w = 1; w <= league.settings.last_scored_leg; w++) weeks.push(w);
  const results = await Promise.all(weeks.map(function (w) {
    return getJSON(API + "/matchups/" + w);
  }));
  const games = [];
  results.forEach(function (matchups, index) {
    const byMatch = {};
    matchups.forEach(function (m) {
      if (m.matchup_id === null || m.matchup_id === undefined) return; // a bye week
      (byMatch[m.matchup_id] = byMatch[m.matchup_id] || []).push(m);
    });
    Object.keys(byMatch).forEach(function (id) {
      const pair = byMatch[id];
      if (pair.length !== 2) return;
      games.push({
        week: weeks[index],
        a: { id: pair[0].roster_id, points: pair[0].points },
        b: { id: pair[1].roster_id, points: pair[1].points },
      });
    });
  });
  return games;
}


// ---------- Star ratings (like Football Manager) ----------
// A player's FantasyCalc value becomes 0.5 to 5 stars, in half-star steps.
function starRating(value) {
  const cuts = [[7000, 5], [5500, 4.5], [4000, 4], [3000, 3.5], [2200, 3], [1500, 2.5], [1000, 2], [500, 1.5], [200, 1], [1, 0.5]];
  for (let i = 0; i < cuts.length; i++) if (value >= cuts[i][0]) return cuts[i][1];
  return 0;
}
function starsHtml(value) {
  const s = starRating(value);
  return "<span class='stars' style='--s:" + s + "' title='" + s + " out of 5'>\u2605\u2605\u2605\u2605\u2605</span>";
}

// ---------- Site navigation (added to the top of every page) ----------
(function () {
  const sections = [
    { name: "Overview", pages: ["index.html"], subs: [["Dashboard", "index.html"]] },
    { name: "League", pages: ["standings.html", "playoffs.html", "power.html", "h2h.html", "team.html"],
      subs: [["Standings", "standings.html"], ["Playoff Race", "playoffs.html"], ["Power Rankings", "power.html"], ["Head-to-Head", "h2h.html"]] },
    { name: "Trades", pages: ["trades.html", "trees.html", "history.html"],
      subs: [["Trade Tracker", "trades.html"], ["Trade Trees", "trees.html"], ["League History", "history.html"]] },
    { name: "Draft", pages: ["picks.html"], subs: [["Pick Tracker", "picks.html"]] },
    { name: "Records", pages: ["records.html"], subs: [["Record Book", "records.html"]] },
  ];
  const file = location.pathname.split("/").pop() || "index.html";
  const current = sections.filter(function (s) { return s.pages.indexOf(file) !== -1; })[0] || sections[0];

  const tabs = sections.map(function (s) {
    return "<a class='tab-link" + (s === current ? " on" : "") + "' href='" + s.subs[0][1] + "'>" + s.name + "</a>";
  }).join("");
  const subs = current.subs.length > 1
    ? "<div class='subnav'><div class='subnav-in'>" + current.subs.map(function (p) {
        return "<a class='sub-link" + (p[1] === file ? " on" : "") + "' href='" + p[1] + "'>" + p[0] + "</a>";
      }).join("") + "</div></div>"
    : "";

  document.body.insertAdjacentHTML("afterbegin",
    "<header class='topnav'><div class='topnav-in'><a class='brand' id='brand' href='index.html'>DYNASTY</a>" +
    "<nav class='tabs'>" + tabs + "</nav></div></header>" + subs);

  // Use the league's real name from Sleeper
  getJSON(API).then(function (league) {
    document.getElementById("brand").textContent = league.name.toUpperCase();
  }).catch(function () {});
})();


// ---------- Power ranking formula (used by the Power Rankings page and the dashboard) ----------
const POWER_WEIGHTS = { record: 30, points: 30, value: 40 };

// Turn numbers into 0-100 scores: lowest becomes 0, highest becomes 100
function scaleTo100(values) {
  const lo = Math.min.apply(null, values);
  const hi = Math.max.apply(null, values);
  return values.map(function (v) { return hi === lo ? 50 : ((v - lo) / (hi - lo)) * 100; });
}

// Adds rosterValue, winPct, sRecord, sPoints, sValue and score to each team; returns them best first
function computePower(teams, rosters, values) {
  const valueById = {};
  values.forEach(function (v) { if (v.player.sleeperId) valueById[v.player.sleeperId] = v.value; });
  const rosterOf = {};
  rosters.forEach(function (r) { rosterOf[r.roster_id] = r; });
  teams.forEach(function (t) {
    t.rosterValue = (rosterOf[t.id].players || []).reduce(function (sum, id) { return sum + (valueById[id] || 0); }, 0);
    const games = t.wins + t.losses + t.ties;
    t.winPct = games ? (t.wins + t.ties / 2) / games : 0;
  });
  const rec = scaleTo100(teams.map(function (t) { return t.winPct; }));
  const pts = scaleTo100(teams.map(function (t) { return t.pf; }));
  const val = scaleTo100(teams.map(function (t) { return t.rosterValue; }));
  teams.forEach(function (t, i) {
    t.sRecord = rec[i]; t.sPoints = pts[i]; t.sValue = val[i];
    t.score = (rec[i] * POWER_WEIGHTS.record + pts[i] * POWER_WEIGHTS.points + val[i] * POWER_WEIGHTS.value) / 100;
  });
  return teams.sort(function (a, b) { return b.score - a.score; });
}
