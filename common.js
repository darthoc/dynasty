// Shared tools used by every page on the site

// Our league's ID number on Sleeper
const LEAGUE_ID = "1379626677100892160";
const API = "https://api.sleeper.app/v1/league/" + LEAGUE_ID;

// Small helper: "ask the waiter" for one thing and get the answer back
async function getJSON(url) {
  const response = await fetch(url);
  return response.json();
}

// Turns special characters in names into harmless plain text
function esc(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Sleeper stores points as a whole number plus a decimal piece (566 and 48 = 566.48)
function points(whole, decimal) {
  return whole + (decimal || 0) / 100;
}

// A team's display name: custom team name if they set one, else their username
function teamName(owner) {
  return (owner && ((owner.metadata && owner.metadata.team_name) || owner.display_name)) || "Unknown";
}
