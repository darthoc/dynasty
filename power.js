// Power rankings: a formula sets the order, blurbs.txt supplies the commentary

// How much each ingredient counts. These three add up to 100. Change them to change the order.
const WEIGHTS = POWER_WEIGHTS;

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

  computePower(teams, data.rosters, values);

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
