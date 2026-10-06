// Run by GitHub on a schedule. Finds big trades and saves them forever in history.json,
// with each player's and pick's value frozen as of the moment the trade is first seen.

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const LEAGUE_ID = "1379626677100892160";
const API = "https://api.sleeper.app/v1/league/" + LEAGUE_ID;
const VALUES_URL = "https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=1&numTeams=12&ppr=1";

const THRESHOLD = 9000;                                  // total value moved must be ABOVE this
const SEASON_START = Date.parse("2026-09-09T00:00:00-04:00"); // only trades after the season began
const FILE = "history.json";

async function get(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(url + " -> " + response.status);
  return response.json();
}

function ordinal(n) {
  return { 1: "1st", 2: "2nd", 3: "3rd" }[n] || n + "th";
}

const [users, rosters, values] = await Promise.all([
  get(API + "/users"),
  get(API + "/rosters"),
  get(VALUES_URL),
]);

// Team names as they are right now (frozen into the record)
const userById = {};
users.forEach((u) => { userById[u.user_id] = u; });
const teamName = {};
rosters.forEach((r) => {
  const u = userById[r.owner_id] || {};
  teamName[r.roster_id] = ((u.metadata && u.metadata.team_name) || u.display_name || "Team " + r.roster_id).trim();
});

const players = {};
const pickValue = {};
values.forEach((v) => {
  if (v.player.position === "PICK") pickValue[v.player.name] = v.value;
  else players[v.player.sleeperId] = v;
});

// Every transaction from every week; keep completed trades after the season began
const trades = [];
for (let week = 0; week <= 18; week++) {
  let list = [];
  try { list = await get(API + "/transactions/" + week); } catch (e) { continue; }
  list.forEach((t) => {
    if (t.type === "trade" && t.status === "complete" && t.created >= SEASON_START) trades.push(t);
  });
}
trades.sort((a, b) => a.created - b.created);

const history = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : [];
const known = new Set(history.map((h) => h.id));
let added = 0;

for (const t of trades) {
  if (known.has(t.transaction_id)) continue;

  const sides = {};
  t.roster_ids.forEach((id) => { sides[id] = { teamId: id, team: teamName[id], items: [], total: 0 }; });

  Object.entries(t.adds || {}).forEach(([pid, rosterId]) => {
    const v = players[pid];
    const item = v
      ? { type: "player", id: pid, name: v.player.name, pos: v.player.position, nflTeam: v.player.maybeTeam, value: v.value }
      : { type: "player", id: pid, name: "Player #" + pid, pos: "", nflTeam: "", value: 0 };
    sides[rosterId].items.push(item);
    sides[rosterId].total += item.value;
  });
  (t.draft_picks || []).forEach((p) => {
    const value = pickValue[p.season + " " + ordinal(p.round)] || 0;
    sides[p.owner_id].items.push({
      type: "pick", name: p.season + " " + ordinal(p.round) + "-round pick",
      originalTeam: teamName[p.roster_id], value: value,
    });
    sides[p.owner_id].total += value;
  });

  const sideList = Object.values(sides);
  const moved = sideList.reduce((sum, s) => sum + s.total, 0);
  if (moved > THRESHOLD) {
    history.push({ id: t.transaction_id, created: t.created, moved: moved, frozenAt: Date.now(), sides: sideList });
    added++;
    console.log("Saved big trade", t.transaction_id, "moved", moved);
  }
}

if (added > 0) {
  history.sort((a, b) => a.created - b.created);
  writeFileSync(FILE, JSON.stringify(history, null, 2) + "\n");
}
console.log("Checked " + trades.length + " trades since the season began. New big trades saved: " + added);
