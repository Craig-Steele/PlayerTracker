const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveJoinOutcome } = require('./join-state.js');

test('returns inactive when the join screen should not auto-forward', () => {
  assert.deepEqual(
    resolveJoinOutcome({
      campaignLoaded: true,
      currentCampaign: { id: 'campaign-a' },
      currentPlayerName: '',
      editingPlayerName: false,
      memberships: [{ id: 'campaign-a' }],
      hasRefereeAccess: false
    }),
    { state: 'inactive' }
  );
});

test('returns denied when the player lacks access to an invite-only campaign', () => {
  assert.deepEqual(
    resolveJoinOutcome({
      campaignLoaded: true,
      currentCampaign: { id: 'campaign-a', isInviteOnly: true },
      currentPlayerName: 'Alex',
      editingPlayerName: false,
      memberships: [{ id: 'campaign-b' }],
      hasRefereeAccess: false
    }),
    {
      state: 'denied',
      message: 'You do not have access to the active campaign on this server. Contact the server admin or campaign referee for access.'
    }
  );
});

test('returns the referee page when access exists and referee access is granted', () => {
  assert.deepEqual(
    resolveJoinOutcome({
      campaignLoaded: true,
      currentCampaign: { id: 'campaign-a' },
      currentPlayerName: 'Alex',
      editingPlayerName: false,
      memberships: [{ id: 'campaign-a' }],
      hasRefereeAccess: true
    }),
    {
      state: 'forwarded',
      destination: '/referee.html'
    }
  );
});

test('returns the referee page when referee access exists without campaign membership', () => {
  assert.deepEqual(
    resolveJoinOutcome({
      campaignLoaded: true,
      currentCampaign: { id: 'campaign-a' },
      currentPlayerName: 'Alex',
      editingPlayerName: false,
      memberships: [{ id: 'campaign-b' }],
      hasRefereeAccess: true
    }),
    {
      state: 'forwarded',
      destination: '/referee.html'
    }
  );
});

test('returns the player page when access exists and referee access is absent', () => {
  assert.deepEqual(
    resolveJoinOutcome({
      campaignLoaded: true,
      currentCampaign: { id: 'campaign-a', isInviteOnly: true },
      currentPlayerName: 'Alex',
      editingPlayerName: false,
      memberships: [{ id: 'campaign-a' }],
      hasRefereeAccess: false
    }),
    {
      state: 'forwarded',
      destination: '/player.html'
    }
  );
});

test('returns the player page for open campaigns even without membership', () => {
  assert.deepEqual(
    resolveJoinOutcome({
      campaignLoaded: true,
      currentCampaign: { id: 'campaign-a', isInviteOnly: false },
      currentPlayerName: 'Alex',
      editingPlayerName: false,
      memberships: [],
      hasRefereeAccess: false
    }),
    {
      state: 'forwarded',
      destination: '/player.html'
    }
  );
});
