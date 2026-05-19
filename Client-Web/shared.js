(function () {
  const APP_NAME = 'Roll4Initiative';
  const APP_ICON_URL = '/favicon-512.png';
  const QR_CODE_SIZE = 96;

  function toArray(targets) {
    if (!targets) return [];
    return Array.isArray(targets) ? targets : [targets];
  }

  function isAdminHost() {
    const host = window.location.hostname;
    return host === 'localhost' || host === '127.0.0.1';
  }

  function parseStandardDie(spec) {
    if (typeof spec !== 'string') return null;
    const match = spec.trim().match(/^(\d+)d(\d+)$/i);
    if (!match) return null;
    const count = Number(match[1]);
    const sides = Number(match[2]);
    if (!Number.isInteger(count) || !Number.isInteger(sides) || count <= 0 || sides <= 0) {
      return null;
    }
    return { count, sides };
  }

  function rollStandardDie(spec, bonus) {
    const parsed = parseStandardDie(spec);
    if (!parsed) return null;
    let total = 0;
    for (let index = 0; index < parsed.count; index += 1) {
      total += Math.floor(Math.random() * parsed.sides) + 1;
    }
    return total + (Number.isFinite(bonus) ? bonus : 0);
  }

  function formatInitiative(value) {
    if (!Number.isFinite(value)) return 'X';
    return Number.isInteger(value) ? String(value) : String(value);
  }

  function updateCampaignHeader(targets = {}, state = {}) {
    const {
      nameTargets,
      iconTargets,
      linkTargets,
      licenseTargets
    } = targets;
    const {
      campaignName,
      rulesetLabel,
      rulesBaseUrl,
      licenseUrl,
      iconUrl,
      fallbackName = APP_NAME,
      fallbackIconUrl = APP_ICON_URL
    } = state;

    const hasCampaignName = Boolean(typeof campaignName === 'string' && campaignName.trim());
    const displayName = hasCampaignName ? campaignName.trim() : fallbackName;
    toArray(nameTargets).forEach((target) => {
      if (target) target.textContent = displayName;
    });

    if (linkTargets) {
      const resolvedLabel = hasCampaignName ? (rulesetLabel || '') : '';
      const resolvedBaseUrl = hasCampaignName ? (rulesBaseUrl ?? null) : null;
      window.PlayerTrackerRuleset?.updateRulesetLinks(toArray(linkTargets), resolvedLabel, resolvedBaseUrl);
    }

    if (licenseTargets) {
      const resolvedLicenseUrl = hasCampaignName ? (licenseUrl ?? null) : null;
      window.PlayerTrackerRuleset?.updateRulesetLicenses(toArray(licenseTargets), resolvedLicenseUrl);
    }

    if (iconTargets) {
      const resolvedIconUrl = hasCampaignName
        ? iconUrl
        : fallbackIconUrl;
      if (resolvedIconUrl !== undefined) {
        const resolvedLabel = hasCampaignName ? (rulesetLabel || displayName) : fallbackName;
        window.PlayerTrackerRuleset?.updateRulesetIcons(toArray(iconTargets), resolvedIconUrl, resolvedLabel);
      }
    }

    return { hasCampaignName, displayName };
  }

  window.PlayerTrackerShared = {
    APP_NAME,
    APP_ICON_URL,
    QR_CODE_SIZE,
    isAdminHost,
    parseStandardDie,
    rollStandardDie,
    formatInitiative,
    updateCampaignHeader
  };
})();
