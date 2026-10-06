// Power rankings: a formula sets the order, blurbs.txt supplies the commentary

// How much each ingredient counts. These three add up to 100. Change them to change the order.
const WEIGHTS = { record: 30, points: 30, value: 40 };

// Turn a list of numbers into 0-100 scores: the lowest becomes 0, the highest becomes 100
function scale(values) {
  const lo = Math.min.apply(null, values);
  const hi = Math.max.apply(null, values);
  return values.map(function (v) { return hi === lo ? 50 : ((v - lo) / (hi - lo)) * 100; });
}

// blurbs.txt -> { week, blurbs: { "name in lowercase": "text" } }
function parseBlurbs(text) {
  const result = { week: null, blurbs: {} };
  text.split("\n").forEach(function (raw) {
    const line = raw.trim();
    if (!line || line[0] === "#") return;
    const i = line.indexOf(":");
    if (i < 1) return;
    const key = line.slice(0, i).trim().toLowerCase();
    const val = line.slice(i + 1).trim();
    if (key === "week") result.week = val; else result.blurbs[key] = val;
  });
  return result;
}

async function loadPower() {
  const [data, values, blurbText] = await Promise.all([
    loadTeams(),
    getJSON(VALUES_URL),
    fetch("blurbs.txt", { cache: "no-store" }).then(function (r) { return r.ok ? r.text() : ""; }),
  ]);
  const teams = data.teams;
  const blurbData = parseBlurbs(blurbText);

  // Roster value = everything on the roster, valued by FantasyCalc
  const valueById = {};
  values.forEach(function (v) { if (v.player.sleeperId) valueById[v.player.sleeperId] = v.value; });
  const rosterOf = {};
  data.rosters.forEach(function (r) { rosterOf[r.roster_id] = r; });
  teams.forEach(function (t) {
    t.rosterValue = (rosterOf[t.id].players || []).reduce(function (sum, id) { return sum + (valueById[id] || 0); }, 0);
    const games = t.wins + t.losses + t.ties;
    t.winPct = games ? (t.wins + t.ties / 2) / games : 0;
  });

  // Score each ingredient 0-100, then blend them
  const rec = scale(teams.map(function (t) { return t.winPct; }));
  const pts = scale(teams.map(function (t) { return t.pf; }));
  const val = scale(teams.map(function (t) { return t.rosterValue; }));
  teams.forEach(function (t, i) {
    t.sRecord = rec[i]; t.sPoints = pts[i]; t.sValue = val[i];
    t.score = (rec[i] * WEIGHTS.record + pts[i] * WEIGHTS.points + val[i] * WEIGHTS.value) / 100;
  });
  teams.sort(function (a, b) { return b.score - a.score; });

  document.getElementById("power-sub").textContent =
    "WEEK " + (blurbData.week || data.league.settings.leg);

  document.getElementById("power-list").innerHTML = teams.map(function (t, i) {
    const blurb = blurbData.blurbs[t.name.toLowerCase()] || blurbData.blurbs[t.username.toLowerCase()];
    const record = t.wins + "-" + t.losses + (t.ties ? "-" + t.ties : "");
    return "<div class='power-card'>" +
      "<div class='power-top'><div class='power-rank'>" + (i + 1) + "</div>" +
      "<div class='power-name'><a href='team.html?id=" + t.id + "'>" + esc(t.name) + "</a>" +
      "<div class='pmeta'>" + record + " • " + t.pf.toFixed(0) + " PF • " + t.rosterValue.toLocaleString() + " VALUE</div></div>" +
      "<div class='power-score'>" + t.score.toFixed(1) + "</div></div>" +
      "<div class='bars'>" + bar("REC", t.sRecord) + bar("PTS", t.sPoints) + bar("VAL", t.sValue) + "</div>" +
      "<div class='blurb" + (blurb ? "" : " empty") + "'>" + (blurb ? esc(blurb) : "No blurb this week") + "</div></div>";
  }).join("");

  document.getElementById("power-note").textContent =
    "Order = " + WEIGHTS.record + "% record + " + WEIGHTS.points + "% points scored + " + WEIGHTS.value +
    "% roster value (FantasyCalc). Each ingredient is scored 0–100 from worst to best team in the league.";
}

function bar(label, score) {
  return "<div class='bar'><span>" + label + "</span><div class='bar-track'><div class='bar-fill' style='width:" +
    Math.round(score) + "%'></div></div><span>" + Math.round(score) + "</span></div>";
}

loadPower().catch(function (e) {
  document.getElementById("power-list").textContent = "Couldn't load power rankings";
  console.error(e);
});
