/**	Perform standard point buy method for character abilities.
 */
 
export class CharCheck {
	actor = null;
	dlg = null;
	hookId = null;
	alreadyRendering = false;
	
	initCap(str) {
		return str.charAt(0).toUpperCase() + str.slice(1);
	}
	
	addGrants(grants, skillGrants, item) {
		if (!item?.system?.grants || item.system.grants.length == 0)
			return;
		
		for (let grant of item.system.grants) {
			let [type, modName, packName, itemType, itemUuid] = grant.uuid.split('.');
			if (type == 'Compendium') {
				const pack = game.packs.get(`${modName}.${packName}`);
				if (pack) {
					const item = pack.index.get(itemUuid);
					if (!item)
						continue;
					this.addGrants(grants, skillGrants, item);
					if (item.type == 'skill' || item.type == 'edge' || item.type == 'hindrance') {
						if (grant?.mutation?.system?.die)
							skillGrants[item.system.swid] = grant.mutation.system.die.sides;
						else if (item.type == 'skill')
							// Assume a skill granted gets d4 free.
							skillGrants[item.system.swid] = 4;
						else if (item?.system?.swid)
							grants.push(item.system.swid);
						else
							grants.push(item.name);
					}
				}
			}
		}
	}	

	async calcCost(html) {
		if (this.alreadyRendering)
			return;
		this.alreadyRendering = true;
		let skillPoints = Number(game.settings.get('swade-charcheck', 'skills'));
		let attrPoints = Number(game.settings.get('swade-charcheck', 'attributes'))*2;
		let availEdges = Number(game.settings.get('swade-charcheck', 'edges'))*2;
		let maxHind = Number(game.settings.get('swade-charcheck', 'hindrances'));
		let bornAhero = Number(game.settings.get('swade-charcheck', 'bornAhero'));
		
		let elderly = this.actor.items.find(it => it.type == 'hindrance' && it.system.swid == 'elderly');
		let young = this.actor.items.find(it => it.type == 'hindrance' && it.system.swid == 'young');
		if (elderly)
			skillPoints += 5;
		if (young) {
			skillPoints -= 2;
			if (young.system.major)
				attrPoints -= 4;
			else
				attrPoints -= 2;
		}

		// Check for this special ability gives humans an extra Edge.

		if (this.actor.items.find(it => it.type == 'ability' && it.system.swid == 'adaptable'))
			availEdges += 2;

		html.find("#availSkills").text(skillPoints);
		html.find("#availAttr").text(attrPoints);
		html.find("#availEdges").text(availEdges);
		html.find("#maxHind").text(maxHind);
		
		let advances = 0;
		for (let adv of this.actor.system.advances.list)
			if (adv.sort > advances && !adv.planned)
				advances = adv.sort;
		html.find("#numAdv").text(advances ? advances : '--');
		html.find("#ptsAdv").text(advances ? advances * 2 : '--');
		html.find("#maxAdv").text(advances ? advances * 2 : '--');
		
		// Find all effects that increase attributes, which ancestries use
		// to increase base attributes.
		
		let attrBonuses = [];
		attrBonuses['agility'] = 0;
		attrBonuses['smarts'] = 0;
		attrBonuses['spirit'] = 0;
		attrBonuses['strength'] = 0;
		attrBonuses['vigor'] = 0;
		
		for (let item of this.actor.items) {
			if (!item.effects || item.effects.length == 0)
				continue;
			for (let effect of item.effects) {
				if (effect.changes) {
					for (let change of effect.changes) {
						let m = change.key.match(/system.attributes.([a-z]+)\.die.sides/);
						if (m) {
							let attr = m[1];
							if (change.mode == 2) {
								attrBonuses[attr] += Number(change.value);
							}
						}
					}
				}
			}
		}

		let numAttr = 0;
		let ptsAttr = 0;
		numAttr += (this.actor.system.attributes.agility.die.sides - 4 - attrBonuses['agility'])/2 + this.actor.system.attributes.agility.die.modifier;
		numAttr += (this.actor.system.attributes.smarts.die.sides - 4 - attrBonuses['smarts'])/2 + this.actor.system.attributes.smarts.die.modifier;
		numAttr += (this.actor.system.attributes.spirit.die.sides - 4 - attrBonuses['spirit'])/2 + this.actor.system.attributes.spirit.die.modifier;
		numAttr += (this.actor.system.attributes.strength.die.sides - 4 - attrBonuses['strength'])/2 + this.actor.system.attributes.strength.die.modifier;
		numAttr += (this.actor.system.attributes.vigor.die.sides - 4 - attrBonuses['vigor'])/2 + this.actor.system.attributes.vigor.die.modifier;

		ptsAttr += numAttr * 2;

		let grants = [];
		let skillGrants = {};

		for (let item of this.actor.items) {
			if (!item.system.grants || item.system.grants.length == 0)
				continue;
			// Charge normally for items granted by archetype. Items granted
			// by Edges, ancestries, etc., are presumed to be free.
			if (item.type == "ability" && item?.system?.subtype == 'archetype')
				continue;
			this.addGrants(grants, skillGrants, item);
		}

		let smartsSkills = 0;
		let skillCost = 0;
		let numSkills = 0;
		let skills  = this.actor.items.filter(it => it.type == 'skill');
		for (let s of skills) {
			let skill = s.system;
			if (skill.attribute) {
				if (skill.swid == 'none' || skill.swid == 'unskilled-attempt')
					continue;
				let sides = skill.die.sides + (skill.die.sides == 12 && skill.die.modifier > 0 ? skill.die.modifier * 2 : 0);
				let attr = this.actor.system.attributes[skill.attribute]
				let linkedAttr = attr.die.sides + (attr.die.sides == 12 && attr.die.modifier > 0 ? attr.die.modifier * 2 : 0);
				let grantValue = 0
				if (skillGrants[s.system.swid])
					grantValue = skillGrants[s.system.swid];
				let cost = 0;

				if (grantValue) {
					if (sides > grantValue) {
						cost = (sides - grantValue) / 2;
						if (sides > linkedAttr && grantValue <= linkedAttr)
							cost += (sides - linkedAttr) / 2;
					}
				} else {
					cost = (Math.min(sides, linkedAttr) - 4)/2;
					if (!skill.isCoreSkill)
						cost++;
					if (sides > linkedAttr)
						cost += sides - linkedAttr;
				}
				if (cost > 0)
					numSkills++;
				skillCost += cost;
				if (skill.attribute == 'smarts')
					smartsSkills += cost;
			}
		}
		
		// Count number of edges: ignore those that are in the grants
		// for the ancestry.

		let edges  = this.actor.items.filter(it => it.type == 'edge');
		let numEdges = 0;
		for (let e of edges) {
			// Don't count edges that were granted by the ancestry.
			if (e.flags['swade-core-rules']) {
				if (e.flags['swade-core-rules'].abilityGrant)
					continue;
			}
			if (grants.includes(e.system.swid))
				continue;
			numEdges++;
		}
		let edgeCost = numEdges * 2;

		let hindCost = 0;
		let hindrances  = this.actor.items.filter(it => it.type == 'hindrance');
		let numHind = 0;
		for (let hind of hindrances) {
			if (grants.includes(hind.system.swid) || grants.includes(hind.name))
				continue;
			numHind++;
			if (hind.system.severity == 'either')
				hindCost += hind.system.major ? 2 : 1;
			else if (hind.system.severity == 'major')
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

		let totalAvail = skillPoints + attrPoints + availEdges + hindCost + advances * 2;

		let ptsTotal = ptsAttr + skillCost + edgeCost;
		html.find("#ptsTotal").text(ptsTotal);
		html.find("#availTotal").text(totalAvail);
		
		let prompt = "";
		if (ptsAttr < attrPoints)
			prompt += "Too few attribute points spent. ";
		if (skillCost < skillPoints)
			prompt += "Too few skill points spent. ";
		if (edgeCost < availEdges)
			prompt += "Too few Edges chosen. ";
		if (hindCost > maxHind)
			prompt += "Too many Hindrances chosen. ";
		if (totalAvail > ptsTotal && hindCost > 0 && hindCost <= maxHind)
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
					// If this setting rule in effect any edges can be taken.
					if (bornAhero)
						break;
					// If Edge was grante by something it's free, and don't check
					// the rank requirement.
					if (grants.includes(edge.system.swid))
						break;
					if (rank < req.value) {
						failed = true;
						reason = ranks[req.value];
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
						reason = `${req.label} d${req.value}+`;
					}
					break;
				case 'wildCard':
					if ((this.actor.type == 'character') != req.value && this.actor.system.wildCard != req.value) {
						failed = true;
						reason = (req.value ? '' : "not ") + 'Wild Card';
					}
					break;
				case 'edge':
				case 'ancestry':
				case 'power':
				case 'hindrance':
					let reqItem = this.actor.items.find(it => it.type == req.type && it.system.swid == req.selector);
					if (!reqItem) {
						failed = true;
						reason = req.label;
					}
					break;
				case 'other':
					// The only "defined" other requirement is Arcane Background (Any), so
					// look for that pattern. Any other requirement is just a text string.
					reason = req.label;
					if (reason.match(/Arcane Background \(Any\)/i)) {
						if (this.actor.items.find(
								it => it.system.isArcaneBackground
							))
							break;
					}

					let search = reason.match(/(.+) *\(Any\)/i);
					if (search) {
						const str = search[1].trim();
						let re = new RegExp(str, "i");
						failed = this.actor.items.find(
							it => it.name.match(re)
						) == null;
					} else {
						// Otherwise look for a item with that name.
						if (this.actor.items.find(it => it.name == reason) == null)
							// Since "other" can be anything arbitrary, set failed so that
							// it's always displayed if it wasn't an item.
							failed = true;
					}
					break;
				}
				if (req.combinator == 'and') {
					if (failed) {
						fulfilled = false;
						if (reasons)
							reasons += ', ';
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

		if (elderly && smartsSkills < 5)
			prompt += `Elderly must spend at least 5 points on Smarts skills. `;

		if (!prompt)
			prompt = "Character is balanced.";

		// Compute gear price and look for items with unsatisfied strength requirements.

		let totalPrice = 0;
		const gearTypes = ['armor', 'weapon', 'consumable', 'shield', 'gear'];
		let gear  = this.actor.items.filter(it => gearTypes.includes(it.type));
		for (let g of gear) {
			if (g.system.isAmmo)
				totalPrice += g.system.price;
			else
				totalPrice += g.system.price * g.system.quantity;
			if (g.system.minStr) {
				const minstr = eval(g.system.minStr.replace(/^d/, ''));
				if (this.actor.system.attributes.strength.die.sides < minstr)
					prompt += `${g.name} requires Strength ${g.system.minStr}. `;
			}
		}

		html.find("#prompt").text(prompt);
		
		html.find("#totalPrice").text(totalPrice);
		html.find("#currency").text(this.actor.system.details.currency);

		if (advances == 0 && this.actor.isOwner) {
			// Record the initial value of skills before advances take place.
			for (let skill of skills) {
				// Check for Unskilled Attempt or other weird skill.
				if (!skill.system.attribute)
					continue;
				let linkedAttr = this.actor.system.attributes[skill.system.attribute].die.sides;
				let flags = skill.flags['swade-charcheck'];
				if (flags && flags?.initVal != skill.system.die.sides || flags?.linkedAttr != linkedAttr) {
					await this.actor.updateEmbeddedDocuments("Item",
						[{ "_id": skill._id, "flags.swade-charcheck.initVal": skill.system.die.sides, "flags.swade-charcheck.linkedAttr": linkedAttr  }]
					);
				}
			}
		}
		this.alreadyRendering = false;
	}

	async createDialog(actor) {
		this.actor = actor;

		//callback with no arguments declared, theses can be declared in the function definition
		//in that case we use a .bind(this) for the function (unless static) is specific to the instance it's in
		//also, keeping a reference to the hook index for later unregister

		this.hookId = Hooks.on('renderCharacterSheet', this.renderCharacterSheet.bind(this));

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
			  <p id="prompt" height="60"></p>
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
					<td class="left">Advances</td>
					<td id="numAdv"></td>
					<td id="ptsAdv"></td>
					<td id="maxAdv"></td>
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
		
		async function handleRender(pb, html) {
			await pb.calcCost(html);
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
		  title: `Check Character: ${this.actor.name}`,
		  content: content,
		  buttons: {
			cancel: {
			  label: "Done",
			  callback: (html) => {}
			},
		  },
		  close: () => {
			  this.finish();
		  },
		  render: (html) => { handleRender(this, html); }
		});
		this.dlg.render(true);

		return true;
	}


	renderCharacterSheet(actor, a2, a3) {
		this.dlg.render(true);
	}

	finish() {
		if (this.hookId) {
			Hooks.off('updateActor', this.hookId);
			this.hookId = null;
			if (CharCheck.activeDialogs[this.actor._id])
				delete CharCheck.activeDialogs[this.actor._id];
		}
		console.log(`swade-charcheck | Finished setting abilities for ${this.actor.name}`);
	}

	static activeDialogs = {};

	static {
		console.log("swade-charcheck | Swade Character Check loaded.");

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
	  scope: 'world',     // "world" = sync to db, "client" = local storage
	  config: true,       // false if you dont want it to show in module config
	  type: Number,       // Number, Boolean, String, Object
	  default: 5,
	  onChange: value => { // value is the new value of the setting
		//console.log('swade-charcheck | budget: ' + value)
	  }
	});
	game.settings.register('swade-charcheck', 'skills', {
	  name: 'Points available for skills',
	  hint: 'The number of points available for buying skills.',
	  scope: 'world',     // "world" = sync to db, "client" = local storage
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
	  scope: 'world',     // "world" = sync to db, "client" = local storage
	  config: true,       // false if you dont want it to show in module config
	  type: Number,       // Number, Boolean, String, Object
	  default: 0,
	  onChange: value => { // value is the new value of the setting
		//console.log('swade-charcheck | budget: ' + value)
	  }
	});
	game.settings.register('swade-charcheck', 'hindrances', {
	  name: 'Maximum Hindrances',
	  hint: 'The maximum number of points of Hindrances.',
	  scope: 'world',     // "world" = sync to db, "client" = local storage
	  config: true,       // false if you dont want it to show in module config
	  type: Number,       // Number, Boolean, String, Object
	  default: 4,
	  onChange: value => { // value is the new value of the setting
		//console.log('swade-charcheck | budget: ' + value)
	  }
	});
	game.settings.register('swade-charcheck', 'bornAhero', {
	  name: 'Born a Hero',
	  hint: 'Ignore Rank qualifications during character creation.',
	  scope: 'world',     // "world" = sync to db, "client" = local storage
	  config: true,       // false if you dont want it to show in module config
	  type: Boolean,       // Number, Boolean, String, Object
	  default: false,
	});
	
});

function insertActorHeaderButtons(actorSheet, buttons) {
  let actor = actorSheet.object;
  if (actor.type != 'character')
	  return;
  buttons.unshift({
    label: "Check",
    icon: "fas fa-calculator",
    class: "charcheck-button",
    onclick: async () => {
		let pb = null;
		try {
			let dlg = CharCheck.activeDialogs[actor._id];
			if (dlg) {
				dlg.render(true);
				return false;
			}
			pb = new CharCheck();
			if (!await pb.createDialog(actor))
				return false;
			CharCheck.activeDialogs[actor._id] = pb.dlg;
			return true;
		} catch (msg) {
			ui.notifications.warn(msg);
		}

    }
  });
}

Hooks.on("getActorSheetHeaderButtons", insertActorHeaderButtons);
