const assert = require('node:assert/strict');
const test = require('node:test');

const {
  DEFAULT_CLAIM_TIMEOUT_MINUTES,
  normalizeCampaignName,
  normalizeClaimTimeoutMinutes,
  claimTimeoutLabel,
  formatAccessLabel,
  readClaimTimeoutMode,
  readClaimTimeoutMinutes,
  syncClaimTimeoutUi,
  populateRulesetSelect
} = require('./campaign-settings.js');

test('normalizes shared campaign fields', () => {
  assert.equal(normalizeCampaignName('  Hellbound  '), 'Hellbound');
  assert.equal(normalizeClaimTimeoutMinutes(' 12 '), 12);
  assert.equal(normalizeClaimTimeoutMinutes('-1'), null);
  assert.equal(DEFAULT_CLAIM_TIMEOUT_MINUTES, 5);
});

test('formats shared campaign labels', () => {
  assert.equal(claimTimeoutLabel(-1), 'Explicit release only');
  assert.equal(claimTimeoutLabel(0), 'Release immediately on disconnect');
  assert.equal(claimTimeoutLabel(12), '12m claim timeout');
  assert.equal(formatAccessLabel(true), 'Invite only');
  assert.equal(formatAccessLabel(false), 'Open join');
});

test('reads and syncs claim timeout controls', () => {
  const manualInput = { checked: true };
  const manualTarget = { disabled: false, classList: { toggle() {} } };
  assert.equal(readClaimTimeoutMode(manualInput), 'manual');
  assert.equal(readClaimTimeoutMinutes(manualInput, manualTarget), -1);
  assert.equal(syncClaimTimeoutUi(manualInput, manualTarget), true);
  assert.equal(manualTarget.disabled, true);

  const timedInput = { checked: false };
  const timedTarget = { value: '13', disabled: true, classList: { toggle() {} } };
  assert.equal(readClaimTimeoutMode(timedInput), 'timed');
  assert.equal(readClaimTimeoutMinutes(timedInput, timedTarget), 13);
  assert.equal(syncClaimTimeoutUi(timedInput, timedTarget), false);
  assert.equal(timedTarget.disabled, false);
});

test('populates ruleset selects with shared fallback behavior', () => {
  const options = [];
  const select = {
    innerHTML: 'previous',
    appendChild(node) {
      options.push(node);
    }
  };

  populateRulesetSelect(
    select,
    [
      { id: 'pf1', label: 'Pathfinder 1e' },
      { id: 'pf2', label: '' }
    ],
    {
      createOption: () => ({ value: '', textContent: '' })
    }
  );

  assert.equal(select.innerHTML, '');
  assert.deepEqual(options, [
    { value: 'pf1', textContent: 'Pathfinder 1e' },
    { value: 'pf2', textContent: 'pf2' }
  ]);

  const emptyOptions = [];
  populateRulesetSelect(
    { innerHTML: '', appendChild(node) { emptyOptions.push(node); } },
    [],
    {
      currentRulesetId: 'pf1',
      createOption: () => ({ value: '', textContent: '' })
    }
  );
  assert.deepEqual(emptyOptions, [{ value: 'pf1', textContent: 'pf1' }]);
});
