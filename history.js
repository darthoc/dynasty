// League History: big trades saved forever in history.json (values frozen when saved)

async function loadHistory() {
  const response = await fetch("history.json", { cache: "no-store" });
  const history = response.ok ? await response.json() : [];
  history.sort(function (a, b) { return b.created - a.created; });

  document.getElementById("history-sub").textContent =
    history.length + " BLOCKBUSTER TRADE" + (history.length === 1 ? "" : "S") + " ON RECORD";

  function item(it) {
    const label = it.type === "player"
      ? "<a class='tlink' href='trees.html?p=" + esc(it.id) + "'>" + esc(it.name) + "</a> <span class='dim'>" +
        esc(it.pos) + (it.nflTeam ? " • " + esc(it.nflTeam) : "") + "</span>"
      : esc(it.name) + " <span class='dim'>(" + esc(it.originalTeam) + ")</span>";
    return "<div class='asset'><span>" + label + "</span><span>" + (it.value || "-") + "</span></div>";
  }

  document.getElementById("history-list").innerHTML = history.map(function (h) {
    const date = new Date(h.created).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
    const sides = h.sides.map(function (s) {
      return "<div class='side'><div class='side-head'>" +
        "<a href='team.html?id=" + s.teamId + "'>" + esc(s.team) + "</a> received</div>" +
        s.items.map(item).join("") +
        "<div class='asset total'><span>TOTAL</span><span>" + s.total + "</span></div></div>";
    }).join("");
    return "<div class='trade'><div class='trade-date'>" + date + "</div>" +
      "<div class='moved'>" + h.moved.toLocaleString() + " <span>VALUE MOVED</span></div>" + sides + "</div>";
  }).join("") || "<p class='note'>No blockbuster trades yet.</p>";
}

loadHistory().catch(function (e) {
  document.getElementById("history-list").textContent = "Couldn't load League History";
  console.error(e);
});
