(function () {
  const DEFAULT_CLAIM_TIMEOUT_MINUTES = 5;

  function normalizeCampaignName(value) {
    return (value || '').trim();
  }

  function normalizeClaimTimeoutMinutes(value) {
    const parsed = Number.parseInt(String(value || '').trim(), 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return null;
    }
    return parsed;
  }

  function claimTimeoutLabel(minutes, defaultMinutes = DEFAULT_CLAIM_TIMEOUT_MINUTES) {
    if (!Number.isInteger(minutes)) {
      return `${defaultMinutes}m claim timeout`;
    }
    if (minutes < 0) return 'Explicit release only';
    if (minutes === 0) return 'Release immediately on disconnect';
    return `${minutes}m claim timeout`;
  }

  function formatAccessLabel(isInviteOnly) {
    return isInviteOnly ? 'Invite only' : 'Open join';
  }

  function readClaimTimeoutMode(manualInput) {
    return manualInput?.checked ? 'manual' : 'timed';
  }

  function readClaimTimeoutMinutes(manualInput, input, defaultMinutes = DEFAULT_CLAIM_TIMEOUT_MINUTES) {
    return readClaimTimeoutMode(manualInput) === 'manual'
      ? -1
      : (normalizeClaimTimeoutMinutes(input?.value) ?? defaultMinutes);
  }

  function syncClaimTimeoutUi(manualInput, input) {
    const manual = readClaimTimeoutMode(manualInput) === 'manual';
    if (input) {
      input.disabled = manual;
      input.classList.toggle('hidden', manual);
    }
    return manual;
  }

  function populateRulesetSelect(selectEl, rulesets, options = {}) {
    if (!selectEl) return;
    const {
      currentRulesetId = '',
      emptyValue = 'none',
      emptyLabel = 'No Conditions',
      createOption = () => document.createElement('option')
    } = options;
    selectEl.innerHTML = '';
    if (Array.isArray(rulesets) && rulesets.length > 0) {
      rulesets.forEach((ruleset) => {
        const option = createOption();
        option.value = ruleset.id;
        option.textContent = ruleset.label || ruleset.id;
        selectEl.appendChild(option);
      });
      return;
    }
    const option = createOption();
    option.value = currentRulesetId || emptyValue;
    option.textContent = currentRulesetId || emptyLabel;
    selectEl.appendChild(option);
  }

  const api = {
    DEFAULT_CLAIM_TIMEOUT_MINUTES,
    normalizeCampaignName,
    normalizeClaimTimeoutMinutes,
    claimTimeoutLabel,
    formatAccessLabel,
    readClaimTimeoutMode,
    readClaimTimeoutMinutes,
    syncClaimTimeoutUi,
    populateRulesetSelect
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (typeof window !== 'undefined') {
    window.PlayerTrackerCampaignSettings = api;
  }
})();
