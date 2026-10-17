# Counteract from a chat card

Right-click a spell or effect card in chat and choose **Counteract**. The flow is
**request → adjust/approve → roll**. The player picks how to counteract (a castable spell at a
rank, or a skill) and sends a request. The GM sees the target with a suggested counteract rank
and DC, adjusts them or approves as is. The player's client then pays for a spell and rolls
PF2e's check against the approved DC. On a success the GM gets an **Apply** button that removes
the effect, with **Undo**.

Commit prefix: `counteract:` — `git log --grep '^counteract:'` is the progress ledger.

## Decisions (made with Mark, 2026-10-17)

- **Entry point.** Foundry's chat right-click menu (`getChatMessageContextOptions`), shown to
  every user. PF2e already binds plain right-click in the effects panel, so the module leaves
  that panel alone.
- **GM sets the target (revised 2026-10-17).** The GM supplies the target's counteract rank and
  DC before the roll. The module pre-fills both from the rules below; the GM edits or approves.
  The request and the approval travel over the module socket (`module.marks-mods`); both are
  transient signals, so nothing persists until the roll message exists.
- **Removal.** The GM confirms. A successful roll card shows an Apply button to GMs only.
  The GM's own click writes the target actor.
- **Cost.** A spell source spends the slot, focus points or innate use, the way casting does,
  after the GM approves and before the roll. A skill source costs nothing.
- **Home.** This repo, as `src/counteract/`, beside `barrage/` and `glimpse/`.
- **Scope.** Spell and skill sources. Items, feats and custom modifiers are out of scope for v1.

## PF2e facts this plan relies on

Verified against `_pf2e-source` (PF2e master, 2026-09-25) and the installed PF2e 8.6.1 bundle.

- **Spell card flags.** Every spell card from a spellcasting entry carries `flags.pf2e.casting`
  (`{ id: entryId, tradition }`) and `flags.pf2e.origin` (`{ actor, uuid, type: "spell", castRank,
  rollOptions }`). Only an actual cast adds `origin:action:slug:cast-a-spell` to `origin.rollOptions`.
  `src/glimpse/rules.ts#readCast` already reads this shape.
- **Effect card flags.** `item.toMessage()` stores `getOriginData()` on `flags.pf2e.origin`:
  `{ actor, uuid, type: "effect", rollOptions }`. `uuid` is the effect embedded on the actor.
- **Effect data.** `system.level.value` and `system.context.origin`
  (`{ actor, token, item, spellcasting, rollOptions }`, `module/item/abstract-effect/data.ts`).
  A spell effect dragged from a cast card gets `level = castRank`, `origin.item = spell uuid`
  and a non-null `origin.spellcasting` (`scripts/system/dragstart-handler.ts:40-70`).
- **Counteract statistic.** `entry.counteraction` (getter on each spellcasting entry) builds the
  `counteract` Statistic. `counteraction.check.roll({ dc, label, traits, extraRollNotes,
  extraRollOptions, target, callback })` rolls it (`StatisticRollParameters`,
  `module/system/statistic/statistic.ts:652`). PF2e's roll card then states the degree of
  success and honours the world's metagame DC/result visibility settings.
- **Paying for the cast.** `entry.consume(spell, rank, slotIndex?)` returns `false` and warns when
  the actor can't pay (`module/item/spellcasting-entry/document.ts:280`). `entry.cast()` returns
  nothing, so it can't report a failed payment; call `consume()` directly.
- **Castable spells.** `entry.getSheetData()` returns `groups[].active[]` entries of
  `{ spell, castRank, expended, virtual }`; the index in `active` is the prepared slot id the
  sheet passes to `cast()`.
- **Spell DC.** `actor.spellcasting.get(entryId)?.statistic?.dc.value`; `actor.getStatistic("spell-dc")`
  gives the actor's highest.
