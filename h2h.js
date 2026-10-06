// Head-to-head records between every pair of managers

async function loadH2H() {
  const data = await loadTeams();
  const league = data.league;
  const [games, upcoming] = await Promise.all([loadGames(league), loadRemainingGames(league)]);
  const teams = data.teams.slice().sort(bySeed);
  const byId = {};
  teams.forEach(function (t) { byId[t.id] = t; });
  const playoffStart = league.settings.playoff_week_start;

  document.getElementById("h2h-sub").textContent =
    games.length + " GAMES PLAYED • " + upcoming.length + " TO GO";

  // ---- League callouts: closest game and biggest blowout ----
  function margin(g) { return Math.abs(g.a.points - g.b.points); }
  function describe(g) {
    const winner = g.a.points >= g.b.points ? g.a : g.b;
    const loser = winner === g.a ? g.b : g.a;
    return "<b>" + esc(byId[winner.id].name) + "</b> " + winner.points.toFixed(2) + " – " +
      loser.points.toFixed(2) + " " + esc(byId[loser.id].name) + " <span class='dim'>Week " + g.week + "</span>";
  }
  if (games.length) {
    const sorted = games.slice().sort(function (a, b) { return margin(a) - margin(b); });
    const closest = sorted[0], blowout = sorted[sorted.length - 1];
    document.getElementById("callouts").innerHTML =
      "<div class='callout'><div class='callout-label'>CLOSEST GAME • " + margin(closest).toFixed(2) + " PTS</div>" + describe(closest) + "</div>" +
      "<div class='callout'><div class='callout-label'>BIGGEST BLOWOUT • " + margin(blowout).toFixed(2) + " PTS</div>" + describe(blowout) + "</div>";
  }

  // ---- Team picker (remembers the team in the address so it can be linked) ----
  const select = document.getElementById("team-select");
  select.innerHTML = teams.map(function (t) {
    return "<option value='" + t.id + "'>" + esc(t.name) + "</option>";
  }).join("");
  const wanted = Number(new URLSearchParams(location.search).get("team"));
  select.value = byId[wanted] ? wanted : teams[0].id;

  function draw() {
    const me = byId[Number(select.value)];
    history.replaceState(null, "", "?team=" + me.id);

    const rows = teams.filter(function (t) { return t.id !== me.id; }).map(function (opp) {
      const played = games.filter(function (g) {
        return (g.a.id === me.id && g.b.id === opp.id) || (g.b.id === me.id && g.a.id === opp.id);
      }).sort(function (a, b) { return a.week - b.week; });

      let w = 0, l = 0, t = 0, pf = 0, pa = 0;
      const log = played.map(function (g) {
        const mine = g.a.id === me.id ? g.a : g.b;
        const theirs = g.a.id === me.id ? g.b : g.a;
        pf += mine.points; pa += theirs.points;
        let result = "T";
        if (mine.points > theirs.points) { w++; result = "W"; }
        else if (mine.points < theirs.points) { l++; result = "L"; }
        else t++;
        const stage = g.week >= playoffStart ? " (playoffs)" : "";
        return "<div class='game'><span class='res " + result.toLowerCase() + "'>" + result + "</span> Week " + g.week + stage +
          " <span class='dim'>" + mine.points.toFixed(2) + " – " + theirs.points.toFixed(2) + "</span></div>";
      });

      const next = upcoming.filter(function (g) {
        return (g.a === me.id && g.b === opp.id) || (g.b === me.id && g.a === opp.id);
      }).map(function (g) { return g.week; }).sort(function (a, b) { return a - b; });
      const nextText = next.length ? "Next meeting: Week " + next.join(", Week ") : "No more regular-season meetings";

      return { opp: opp, played: played.length, w: w, l: l, t: t, pf: pf, pa: pa, log: log, nextText: nextText };
    });

    // Opponents you've played first, then the rest
    rows.sort(function (a, b) { return (b.played > 0) - (a.played > 0) || b.played - a.played; });

    document.getElementById("h2h-list").innerHTML = rows.map(function (r) {
      const record = r.played ? r.w + "-" + r.l + (r.t ? "-" + r.t : "") : "–";
      const tone = !r.played ? "" : r.w > r.l ? " good" : r.w < r.l ? " bad" : "";
      return "<div class='h2h-card'><div class='h2h-top'>" +
        "<div class='h2h-name'><a href='team.html?id=" + r.opp.id + "'>vs " + esc(r.opp.name) + "</a>" +
        (r.played ? "<div class='pmeta'>" + r.pf.toFixed(1) + " PF • " + r.pa.toFixed(1) + " PA</div>" : "<div class='pmeta'>HASN'T PLAYED YET</div>") +
        "</div><div class='h2h-rec" + tone + "'>" + record + "</div></div>" +
        r.log.join("") + "<div class='tl-sub'>" + r.nextText + "</div></div>";
    }).join("");
  }

  select.addEventListener("change", draw);
  draw();

  document.getElementById("h2h-note").textContent =
    "Records count every scored game this season, including the playoffs once they start. Each manager's history will keep building as seasons go by.";
}

loadH2H().catch(function (e) {
  document.getElementById("h2h-list").textContent = "Couldn't load head-to-head records";
  console.error(e);
});
