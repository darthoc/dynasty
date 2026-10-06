// Trade trees. Two kinds:
//   ?team=<rosterId>  everything one manager started with that was traded, and what it all turned into
//   ?p=<playerId> or ?k=<pick key>  one asset, and what it turned into
// With neither: a menu of managers plus a searchable list of every traded asset.

const params = new URLSearchParams(location.search);
const dateFmt = { month: "short", day: "numeric", year: "numeric" };

async function loadTrees() {
  const data = await loadTradeData();
  const info = data.info;

  // ---------- Little helpers ----------
  function playerName(id) {
    if (info[id]) return info[id].player.name;
    return /^[A-Z]{2,3}$/.test(id) ? id + " Defense" : "Player #" + id;
  }
  function playerPos(id) { return info[id] ? info[id].player.position : ""; }
  function playerValue(id) { return info[id] ? info[id].value : 0; }
  function teamLabel(id) { return data.teamById[id] ? data.teamById[id].name : "Team " + id; }
  function keyForPick(p) { return "k:" + p.season + "-" + p.round + "-" + p.original; }
  function pickFromKey(key) {
    const parts = key.slice(2).split("-");
    return { season: parts[0], round: Number(parts[1]), original: Number(parts[2]) };
  }
  function hitFor(key) {                       // the player a pick became (or null)
    const p = pickFromKey(key);
    return data.pickResult(p.season, p.round, p.original);
  }

  // ---------- Every asset's trades, oldest first ----------
  const events = {};   // asset key -> [{ trade, from, to }]
  function add(key, ev) { (events[key] = events[key] || []).push(ev); }
  data.trades.forEach(function (trade) {
    Object.keys(trade.sides).forEach(function (rid) {
      const side = trade.sides[rid];
      side.players.forEach(function (pid) { add("p:" + pid, { trade: trade, from: side.from[pid], to: Number(rid) }); });
      side.picks.forEach(function (p) { add(keyForPick(p), { trade: trade, from: p.from, to: Number(rid) }); });
    });
  });

  function receivedKeys(team, trade) {
    const side = trade.sides[team];
    return side.players.map(function (p) { return "p:" + p; }).concat(side.picks.map(keyForPick));
  }
  function sentKeys(team, trade) {
    const out = [];
    Object.keys(trade.sides).forEach(function (rid) {
      const side = trade.sides[rid];
      side.players.forEach(function (p) { if (side.from[p] === team) out.push("p:" + p); });
      side.picks.forEach(function (p) { if (p.from === team) out.push(keyForPick(p)); });
    });
    return out;
  }

  // The next trade in which `team` sent this asset away, after a given time.
  // A pick the team kept through the draft carries on as the player it became.
  function nextSend(team, key, after) {
    const direct = (events[key] || []).filter(function (e) { return e.from === team && e.trade.created > after; })[0];
    if (direct) return { ev: direct, via: key };
    if (key[0] === "k") {
      const hit = hitFor(key);
      if (hit && hit.by === team) {
        const pk = "p:" + hit.playerId;
        const e = (events[pk] || []).filter(function (x) { return x.from === team && x.trade.created > after; })[0];
        if (e) return { ev: e, via: pk };
      }
    }
    return null;
  }

  // ---------- Drawing ----------
  function valueOfKey(key) {
    if (key[0] === "p") return playerValue(key.slice(2));
    const hit = hitFor(key);
    if (hit) return playerValue(hit.playerId);
    const p = pickFromKey(key);
    return data.pickValue(p.season, p.round);
  }
  function plainName(key) {
    if (key[0] === "p") return playerName(key.slice(2));
    const p = pickFromKey(key), hit = hitFor(key);
    return p.season + " Rd " + p.round + (hit ? " (" + playerName(hit.playerId) + ")" : "");
  }
  function assetHtml(key, team) {
    const val = valueOfKey(key);
    const valHtml = val ? " <span class='tt-val'>" + val.toLocaleString() + "</span>" : "";
    if (key[0] === "p") {
      const id = key.slice(2);
      return "<a href='trees.html?p=" + esc(id) + "'>" + esc(playerName(id)) + "</a> <span class='dim'>" + esc(playerPos(id)) + "</span>" + valHtml;
    }
    const p = pickFromKey(key), hit = hitFor(key);
    const from = p.original !== team ? " <span class='dim'>(" + esc(teamLabel(p.original)) + "'s)</span>" : "";
    if (hit) {
      return "<b>" + p.season + " Rd " + p.round + "</b> <span class='dim'>#" + hit.pickNo + "</span>" + from + " &rarr; " +
        "<a href='trees.html?p=" + esc(hit.playerId) + "'>" + esc(playerName(hit.playerId)) + "</a> <span class='dim'>" + esc(playerPos(hit.playerId)) + "</span>" + valHtml;
    }
    return "<a href='trees.html?k=" + esc(key.slice(2)) + "'><b>" + p.season + " " + ordinal(p.round) + "</b></a>" + from + valHtml;
  }

  // What happened to an asset that was never traded again
  function leafHtml(key, team) {
    let status = "";
    let id = key[0] === "p" ? key.slice(2) : null;
    if (!id) {
      const hit = hitFor(key);
      if (hit) id = hit.playerId; else status = "STILL HOLDS THIS PICK";
    }
    if (id) {
      const roster = data.rosters.filter(function (r) { return r.roster_id === team; })[0];
      status = roster && (roster.players || []).indexOf(id) !== -1 ? "STILL ON THE ROSTER" : "NO LONGER ON THE ROSTER";
    }
    return "<div class='tt-node leaf'><div class='tt-asset'>" + assetHtml(key, team) + "</div><div class='tt-end'>" + status + "</div></div>";
  }

  // A pick from a draft that already happened but never produced a player (extra placeholder rounds)
  function isDeadPick(key) {
    if (key[0] !== "k" || hitFor(key)) return false;
    const season = pickFromKey(key).season;
    return Object.keys(data.pickResults).some(function (r) { return r.split("-")[0] === season; });
  }

  // Everything `team` received in a trade, grouped by what happened to it next
  function childGroups(team, trade) {
    const groups = [], byTrade = {};
    receivedKeys(team, trade).forEach(function (key) {
      const nx = nextSend(team, key, trade.created);
      if (!nx) { if (!isDeadPick(key)) groups.push({ leaf: true, keys: [{ key: key }] }); return; }
      const id = nx.ev.trade.id;
      if (!byTrade[id]) { byTrade[id] = { trade: nx.ev.trade, keys: [] }; groups.push(byTrade[id]); }
      byTrade[id].keys.push({ key: key, via: nx.via, to: nx.ev.to });
    });
    return groups;
  }

  // One node: the assets sent in a trade, who they went to, and (below) what came back
  function renderGroup(g, team, visited) {
    if (g.leaf) return leafHtml(g.keys[0].key, team);
    const trade = g.trade;
    const assets = g.keys.map(function (k) { return "<div class='tt-asset'>" + assetHtml(k.key, team) + "</div>"; })
      .join("<div class='tt-plus'>+</div>");
    const dests = [];
    g.keys.forEach(function (k) { if (dests.indexOf(teamLabel(k.to)) === -1) dests.push(teamLabel(k.to)); });
    const inGroup = g.keys.map(function (k) { return k.via; });
    const others = sentKeys(team, trade).filter(function (k) { return inGroup.indexOf(k) === -1; });
    const when = new Date(trade.created).toLocaleDateString(undefined, dateFmt);
    const head = assets + "<div class='tt-to'>TO " + esc(dests.join(" / ")) + " <span class='dim'>" + when + "</span></div>" +
      (others.length ? "<div class='tt-with'>sent in the same deal: " + esc(others.map(plainName).join(", ")) + "</div>" : "");

    if (visited[trade.id]) {
      return "<div class='tt-node'>" + head + "<div class='tt-with'>↳ the rest of this deal is shown above</div></div>";
    }
    visited[trade.id] = true;
    const kids = childGroups(team, trade).map(function (c) { return "<div class='tt-kid'>" + renderGroup(c, team, visited) + "</div>"; }).join("");
    return "<div class='tt-node'>" + head + (kids ? "<div class='tt-kids'>" + kids + "</div>" : "") + "</div>";
  }

  // ---------- A manager's whole tree ----------
  function teamRoots(team) {
    const keys = {};
    Object.keys(events).forEach(function (k) {
      if (k[0] === "k" && pickFromKey(k).original === team) keys[k] = true;      // their own picks that were traded
      if (k[0] === "p") {                                                         // waiver / free-agent pickups they traded
        const first = events[k].filter(function (e) { return e.from === team; })[0];
        if (!first) return;
        const boughtFirst = events[k].some(function (e) { return e.to === team && e.trade.created < first.trade.created; });
        const hit = data.pickOf(k.slice(2));
        if (!boughtFirst && !(hit && hit.by === team)) keys[k] = true;
      }
    });
    Object.keys(data.pickResults).forEach(function (r) {                          // their own draft picks (even ones they used)
      if (Number(r.split("-")[2]) === team) keys["k:" + r] = true;
    });

    const byTrade = {}, groups = [];
    Object.keys(keys).forEach(function (key) {
      const nx = nextSend(team, key, 0);
      if (!nx) return;
      const id = nx.ev.trade.id;
      if (!byTrade[id]) { byTrade[id] = { trade: nx.ev.trade, keys: [] }; groups.push(byTrade[id]); }
      byTrade[id].keys.push({ key: key, via: nx.via, to: nx.ev.to });
    });
    groups.sort(function (a, b) { return a.trade.created - b.trade.created; });
    return groups;
  }

  function showTeam(team) {
    const name = teamLabel(team);
    document.title = name + " Trade Tree | Dynasty League";
    document.getElementById("tree-kicker").textContent = "TRADE TREE";
    document.getElementById("tree-title").textContent = name;
    const visited = {}, cards = [], skipped = [];
    teamRoots(team).forEach(function (g) {
      if (visited[g.trade.id]) { g.keys.forEach(function (k) { skipped.push(plainName(k.key)); }); return; }
      cards.push("<div class='tt-card'>" + renderGroup(g, team, visited) + "</div>");
    });
    document.getElementById("tree-sub").textContent = cards.length + " BRANCH" + (cards.length === 1 ? "" : "ES") + " FROM " + name.toUpperCase() + "'S STARTING ASSETS";
    document.getElementById("tree-body").innerHTML =
      (cards.join("") || "<p class='note'>" + esc(name) + " hasn't made a trade yet.</p>") +
      (skipped.length ? "<p class='note'>Also part of deals shown above: " + esc(skipped.join(", ")) + "</p>" : "") +
      "<p class='note'>Read each branch top to bottom. Every box is what the manager had; \"TO\" shows who got it; the indented boxes underneath are what they received in return and what happened to those next.</p>";
    document.getElementById("tree-back").innerHTML = "<a href='trees.html'>&larr; ALL TRADE TREES</a>";
  }

  // ---------- One asset's tree, plus its full history ----------
  function showAsset() {
    let playerId = params.get("p"), pickKey = null;
    if (!playerId) {
      pickKey = "k:" + params.get("k");
      const hit = hitFor(pickKey);
      if (hit) { playerId = hit.playerId; pickKey = null; }
    }
    const pick = playerId ? data.pickOf(playerId) : null;
    const rootKey = pickKey || (pick ? "k:" + pick.season + "-" + pick.round + "-" + pick.original : "p:" + playerId);

    // Who held it first? That manager's view is the tree.
    let team = null;
    const own = events[rootKey] || [];
    if (own.length) team = own[0].from;
    else if (pick) team = pick.by;
    else if ((events["p:" + playerId] || []).length) team = events["p:" + playerId][0].from;

    const title = playerId ? playerName(playerId) : plainName(rootKey);
    document.getElementById("tree-kicker").textContent = "WHAT IT TURNED INTO";
    document.getElementById("tree-title").textContent = title;
    document.getElementById("tree-sub").textContent = playerId
      ? playerPos(playerId) + " • VALUE " + (playerValue(playerId) || "-")
      : "ORIGINALLY " + teamLabel(pickFromKey(rootKey).original).toUpperCase();
    document.title = title + " | Trade Tree";
    document.getElementById("tree-back").innerHTML = "<a href='trees.html'>&larr; ALL TRADE TREES</a>";

    let treeHtml = "";
    const nx = team ? nextSend(team, rootKey, 0) : null;
    if (nx) {
      const g = { trade: nx.ev.trade, keys: [{ key: rootKey, via: nx.via, to: nx.ev.to }] };
      treeHtml = "<h2 class='section-title'>What It Turned Into</h2><div class='tt-card'>" + renderGroup(g, team, {}) + "</div>";
    } else {
      treeHtml = "<p class='note'>This asset has never been traded away.</p>";
    }

    // Plain timeline of every owner, oldest first
    const allEvents = (events[rootKey] || []).concat(playerId && rootKey !== "p:" + playerId ? (events["p:" + playerId] || []) : []);
    const history = allEvents.map(function (e) {
      return "<div class='tl-node'><div class='tl-date'>" + new Date(e.trade.created).toLocaleDateString(undefined, dateFmt) + "</div>" +
        "<div class='tl-main'><a href='team.html?id=" + e.from + "'>" + esc(teamLabel(e.from)) + "</a> &rarr; " +
        "<a href='team.html?id=" + e.to + "'>" + esc(teamLabel(e.to)) + "</a></div></div>";
    }).join("");
    document.getElementById("tree-body").innerHTML = treeHtml +
      (history ? "<h2 class='section-title'>Who Has Owned It</h2><div class='timeline'>" + history + "</div>" : "");
  }

  // ---------- Menu ----------
  function showList() {
    document.getElementById("tree-kicker").textContent = "FOLLOW THE ASSETS";
    document.getElementById("tree-title").textContent = "Trade Trees";

    const rows = {};
    Object.keys(events).forEach(function (key) {
      let rowKey, name, pos, value;
      if (key[0] === "p") {
        const id = key.slice(2);
        rowKey = "p=" + id; name = playerName(id); pos = playerPos(id); value = playerValue(id);
      } else {
        const hit = hitFor(key), p = pickFromKey(key);
        if (hit) { rowKey = "p=" + hit.playerId; name = playerName(hit.playerId); pos = playerPos(hit.playerId); value = playerValue(hit.playerId); }
        else { rowKey = "k=" + key.slice(2); name = p.season + " Rd " + p.round + " (" + teamLabel(p.original) + ")"; pos = "PICK"; value = data.pickValue(p.season, p.round); }
      }
      if (!rows[rowKey]) rows[rowKey] = { href: "trees.html?" + rowKey, name: name, pos: pos, value: value, trades: 0 };
      rows[rowKey].trades += events[key].length;
    });
    const list = Object.keys(rows).map(function (k) { return rows[k]; })
      .sort(function (a, b) { return b.trades - a.trades || b.value - a.value; });

    const teams = data.teams.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
    document.getElementById("tree-sub").textContent = "BY MANAGER OR BY PLAYER";
    document.getElementById("tree-body").innerHTML =
      "<h2 class='section-title'>By Manager</h2><div class='team-grid'>" +
      teams.map(function (t) { return "<a class='team-chip' href='trees.html?team=" + t.id + "'>" + esc(t.name) + "</a>"; }).join("") + "</div>" +
      "<h2 class='section-title' style='margin-top:28px'>By Player or Pick</h2>" +
      "<input id='tree-search' class='search' type='search' placeholder='Search a player or pick...'><div id='tree-list'></div>";

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

  if (params.get("team")) showTeam(Number(params.get("team")));
  else if (params.get("p") || params.get("k")) showAsset();
  else showList();
}

loadTrees().catch(function (e) {
  document.getElementById("tree-title").textContent = "Couldn't load trade trees";
  console.error(e);
});
