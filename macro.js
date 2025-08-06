// Define the point cost for each ability score
const pointCosts = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9,
};

// Initialize an object to store ability scores
const abilities = {
  Strength: 8,
  Dexterity: 8,
  Constitution: 8,
  Intelligence: 8,
  Wisdom: 8,
  Charisma: 8,
};

// Define the total points available
let totalPoints = 27;

// Prompt the user to input ability scores
new Dialog({
  title: "Point Buy Ability Scores",
  content: `
    <form>
      <p>Remaining Points: <span id="remainingPoints">${totalPoints}</span></p>
      <label for="Strength">Strength</label>
      <input type="number" name="Strength" value="${abilities.Strength}" min="8" max="15"><br>
      <label for="Dexterity">Dexterity</label>
      <input type="number" name="Dexterity" value="${abilities.Dexterity}" min="8" max="15"><br>
      <label for="Constitution">Constitution</label>
      <input type="number" name="Constitution" value="${abilities.Constitution}" min="8" max="15"><br>
      <label for="Intelligence">Intelligence</label>
      <input type="number" name="Intelligence" value="${abilities.Intelligence}" min="8" max="15"><br>
      <label for="Wisdom">Wisdom</label>
      <input type="number" name="Wisdom" value="${abilities.Wisdom}" min="8" max="15"><br>
      <label for="Charisma">Charisma</label>
      <input type="number" name="Charisma" value="${abilities.Charisma}" min="8" max="15">
    </form>
  `,
  buttons: {
    ok: {
      label: "OK",
      callback: (html) => {
        const updatedAbilities = {};
        let usedPoints = 0;

        // Calculate the used points and update the abilities
        for (const ability in abilities) {
          const newValue = parseInt(html.find(`[name="${ability}"]`).val());
          const pointDiff = newValue - abilities[ability];
          usedPoints += pointCosts[newValue] - pointCosts[abilities[ability]];
          updatedAbilities[ability] = newValue;
        }

        // Check if the point allocation is valid
        if (usedPoints <= totalPoints) {
          // Update the abilities and remaining points
          for (const ability in abilities) {
            abilities[ability] = updatedAbilities[ability];
          }
          totalPoints -= usedPoints;
          html.find("#remainingPoints").text(totalPoints);
        } else {
          // Show an error message if the point allocation is invalid
          ui.notifications.error("Invalid point allocation. Too many points spent.");
        }
      },
    },
    cancel: {
      label: "Cancel",
    },
  },
}).render(true);
