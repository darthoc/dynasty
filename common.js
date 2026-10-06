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
  return (owner && ((owner.metadata && owner.metadata.team_name) || owner.display_name)) || "Unknown";
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
      wins: s.wins,
      losses: s.losses,
      ties: s.ties,
      pf: points(s.fpts, s.fpts_decimal),
      pa: points(s.fpts_against, s.fpts_against_decimal),
    };
  });
  return { league: league, teams: teams };
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
  results.forEach(function (matchups) {
    const byMatch = {};
    matchups.forEach(function (m) {
      (byMatch[m.matchup_id] = byMatch[m.matchup_id] || []).push(m.roster_id);
    });
    Object.keys(byMatch).forEach(function (id) {
      if (byMatch[id].length === 2) games.push({ a: byMatch[id][0], b: byMatch[id][1] });
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
  await Promise.all(drafts.map(async function (d) {
    if (d.status !== "complete") return;
    const [draft, picks] = await Promise.all([
      getJSON("https://api.sleeper.app/v1/draft/" + d.draft_id),
      getJSON("https://api.sleeper.app/v1/draft/" + d.draft_id + "/picks"),
    ]);
    picks.forEach(function (p) {
      const original = draft.slot_to_roster_id[p.draft_slot];
      results[d.season + "-" + p.round + "-" + original] = {
        playerId: p.player_id, pickNo: p.pick_no, round: p.round,
      };
    });
  }));

  const trades = [];
  weekly.forEach(function (list) {
    (Array.isArray(list) ? list : []).forEach(function (t) {
      if (t.type !== "trade" || t.status !== "complete") return;
      const sides = {};
      t.roster_ids.forEach(function (id) { sides[id] = { players: [], picks: [], faab: 0 }; });
      Object.keys(t.adds || {}).forEach(function (pid) {
        sides[t.adds[pid]].players.push(pid);
      });
      (t.draft_picks || []).forEach(function (p) {
        sides[p.owner_id].picks.push({ season: p.season, round: p.round, original: p.roster_id });
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
    pickResult: function (season, round, original) {
      return results[season + "-" + round + "-" + original] || null;
    },
    pickValue: function (season, round) {
      return pickValues[season + " " + ordinal(round)] || 0;
    },
  };
}
