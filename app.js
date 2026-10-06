// Our league's ID number on Sleeper
const LEAGUE_ID = "1379626677100892160";

// "Ask the waiter" for the league's info, then put it on the page
async function loadLeague() {
  try {
    const response = await fetch("https://api.sleeper.app/v1/league/" + LEAGUE_ID);
    const league = await response.json();

    document.getElementById("league-name").textContent = league.name;
    document.getElementById("league-sub").textContent =
      league.season + " SEASON • " + league.total_rosters + " TEAMS";
  } catch (error) {
    document.getElementById("league-name").textContent = "Couldn't reach Sleeper";
  }
}

loadLeague();
