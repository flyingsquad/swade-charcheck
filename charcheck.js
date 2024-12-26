/**	Perform standard point buy method for character abilities.
 */
 
export class CharCheck {
	actor = null;
	dlg = null;


	skillPoints = Number(game.settings.get('swade-charcheck', 'skills'));
	attrPoints = Number(game.settings.get('swade-charcheck', 'attributes'))*2;
	availEdges = Number(game.settings.get('swade-charcheck', 'edges'))*2;
	maxHind = Number(game.settings.get('swade-charcheck', 'hindrances'));
	bornAhero = Number(game.settings.get('swade-charcheck', 'bornAhero'));
	
	initCap(str) {
		return str.charAt(0).toUpperCase() + str.slice(1);
	}

	calcCost(html) {
		html.find("#availSkills").text(this.skillPoints);
		html.find("#availAttr").text(this.attrPoints);
		html.find("#availEdges").text(this.availEdges);
		html.find("#maxHind").text(this.maxHind);

		let numAttr = 0;
		let ptsAttr = 0;
		numAttr += (this.actor.system.attributes.agility.die.sides - 4)/2 + this.actor.system.attributes.agility.die.modifier;
		numAttr += (this.actor.system.attributes.smarts.die.sides - 4)/2 + this.actor.system.attributes.smarts.die.modifier;
		numAttr += (this.actor.system.attributes.spirit.die.sides - 4)/2 + this.actor.system.attributes.spirit.die.modifier;
		numAttr += (this.actor.system.attributes.strength.die.sides - 4)/2 + this.actor.system.attributes.strength.die.modifier;
		numAttr += (this.actor.system.attributes.vigor.die.sides - 4)/2 + this.actor.system.attributes.vigor.die.modifier;

		ptsAttr += numAttr * 2;

		let skillCost = 0;
		let numSkills = 0;
		let skills  = this.actor.items.filter(it => it.type == 'skill');
		for (let i = 0; i < skills.length; i++) {
			let sides = skills[i].system.die.sides;
			let cost = (sides - 4)/2;
			let skill = skills[i].system;
			if (!skill.isCoreSkill)
				cost++;
			if (skill.attribute) {
				let linkedSkill = this.actor.system.attributes[skill.attribute].die.sides;
				if (sides > linkedSkill)
					cost += sides - linkedSkill;
				let modifier = skill.die.modifier;
				if (cost > 0)
					numSkills++;
				skillCost += cost;
			}
		}
		
		let edges  = this.actor.items.filter(it => it.type == 'edge');
		let numEdges = edges.length;
		let edgeCost = numEdges * 2;

		let hindCost = 0;
		let hindrances  = this.actor.items.filter(it => it.type == 'hindrance');
		let numHind = hindrances.length;
		for (let i = 0; i < hindrances.length; i++) {
			let h = hindrances[i].system;
			if (h.severity == 'either')
				hindCost += h.major ? 2 : 1;
			else if (h.severity == 'major')
				hindCost += 2;
			else
				hindCost++;
		}

		html.find("#numAttr").text(numAttr);
		html.find("#ptsAttr").text(ptsAttr);

		html.find("#numSkills").text(numSkills);
		html.find("#ptsSkills").text(skillCost);
		
		html.find("#numEdges").text(numEdges);
		html.find("#ptsEdges").text(edgeCost);

		html.find("#numHind").text(numHind);
		html.find("#ptsHind").text(hindCost);

		let totalAvail = this.skillPoints + this.attrPoints + this.availEdges + hindCost;

		let ptsTotal = ptsAttr + skillCost + edgeCost;
		html.find("#ptsTotal").text(ptsTotal);
		html.find("#availTotal").text(totalAvail);
		
		let prompt = "";
		if (ptsAttr < this.attrPoints)
			prompt += "Too few attribute points spent. ";
		if (skillCost < this.skillPoints)
			prompt += "Too few skill points spent. ";
		if (edgeCost < this.availEdges)
			prompt += "Too few Edges chosen. ";
		if (ptsHind > this.maxHind)
			prompt += "Too many Hindrances chosen. ";
		if (totalAvail > ptsTotal && hindCost > 0)
			prompt += "Unspent Hindrance points. ";
		if (totalAvail < ptsTotal)
			prompt += "Not enough Hindrance points. ";
		
		let rank = Math.min(16, Math.trunc(this.actor.system.advances.list.size / 4));
		let ranks = ["Novice", "Seasoned", "Veteran", "Heroic", "Legendary"];

		// Check requirements for edges.

		let unsatReq = '';

		for (let edge of edges) {
			let fulfilled = true;
			let reason = '';
			let reasons = '';
			let ors = '';
			let orSuccess = false;
			for (let req of edge.system.requirements) {
				let failed = false;

				switch (req.type) {
				case 'rank':
					if (this.bornAhero)
						break;
					if (rank < req.value) {
						failed = true;
						reason = 'Rank (' + ranks[req.value] + ')';
					}
					break;
				case 'attribute':
					if (this.actor.system.attributes[req.selector].die.sides < req.value) {
						failed = true;
						reason = `${this.initCap(req.selector)} d${req.value}+`;
					}
					break;
				case 'skill':
					let skill = this.actor.items.find(it => it.type == 'skill' && it.system.swid == req.selector);
					if (!skill || skill.system.die.sides < req.value) {
						failed = true;
						reason = `${this.initCap(req.label)} d${req.value}+`;
					}
					break;
				case 'edge':
					let reqEdge = this.actor.items.find(it => it.type == 'edge' && it.system.swid == req.selector);
					if (!reqEdge) {
						failed = true;
						reason = 'Edge: ' + req.label;
					}
				}
				if (req.combinator == 'and') {
					if (failed) {
						fulfilled = false;
						if (reasons)
							reasons += ' and ';
						reasons += reason;
					}
				} else if (req.combinator == 'or') {
					if (ors)
						ors += ' or ';
					if (!failed)
						orSuccess = true;
					ors += reason;
				}
			}
			if (!orSuccess && ors)
				unsatReq += ors;
			if (!fulfilled)
				unsatReq += `${edge.name}: ${reasons}. `;
		}
		
		if (unsatReq)
			prompt += 'Unsatisfied Requirements: ' + unsatReq;

		if (!prompt)
			prompt = "Character is balanced.";

		html.find("#prompt").text(prompt);

		let totalPrice = 0;
		const gearTypes = ['armor', 'weapon', 'consumable', 'shield', 'gear'];
		let gear  = this.actor.items.filter(it => gearTypes.includes(it.type));
		for (let i = 0; i < gear.length; i++) {
			totalPrice += gear[i].system.price;
		}
		
		html.find("#totalPrice").text(totalPrice);
		html.find("#currency").text(this.actor.system.details.currency);
		
	}