- **Effect stages.** Afflictions are effects with a counter badge and `fromSpell: false`; no core
  effect carries stage labels or affliction traits. A spell effect's counter means something else
  (Bless counts its aura's reach, Mirror Image its images). The `affliction` item type throws in
  production builds.
- **Conditions.** A condition dropped on a token goes through `actor.increaseCondition` with no
  origin context (`module/actor/sheet/base.ts`), so nothing ties Slow's Slowed to the spell.
  `ConditionPF2e#appliedBy` returns the item or condition that applied it (`system.references.parent`
  or `flags.pf2e.grantedBy`). Spell descriptions link conditions as
  `@UUID[Compendium.pf2e.conditionitems.Item.<id>]` (PF2e's pack build rewrites name links to ids),
  and `game.pf2e.ConditionManager.conditions` is keyed by both slug and that uuid.
- **Chat context menu.** `ChatLog#_getEntryContextOptions` fires `getChatMessageContextOptions`
  with the options array; each entry is `{ label, icon, visible(li), onClick(event, li) }` (v14
  build 369 and PF2e master; the old `{ name, condition, callback }` shape is deprecated, and the
  bundled foundry-pf2e typings still show it, so declare a local type). `li` is the
  `.message[data-message-id]` HTMLElement.
- **Skill checks.** `actor.skills[slug].check.roll({ dc, label, extraRollOptions, callback })`
  takes the same `StatisticRollParameters` as the counteract statistic.
- **Hero-point reroll.** PF2e deletes the roll message and posts a new one carrying only `pf2e`
  flags, so the module's counteract flag is lost and the degree may change. Wave 3 handles it.
  `pf2e.reroll` names no message and PF2e can bail out after it. `Roll#clone` shares `options`, so
  the reroll's `isReroll` and degree also land on the old roll. PF2e stores only the rolled
  outcome's note in `context.notes` and the reroll re-filters those by the new outcome.

## Rules (pure, unit-tested)

| Thing | Counteract rank | DC |
|---|---|---|
| Spell card | `origin.castRank` | caster's DC for `casting.id`, else caster's highest spell DC |
| Effect from a spell (`origin.spellcasting` set, or origin item is a spell) | `level` | origin actor's spell DC (match `origin.spellcasting.tradition` when present), else level-based DC for `level` |
| Other effect | `ceil(level / 2)`, minimum 0 | level-based DC for `level` |
| Other effect with no level, from a creature | `ceil(creatureLevel / 2)`, minimum 0 | level-based DC for `creatureLevel` |

| Hazard card (any message whose speaker actor is a hazard) | rank parsed from the hazard's Disable text (`system.details.disable`, e.g. "9th level", "rank 9"), else `ceil(level / 2)` | "counteract DC N" parsed from the Disable text, else level-based DC for the hazard's level |
| Effect whose origin actor is a hazard | as the hazard card | as the hazard card |
| GM-posted hazard counteract card | the card's stored rank | the card's stored DC |

**GM-posted hazard card.** On a GM client, right-clicking the hazard sheet's Disable section
offers **Post counteract card**. It posts a chat message spoken by the hazard (its token when on
the scene) with `flags["marks-mods"].counteractTarget = { rank, dc }` from the hazard parse. Every
viewer sees the hazard's name and image with a prompt to counteract it. The rank, DC and enriched
Disable text sit in a `data-visibility="gm"` block. Players counteract from it like any hazard
card, and the GM still approves, with the review pre-filled from the stored values. PF2e's hazard
sheet is an appv1 `ActorSheet`, so the entry hooks `renderHazardSheetPF2e`; the module defines no
v1 class.

These are the GM's suggestions; the GM's approved values are what the roll uses. In the core
pack, 20 of 22 hazards that mention counteracting state a rank and 18 state a DC; Frozen Moment
(level 17) reads "9th level; counteract DC 36", which the fallbacks also give.

Source (the roller's) counteract rank: a spell's cast rank; for a skill, `ceil(rollerLevel / 2)`,
minimum 0. The GM may adjust it too.

Level-based DCs: GM Core table, levels −1 to 25 (−1→13 … 25→50).

Outcome, with source rank `s` and target rank `t`: critical success counteracts when
`t ≤ s + 3`, success when `t ≤ s + 1`, failure when `t < s`, critical failure never.

## Invariants

1. Every PF2e and Foundry call is a v14 API (repo hard rule). Windows are ApplicationV2 with a
   Svelte 5 body, like `src/ui/BarrageApp.ts`.
2. Rules live in `src/counteract/rules.ts`, free of `game`/`foundry` globals, and every rule above
   has a vitest case.
3. No player client writes a document it doesn't own. The roller writes only its own actor
   (payment) and its own roll message's flag; every target-actor write happens on a GM client in
   response to a GM click. The socket carries only the request, the approval and the refusal.
4. The roll is PF2e's (`counteraction.check.roll` for a spell, `skills[slug].check.roll` for a
   skill). The module never builds its own `Roll` or recomputes the degree of success; it reads
   `roll.degreeOfSuccess`.
5. Payment happens after GM approval and before the roll; a GM refusal costs nothing, and a failed
   payment aborts with no roll. If the player cancels PF2e's check dialog after paying, the
   payment stands and the module warns.
6. All user-facing strings live under `marks-mods.counteract.*` in `lang/en.json`.
7. Undo restores exactly what Apply changed: the deleted effect's `toObject()` with `keepId`, or
   the previous badge value. Items the effect grants return under new ids.

## Judgment calls reserved for review

- **Effect matching for spell cards.** A spell card doesn't name the effect it created. Wave 3
  lists candidate effects; the reviewer checks the candidate rule (below) before it lands.
- **Counteract-capable filter.** v1 lists a spell when PF2e's `system.counteraction` flag is set
  or its description mentions "counteract" (case-insensitive), sorts flagged spells first, and
  offers a "show all spells" toggle. The flag marks 57 true counteract spells; the description
  catches those plus ~54 that merely mention being counteracted, and a few real ones the flag
  misses (Elemental Counter, Nullify, Spell Riposte). The reviewer judges whether that filter
  misses common sources.

## Wave 1 — rules and card reading

Pure code and tests only. No hooks, no UI.

- `src/counteract/rules.ts`:
  - `readCounteractCard(flags)` → `{ kind: "spell" | "effect", originUuid, actorUuid, entryId?, castRank? } | null`
    for an actual spell cast or an effect card; `null` for anything else (attack rolls,
    damage, conditions, items).
  - `levelBasedDC(level)`, `effectCounteractRank({ level, fromSpell })`,
    `counteracts(degree, sourceRank, targetRank)`.
  - `isCounteractSource({ counteraction, description })` for the source filter.
- `src/tests/unit/counteract.test.ts` covering every row of the rules table, the outcome rule at
  each boundary (e.g. success with `t = s + 1` counteracts and `t = s + 2` doesn't), level −1, 0
  and 25 DCs, and `readCounteractCard` on a spell cast, an effect card, a non-cast spell card
  (`casting` null) and a damage roll.
- Gate: `npm test` and `npm run check` pass.

## Wave 2 — request, adjust/approve, roll

Rules additions (pure, tested, in `rules.ts`): the creature-level row of the table
(`effectCounteractRank` takes an optional `creatureLevel` used when `level` is absent),
`skillCounteractRank(level)`, and `degreeNeeded(sourceRank, targetRank)` for the GM's view.

- `src/counteract/index.ts` exports `registerCounteract()`; `src/index.ts` calls it beside
  `registerGlimpse()`. `module.json` has `"socket": true`.
- Hook `getChatMessageContextOptions`: add **Counteract** (`fa-solid fa-shield-halved`) when
  `readCounteractCard(message.flags.pf2e)` returns a card.
- Roller actor: the first controlled token's actor, else `game.user.character`; warn if neither.
- **Request (player).** Picker: `src/ui/CounteractApp.ts` +
  `src/ui/components/counteract/Counteract.svelte`. It names the target and offers two kinds of
  source:
  - Spells from every spellcasting entry's `getSheetData()`, castable `(spell, castRank, slot)`
    only. Identical prepared copies collapse into one row with a count; groups with no uses left
    are skipped. Filter and sort per the judgment call below, with a "show all spells" toggle.
  - Skills from `actor.skills`, each with source rank `ceil(level / 2)`.
  Choosing a row sends `{ requestId, userId, cardId, actorUuid, source, sourceRank }` to the
  active GM and the picker shows a waiting state with **Cancel**. With no active GM, warn and stop.
  When the roller is the GM, skip the socket and go straight to the GM view.
- **Adjust/approve (GM).** The active GM's client resolves the target (wave 1 rules + live data):
  display name, suggested rank and DC, and the basis ("Slow, rank 3", "half creature level 7").
  For an effect card, load the effect by `originUuid`; if it's gone, the GM sees that and can only
  refuse. `fromSpell = effect.system.fromSpell || isSpellEffect(...)`; the caster is
  `effect.system.context.origin.actor`, not the card's `actorUuid`. Build `SpellcastingDC[]` from
  every entry with a `statistic`. A spell card whose caster can't be found leaves the DC blank for
  the GM to fill. The GM view (same frameless Svelte app pattern) shows who asks, the source and
  its rank, and editable target rank, DC and source rank, with the degree needed. **Approve** sends
  the values back; **Refuse** sends a refusal; the player's picker closes either way.
- **Roll (player, on approval).** For a spell: `consume()`, then `entry.counteraction.check.roll`
  with the spell's traits plus its tradition (template: PF2e `SpellPF2e#rollCounteract`). For a
  skill: `actor.skills[slug].check.roll` with `extraRollOptions: ["action:counteract"]`. Both pass
  `dc: { value, label }` from the GM, `label` naming the target, one note per degree (all four)
  that states the concrete result against the approved target rank, e.g. "Slow (rank 3) is
  counteracted." / "Slow (rank 3) is not counteracted." (hidden from players when the world hides
  check results), no `target`, and a `callback` that writes
  `flags["marks-mods"].counteract` on the roll message:
  `{ card: messageId, kind, originUuid, source, targetRank, sourceRank, dc, degree, counteracted,
  targets: [token uuids the roller targeted] }`.
- Gate: `npm test`, `npm run check`, `npm run build`, then a manual check in a world with a GM
  and a player client: the player's cleric right-clicks an NPC's Slow card and requests Dispel
  Magic rank 4; the GM sees rank 3 and the NPC's spell DC suggested, changes the DC, approves; the
  slot is spent and the PF2e roll card shows the result against the GM's DC. Repeat with a skill,
  and once with a refusal (no slot spent).

## Wave 3 — GM Apply and Undo

- `renderChatMessageHTML`: on GM clients only, a roll message carrying the counteract flag with
  `counteracted: true` gets **Apply**; once applied it shows **Undo** instead.
- Candidates for Apply:
  - Effect card: the effect at `originUuid`.
  - Spell card: effects on the flag's `targets` tokens (else every token on the current scene)
    whose `system.context.origin.item === originUuid`, and conditions whose slug the spell's
    description links. When the targets hold no candidate, the scene's tokens join them. With
    exactly one candidate in total Apply ends it. With more than one, or none, or after widening,
    a frameless picker (`src/ui/CounteractApplyApp.ts` on `SvelteWindow`, body
    `src/ui/components/counteract/CounteractApply.svelte`) lists the targeted tokens' effects and
    unlocked conditions (those no other item applied: `!appliedBy`) with the matches pre-checked,
    and the GM picks.
- Apply removes each chosen effect or condition (a valued condition goes whole), or lowers a
  counter-badge effect that is not from a spell by one stage and removes it at stage 1, then records `{ actorUuid, effectId, data | previousStage }[]` and `applied: true`
  on the flag.
- Hazard card: nothing to delete. Apply marks the flag `applied: true` and posts nothing else;
  the GM disables the hazard by hand. Undo clears it.
- Undo restores from that record and clears `applied`.
- A hero-point reroll replaces the roll message without the module flag; carry the flag over to
  the new message (or show the GM the reroll's degree) so Apply still appears and reflects it.
- Gate: `npm test`, `npm run check`, `npm run build`, and manual: Apply removes Slow from the
  NPC; Undo brings it back with the same id; a player sees neither button.

## Not in v1

Item and feat sources; custom modifiers (players add those in PF2e's roll dialog); automatic application without a GM click;
counteracting from the effects panel or the token HUD.
