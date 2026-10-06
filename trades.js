// Trade tracker: every trade, what each team received, and a value-based grade

// Turn "share of the total value you received" into a letter grade
function grade(share) {
  if (share >= 0.70) return "A+";
  if (share >= 0.62) return "A";
  if (share >= 0.57) return "A-";
  if (share >= 0.53) return "B+";
  if (share >= 0.50) return "B";
  if (share >= 0.47) return "B-";
  if (share >= 0.43) return "C";
  if (share >= 0.38) return "D";
  return "F";
}

async function loadTrades() {
  const data = await loadTradeData();
  const info = data.info;

  function playerValue(id) { return info[id] ? info[id].value : 0; }
  function playerName(id) {
    if (info[id]) return info[id].player.name;
    return /^[A-Z]{2,3}$/.test(id) ? id + " Defense" : "Player #" + id;
  }
  function playerPos(id) { return info[id] ? info[id].player.position : ""; }
  function teamLabel(id) { return data.teamById[id] ? data.teamById[id].name : "Team " + id; }

  // One line for a pick, with its value. Old picks are traced to the player taken.
  function describePick(p) {
    const from = " <span class='dim'>(" + esc(teamLabel(p.original)) + ")</span>";
    const hit = data.pickResult(p.season, p.round, p.original);
    if (hit) {
      return {
        html: "<b>" + p.season + " Rd " + p.round + "</b>" + from + " &rarr; " +
          esc(playerName(hit.playerId)) + " <span class='dim'>" + esc(playerPos(hit.playerId)) + "</span>",
        value: playerValue(hit.playerId),
      };
    }
    return {
      html: "<b>" + p.season + " " + ordinal(p.round) + "</b>" + from,
      value: data.pickValue(p.season, p.round),
    };
  }

  const totalValue = {};
  const cards = data.trades.slice().reverse().map(function (trade) {
    const ids = Object.keys(trade.sides);
    const sideData = ids.map(function (id) {
      const s = trade.sides[id];
      const items = [];
      let total = 0;
      s.players.forEach(function (pid) {
        const v = playerValue(pid);
        total += v;
        items.push("<div class='asset'><span>" + esc(playerName(pid)) +
          " <span class='dim'>" + esc(playerPos(pid)) + "</span></span><span>" + (v || "-") + "</span></div>");
      });
      s.picks.forEach(function (p) {
        const d = describePick(p);
        total += d.value;
        items.push("<div class='asset'><span>" + d.html + "</span><span>" + (d.value || "-") + "</span></div>");
      });
      if (s.faab) items.push("<div class='asset'><span>$" + s.faab + " FAAB</span><span>-</span></div>");
      return { id: id, items: items, total: total };
    });

    const grand = sideData.reduce(function (a, s) { return a + s.total; }, 0);
    const n = sideData.length;
    const date = new Date(trade.created).toLocaleDateString(undefined, { month: "short", day: "numeric" });

    const sidesHtml = sideData.map(function (s) {
      // Fair share is 1/n. Scale so an even split is 0.5 whatever the number of teams.
      const share = grand ? (s.total / grand) * n / 2 : 0.5;
      return "<div class='side'><div class='side-head'>" +
        "<a href='team.html?id=" + s.id + "'>" + esc(teamLabel(s.id)) + "</a> receives" +
        "<span class='grade'>" + grade(share) + "</span></div>" +
        s.items.join("") +
        "<div class='asset total'><span>TOTAL</span><span>" + s.total + "</span></div></div>";
    }).join("");

    return "<div class='trade'><div class='trade-date'>" + date + "</div>" + sidesHtml + "</div>";
  });

  document.getElementById("trades-sub").textContent = data.trades.length + " TRADES THIS SEASON";
  document.getElementById("trade-list").innerHTML = cards.join("") || "No trades yet.";
  document.getElementById("trade-note").textContent =
    "Grades compare today's FantasyCalc values on each side. Picks that have already been used are valued as the player taken. " +
    "Late-round and far-future picks have no market value, so they show as \"-\". Grades will move as player values change.";
}

loadTrades().catch(function (e) {
  document.getElementById("trade-list").textContent = "Couldn't load trades";
  console.error(e);
});