	createDialog(actor) {
		this.actor = actor;

		let content =
			  `<style>
				td {
					text-align: center;
				}
				.left {
					text-align: left;
				}
			  </style>
			  <form>
			  <p id="prompt"></p>
			  <table>
				<tr>
					<th class="left">Totals</th>
					<th>Num</th>
					<th>Pts</th>
					<th>Avail</th>
				</tr>
				<tr>
					<td class="left">Attributes</td>
					<td id="numAttr"></td>
					<td id="ptsAttr"></td>
					<td id="availAttr"></td>
				</tr>
				<tr>
					<td class="left">Skills</td>
					<td id="numSkills"></td>
					<td id="ptsSkills"></td>
					<td id="availSkills"></td>
				</tr>
				<tr class="left">
					<td class="left">Edges</td>
					<td id="numEdges"></td>
					<td id="ptsEdges"></td>
					<td id="availEdges"></td>
				</tr>
				<tr>
					<td class="left">Hindrances</td>
					<td id="numHind"></td>
					<td id="ptsHind"></td>
					<td id="maxHind"></td>
				</tr>
				<tr>
					<td class="left">TOTAL</td>
					<td></td>
					<td id="ptsTotal"></td>
					<td id="availTotal"></td>
				</tr>
			  </table>
			  <p>Total Price of Gear: <span id="totalPrice"></span>, Currency: <span id="currency"></span></p>
			</form>
		  `;
		
		function handleRender(pb, html) {
			pb.calcCost(html);
			html.on('change', html, (e) => {
				let html = e.data;
				switch (e.target.nodeName) {
				case 'INPUT':
					break;
				}
			});
		}

		let leaving = true;

		this.dlg = new Dialog({
		  title: "Check Character",
		  content: content,
		  buttons: {
			ok: {
			  label: "Check",
			  callback: (html) => {
				this.calcCost(html);
				leaving = false;
			  },
			},
			cancel: {
			  label: "Done",
			  callback: (html) => {
				  leaving = true;
			  }
			},
		  },
		  default: "ok",
		  close: () => {
			if (!leaving)
				throw new Error('Rechecking character...');
			leaving = true;
		  },
		  render: (html) => { handleRender(this, html); }
		});
		this.dlg.render(true);
	}
	
