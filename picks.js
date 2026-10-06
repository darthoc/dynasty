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

  // ---- Find the trade behind each moved pick (so we can describe it on hover) ----
  const tradeData = await loadTradeData();
  function dealFor(year, round, original) {
    let found = null;
    tradeData.trades.forEach(function (tr) {            // oldest first, so the last match is the latest trade
      Object.keys(tr.sides).forEach(function (rid) {
        tr.sides[rid].picks.forEach(function (pk) {
          if (Number(pk.season) === year && pk.round === round && pk.original === original) found = tr;
        });
      });
    });
    return found;
  }
  function pickWorth(pk) {
    const hit = tradeData.pickResult(pk.season, pk.round, pk.original);
    if (hit) return tradeData.info[hit.playerId] ? tradeData.info[hit.playerId].value : 0;
    return tradeData.pickValue(pk.season, pk.round);
  }
  function describeDeal(tr) {
    let moved = 0;
    const lines = Object.keys(tr.sides).map(function (rid) {
      const side = tr.sides[rid], items = [];
      side.players.forEach(function (pid) {
        const v = tradeData.info[pid];
        items.push(v ? v.player.name : "a player");
        moved += v ? v.value : 0;
      });
      side.picks.forEach(function (pk) {
        items.push(data.teamById[pk.original].name + "'s " + pk.season + " " + ordinal(pk.round));
        moved += pickWorth(pk);
      });
      return "<b>" + esc(data.teamById[rid] ? data.teamById[rid].name : "Team " + rid) + "</b> got " + esc(items.join(", "));
    });
    const when = new Date(tr.created).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return { html: "<div class='tip-date'>" + when + "</div>" + lines.join("<br>"), moved: moved };
  }

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
      const traded = owner !== t.id;
      const record = t.wins + "-" + t.losses + (t.ties ? "-" + t.ties : "");
      // Traded picks lead with whoever owns them now; the original team goes underneath
      const headline = traded ? data.teamById[owner].name : t.name;
      const via = traded
        ? "<div class='via'>traded by <a href='team.html?id=" + t.id + "'>" + esc(t.name) + "</a> <span class='dim'>" + record + "</span></div>"
        : "";
      let tag = "div", attrs = "", tip = "";
      if (traded) {
        const deal = dealFor(first, round, t.id);
        if (deal) {
          const d = describeDeal(deal);
          const big = d.moved > BIG_TRADE;
          tip = "<div class='tip'>" + d.html + (big ? "<div class='tip-go'>Tap to open the trade tree \u2192</div>" : "") + "</div>";
          if (big) attrs = " data-href='trees.html?k=" + first + "-" + round + "-" + t.id + "'";
        }
      }
      return "<" + tag + attrs + " class='slot" + (traded ? " traded" : "") + "'>" +
        "<div class='slot-no'>" + round + "." + String(slot).padStart(2, "0") + "</div>" +
        "<div class='slot-info'><div class='slot-team'>" + esc(headline) + "'s pick" +
        (traded ? "" : " <span class='dim'>" + record + "</span>") + "</div>" + via + "</div>" +
        "<div class='slot-val'>" + data.slotValue(first, round, slot).toLocaleString() + "</div>" + tip + "</" + tag + ">";
    }).join("");

    document.querySelectorAll("div.slot.traded").forEach(function (s) {
      s.addEventListener("click", function (e) {
        if (e.target.closest("a")) return;                       // the "traded by" team link works on its own
        if (s.dataset.href) location.href = s.dataset.href;      // big trade: open its trade tree
        else s.classList.toggle("open");                         // smaller trade: show the deal
      });
    });
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
