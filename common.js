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