	finish() {
		console.log(`swade-charcheck | Finished setting abilities for ${this.actor.name}`);
	}

	static {
		console.log("swade-charcheck | Swade Character Check character filter loaded.");

		Hooks.on("init", function() {
		  console.log("swade-charcheck | Swade Character Check initialized.");
		});

		Hooks.on("ready", function() {
		  console.log("swade-charcheck | Swade Character Check ready to accept game data.");
		});
	}
}


/*
 * Create the configuration settings.
 */
Hooks.once('init', async function () {
	game.settings.register('swade-charcheck', 'attributes', {
	  name: 'Points available for attributes',
	  hint: 'The number of points available for buying attributes.',
	  scope: 'client',     // "world" = sync to db, "client" = local storage
	  config: true,       // false if you dont want it to show in module config
	  type: Number,       // Number, Boolean, String, Object
	  default: 8,
	  onChange: value => { // value is the new value of the setting
		//console.log('swade-charcheck | budget: ' + value)
	  }
	});
	game.settings.register('swade-charcheck', 'skills', {
	  name: 'Points available for skills',
	  hint: 'The number of points available for buying skills.',
	  scope: 'client',     // "world" = sync to db, "client" = local storage
	  config: true,       // false if you dont want it to show in module config
	  type: Number,       // Number, Boolean, String, Object
	  default: 15,
	  onChange: value => { // value is the new value of the setting
		//console.log('swade-charcheck | budget: ' + value)
	  }
	});
	game.settings.register('swade-charcheck', 'edges', {
	  name: 'Number of Edges',
	  hint: 'The number of free Edges.',
	  scope: 'client',     // "world" = sync to db, "client" = local storage
	  config: true,       // false if you dont want it to show in module config
	  type: Number,       // Number, Boolean, String, Object
	  default: 4,
	  onChange: value => { // value is the new value of the setting
		//console.log('swade-charcheck | budget: ' + value)
	  }
	});
	game.settings.register('swade-charcheck', 'hindrances', {
	  name: 'Maximum Hindrances',
	  hint: 'The maximum number of points of Hindrances.',
	  scope: 'client',     // "world" = sync to db, "client" = local storage
	  config: true,       // false if you dont want it to show in module config
	  type: Number,       // Number, Boolean, String, Object
	  default: 6,
	  onChange: value => { // value is the new value of the setting
		//console.log('swade-charcheck | budget: ' + value)
	  }
	});
	game.settings.register('swade-charcheck', 'bornAhero', {
	  name: 'Born a Hero',
	  hint: 'Ignore Rank qualifications during character creation.',
	  scope: 'client',     // "world" = sync to db, "client" = local storage
	  config: true,       // false if you dont want it to show in module config
	  type: Boolean,       // Number, Boolean, String, Object
	  default: true,
	});
	
});

function insertActorHeaderButtons(actorSheet, buttons) {
  let actor = actorSheet.object;
  buttons.unshift({
    label: "Check",
    icon: "fas fa-calculator",
    class: "charcheck-button",
    onclick: async () => {
		let pb = null;
		try {
			pb = new CharCheck();
			if (!await pb.createDialog(actor))
				return false;
		} catch (msg) {
			ui.notifications.warn(msg);
		} finally {
			if (pb)
				pb.finish();
		}

    }
  });
}

Hooks.on("getActorSheetHeaderButtons", insertActorHeaderButtons);
