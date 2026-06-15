const assert = require('node:assert/strict');
const test = require('node:test');

const {
  getInitiativeGroupMembers,
  getCharacterVisibilityMenuItems,
  getInitiativeGroupVisibilityMenuItems,
  buildInitiativeGroupVisibilityUpdates
} = require('./referee-visibility.js');

test('finds all members of the same initiative group', () => {
  const groupId = 'group-1';
  const players = [
    { id: 'a', initiativeGroupId: groupId, isHidden: false },
    { id: 'b', initiativeGroupId: groupId, isHidden: true },
    { id: 'c', initiativeGroupId: 'group-2', isHidden: true }
  ];

  assert.deepEqual(getInitiativeGroupMembers(players, players[0]), [players[0], players[1]]);
});

test('exposes the group visibility menu in the expected order', () => {
  assert.deepEqual(getCharacterVisibilityMenuItems(true), [
    { label: 'Reveal Now', isHidden: false, revealOnTurn: false },
    { label: 'Reveal on Turn', isHidden: true, revealOnTurn: true }
  ]);

  assert.deepEqual(getCharacterVisibilityMenuItems(false), [
    { label: 'Hide Character', isHidden: true, revealOnTurn: false }
  ]);

  const hiddenGroupItems = getInitiativeGroupVisibilityMenuItems([
    { id: 'a', isHidden: true },
    { id: 'b', isHidden: false }
  ], true);

  assert.deepEqual(hiddenGroupItems, [
    { label: 'Group: Reveal Now', isHidden: false, revealOnTurn: false },
    { label: 'Group: Reveal On Turn', isHidden: true, revealOnTurn: true }
  ]);

  assert.deepEqual(
    getInitiativeGroupVisibilityMenuItems([
      { id: 'a', isHidden: true },
      { id: 'b', isHidden: false }
    ], false),
    [
      { label: 'Group: Hide', isHidden: true, revealOnTurn: false }
    ]
  );

  assert.deepEqual(getInitiativeGroupVisibilityMenuItems([{ id: 'a', isHidden: true }], true), []);
});

test('builds grouped visibility updates for every member with an id', () => {
  const updates = buildInitiativeGroupVisibilityUpdates(
    [
      { id: 'a', isHidden: false },
      { id: 'b', isHidden: true },
      { isHidden: true }
    ],
    true,
    false
  );

  assert.deepEqual(updates, [
    { id: 'a', isHidden: true, revealOnTurn: false },
    { id: 'b', isHidden: true, revealOnTurn: false }
  ]);
});
