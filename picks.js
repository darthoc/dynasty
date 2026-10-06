// Pick tracker: who owns every future rookie pick

async function loadPicks() {
  const data = await loadPickData();
  const first = data.years[0];

  document.getElementById("picks-sub").textContent =
    data.years[0] + "–" + data.years[data.years.length - 1] + " • " + data.rounds + " ROUNDS";

  // Banner: is the next rookie draft scheduled yet?
  const draft = data.draftFor(first);
  document.getElementById("draft-banner").innerHTML = draft
    ? "<b>" + first + " ROOKIE DRAFT</b><br>Status: " + esc(draft.status.replace("_", " ")) +
      (draft.start_time ? " • " + new Date(draft.start_time).toLocaleString() : "")
    : "<b>" + first + " ROOKIE DRAFT</b><br>Not scheduled yet. It opens in Sleeper after the " + data.league.season + " season.";

  // ---- Projected draft order: worst record picks first, same order every round ----
  const order = data.standings.slice().sort(function (a, b) { return bySeed(b, a); });
  document.getElementById("order-title").textContent = "Projected " + first + " Draft Order";

  function drawRound(round) {
    document.getElementById("round-tabs").innerHTML = [1, 2, 3].slice(0, data.rounds).map(function (r) {
      return "<button class='tab" + (r === round ? " on" : "") + "' data-round='" + r + "'>Round " + r + "</button>";
    }).join("");

    document.getElementById("order-list").innerHTML = order.map(function (t, i) {
      const slot = i + 1;
      const owner = data.ownerOf(first, round, t.id);
      const via = owner !== t.id
        ? "<div class='via'>owned by <a href='team.html?id=" + owner + "'>" + esc(data.teamById[owner].name) + "</a></div>"
        : "";
      return "<div class='slot" + (owner !== t.id ? " traded" : "") + "'>" +
        "<div class='slot-no'>" + round + "." + String(slot).padStart(2, "0") + "</div>" +
        "<div class='slot-info'><div class='slot-team'>" + esc(t.name) + "'s pick <span class='dim'>" +
        t.wins + "-" + t.losses + (t.ties ? "-" + t.ties : "") + "</span></div>" + via + "</div>" +
        "<div class='slot-val'>" + data.slotValue(first, round, slot).toLocaleString() + "</div></div>";
    }).join("");

    document.querySelectorAll(".tab").forEach(function (b) {
      b.addEventListener("click", function () { drawRound(Number(b.dataset.round)); });
    });
  }
  drawRound(1);
  document.getElementById("order-note").textContent =
    "Projection assumes the worst current record picks first (fewer points scored breaks ties) and a linear draft, with the same order every round. " +
    "The real order is set after the season, so this moves every week.";

  // Richest pick capital first
  const teams = data.teams.slice().sort(function (a, b) { return b.total - a.total; });

  function chip(p) {
    const from = p.from ? " <span class='from'>← " + esc(data.teamById[p.from].name) + "</span>" : "";
    return "<span class='chip" + (p.from ? " got" : "") + "'>R" + p.round + from + "</span>";
  }

  document.getElementById("pick-cards").innerHTML = teams.map(function (t, i) {
    const rows = data.years.map(function (year) {
      const mine = t.owned.filter(function (p) { return p.year === year; });
      return "<div class='pick-row'><div class='pick-year'>" + year + "</div><div class='pick-chips'>" +
        (mine.length ? mine.map(chip).join("") : "<span class='dim'>none</span>") + "</div></div>";
    }).join("");

    const away = t.away.length
      ? "<div class='away'>Traded away: " + t.away.map(function (p) {
          return p.year + " R" + p.round + " → " + esc(data.teamById[p.to].name);
        }).join(", ") + "</div>"
      : "";

    return "<div class='pick-card'><div class='pick-head'><span class='pick-rank'>" + (i + 1) + "</span>" +
      "<a href='team.html?id=" + t.id + "'>" + esc(t.name) + "</a>" +
      "<span class='pick-total'>" + t.total.toLocaleString() + "</span></div>" + rows + away + "</div>";
  }).join("");

  document.getElementById("picks-note").textContent =
    "Teams are ranked by total pick value (FantasyCalc). Highlighted picks were acquired in a trade, with the original team shown. " +
    "Only picks Sleeper has opened for trading can change hands, so later years stay with their original teams until a trade happens.";
}

loadPicks().catch(function (e) {
  document.getElementById("pick-cards").textContent = "Couldn't load picks";
  console.error(e);
});
