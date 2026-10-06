// Trade trees. With no "?p=" or "?k=" in the address: a list of every traded asset.
// With ?p=<playerId> (or ?k=<pick key>): that asset's full life story.

const params = new URLSearchParams(location.search);
const dateFmt = { month: "short", day: "numeric", year: "numeric" };

async function loadTrees() {
  const data = await loadTradeData();
  const info = data.info;

  function playerName(id) {
    if (info[id]) return info[id].player.name;
    return /^[A-Z]{2,3}$/.test(id) ? id + " Defense" : "Player #" + id;
  }
  function playerPos(id) { return info[id] ? info[id].player.position : ""; }
  function playerValue(id) { return info[id] ? info[id].value : 0; }
  function teamLabel(id) { return data.teamById[id] ? data.teamById[id].name : "Team " + id; }
  function pickLabel(season, round, original) {
    return season + " Round " + round + " pick (" + teamLabel(original) + "'s)";
  }

  // ---- Build every asset's list of trades, oldest first ----
  // A drafted player inherits the trades of the pick he was selected with.
  const assets = {};   // key -> { key, kind, id, events: [] }
  function asset(key, kind, id) {
    return assets[key] = assets[key] || { key: key, kind: kind, id: id, events: [] };
  }
  function keyForPick(p) { return "k:" + p.season + "-" + p.round + "-" + p.original; }

  data.trades.forEach(function (trade) {
    Object.keys(trade.sides).forEach(function (rid) {
      const side = trade.sides[rid];
      side.players.forEach(function (pid) {
        asset("p:" + pid, "player", pid).events.push({ trade: trade, from: side.from[pid], to: Number(rid) });
      });
      side.picks.forEach(function (p) {
        asset(keyForPick(p), "pick", p).events.push({ trade: trade, from: p.from, to: Number(rid) });
      });
    });
  });

  // A pick that has been used is shown as the player it became.
  function resolvedPlayerFor(a) {
    if (a.kind !== "pick") return null;
    const hit = data.pickResult(a.id.season, a.id.round, a.id.original);
    return hit ? hit.playerId : null;
  }

  // The full ordered life story for one player or one unused pick
  function lineage(kind, id) {
    let before = [], pick = null;
    if (kind === "player") {
      pick = data.pickOf(id);
      if (pick) {
        const pa = assets[keyForPick(pick)];
        before = pa ? pa.events : [];
      }
    }
    const own = assets[(kind === "player" ? "p:" : "k:") + (kind === "player" ? id : id.season + "-" + id.round + "-" + id.original)];
    return { before: before, pick: pick, after: own ? own.events : [] };
  }

  function tradeCount(a) {
    const player = a.kind === "player" ? a.id : resolvedPlayerFor(a);
    const l = player ? lineage("player", player) : lineage("pick", a.id);
    return l.before.length + l.after.length;
  }

  function otherAssets(trade, exclude) {
    return Object.keys(trade.sides).map(function (rid) {
      const side = trade.sides[rid];
      const names = side.players.filter(function (p) { return "p:" + p !== exclude; }).map(playerName)
        .concat(side.picks.filter(function (p) { return keyForPick(p) !== exclude; }).map(function (p) {
          const hit = data.pickResult(p.season, p.round, p.original);
          return p.season + " Rd " + p.round + (hit ? " (" + playerName(hit.playerId) + ")" : "");
        }));
      return names.length ? esc(teamLabel(rid)) + " also got: " + esc(names.join(", ")) : "";
    }).filter(Boolean).join(" • ");
  }

  if (params.get("p") || params.get("k")) {
    showStory();
  } else {
    showList();
  }

  // =============== STORY VIEW ===============
  function showStory() {
    let playerId = params.get("p");
    let pickObj = null;
    if (!playerId) {
      const parts = params.get("k").split("-");
      pickObj = { season: parts[0], round: Number(parts[1]), original: Number(parts[2]) };
      const hit = data.pickResult(pickObj.season, pickObj.round, pickObj.original);
      if (hit) { playerId = hit.playerId; pickObj = null; }
    }

    const l = playerId ? lineage("player", playerId) : lineage("pick", pickObj);
    const nodes = [];

    function tradeNode(e, excludeKey) {
      return "<div class='tl-node'><div class='tl-date'>" +
        new Date(e.trade.created).toLocaleDateString(undefined, dateFmt) + "</div>" +
        "<div class='tl-main'><a href='team.html?id=" + e.from + "'>" + esc(teamLabel(e.from)) + "</a> &rarr; " +
        "<a href='team.html?id=" + e.to + "'>" + esc(teamLabel(e.to)) + "</a></div>" +
        "<div class='tl-sub'>" + otherAssets(e.trade, excludeKey) + "</div></div>";
    }

    if (playerId) {
      if (l.pick) {
        nodes.push("<div class='tl-node start'><div class='tl-date'>ORIGIN</div><div class='tl-main'>" +
          esc(pickLabel(l.pick.season, l.pick.round, l.pick.original)) + "</div></div>");
        l.before.forEach(function (e) { nodes.push(tradeNode(e, keyForPick(l.pick))); });
        nodes.push("<div class='tl-node draft'><div class='tl-date'>DRAFTED</div><div class='tl-main'>Pick #" +
          l.pick.pickNo + " (Round " + l.pick.round + ") by <a href='team.html?id=" + l.pick.by + "'>" +
          esc(teamLabel(l.pick.by)) + "</a></div></div>");
      } else if (l.after.length) {
        nodes.push("<div class='tl-node start'><div class='tl-date'>FIRST SEEN</div><div class='tl-main'>On <a href='team.html?id=" +
          l.after[0].from + "'>" + esc(teamLabel(l.after[0].from)) + "</a>'s roster</div></div>");
      }
      l.after.forEach(function (e) { nodes.push(tradeNode(e, "p:" + playerId)); });

      const roster = data.rosters.filter(function (r) { return (r.players || []).indexOf(playerId) !== -1; })[0];
      nodes.push("<div class='tl-node now'><div class='tl-date'>NOW</div><div class='tl-main'>" +
        (roster ? "On <a href='team.html?id=" + roster.roster_id + "'>" + esc(teamLabel(roster.roster_id)) + "</a>'s roster" : "Not on a roster") +
        "</div></div>");

      document.getElementById("tree-title").textContent = playerName(playerId);
      document.getElementById("tree-sub").textContent =
        playerPos(playerId) + " • VALUE " + (playerValue(playerId) || "-") + " • " +
        (l.before.length + l.after.length) + " TRADE" + (l.before.length + l.after.length === 1 ? "" : "S");
      document.title = playerName(playerId) + " | Trade Tree";
    } else {
      nodes.push("<div class='tl-node start'><div class='tl-date'>ORIGIN</div><div class='tl-main'>" +
        esc(pickLabel(pickObj.season, pickObj.round, pickObj.original)) + "</div></div>");
      l.after.forEach(function (e) { nodes.push(tradeNode(e, keyForPick(pickObj))); });
      const owner = l.after.length ? l.after[l.after.length - 1].to : pickObj.original;
      nodes.push("<div class='tl-node now'><div class='tl-date'>NOW</div><div class='tl-main'>Owned by <a href='team.html?id=" +
        owner + "'>" + esc(teamLabel(owner)) + "</a></div></div>");
      document.getElementById("tree-title").textContent = pickObj.season + " Rd " + pickObj.round;
      document.getElementById("tree-sub").textContent = "ORIGINALLY " + teamLabel(pickObj.original).toUpperCase() +
        " • " + l.after.length + " TRADE" + (l.after.length === 1 ? "" : "S");
      document.title = pickObj.season + " Round " + pickObj.round + " | Trade Tree";
    }

    document.getElementById("tree-back").innerHTML = "<a href='trees.html'>&larr; ALL TRADE TREES</a>";
    document.getElementById("tree-body").innerHTML = "<div class='timeline'>" + nodes.join("") + "</div>";
  }

  // =============== LIST VIEW ===============
  function showList() {
    document.getElementById("tree-kicker").textContent = "EVERY TRADED PLAYER AND PICK";
    document.getElementById("tree-title").textContent = "Trade Trees";

    // One row per player (used picks are folded into the player they became)
    const rows = {};
    Object.keys(assets).forEach(function (key) {
      const a = assets[key];
      const player = a.kind === "player" ? a.id : resolvedPlayerFor(a);
      const rowKey = player ? "p=" + player : "k=" + a.key.slice(2);
      if (rows[rowKey]) return;
      rows[rowKey] = {
        href: "trees.html?" + rowKey,
        name: player ? playerName(player) : a.id.season + " Rd " + a.id.round + " (" + teamLabel(a.id.original) + ")",
        pos: player ? playerPos(player) : "PICK",
        trades: tradeCount(a),
        value: player ? playerValue(player) : data.pickValue(a.id.season, a.id.round),
      };
    });
    const list = Object.keys(rows).map(function (k) { return rows[k]; })
      .sort(function (a, b) { return b.trades - a.trades || b.value - a.value; });

    document.getElementById("tree-sub").textContent = list.length + " ASSETS HAVE BEEN TRADED";
    document.getElementById("tree-body").innerHTML =
      "<input id='tree-search' class='search' type='search' placeholder='Search a player or pick...'>" +
      "<div id='tree-list'></div>";

    function draw(filter) {
      const f = filter.toLowerCase();
      document.getElementById("tree-list").innerHTML = list.filter(function (r) {
        return r.name.toLowerCase().indexOf(f) !== -1;
      }).map(function (r) {
        return "<a class='player' href='" + r.href + "'><div class='pinfo'><div class='pname'>" + esc(r.name) + "</div>" +
          "<div class='pmeta'>" + esc(r.pos) + "</div></div>" +
          "<div class='pvalue'>" + r.trades + (r.trades === 1 ? " trade" : " trades") + "</div></a>";
      }).join("") || "<p class='note'>No match.</p>";
    }
    draw("");
    document.getElementById("tree-search").addEventListener("input", function (e) { draw(e.target.value); });
  }
}

loadTrees().catch(function (e) {
  document.getElementById("tree-title").textContent = "Couldn't load trade trees";
  console.error(e);
});
