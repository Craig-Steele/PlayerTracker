(function () {
  const QR_CODE_SIZE = 96;

  function resolveIconUrl(iconUrl) {
    if (!iconUrl) return null;
    if (
      iconUrl.startsWith('http://') ||
      iconUrl.startsWith('https://') ||
      iconUrl.startsWith('/')
    ) {
      return iconUrl;
    }
    return `/rulesets/${iconUrl}`;
  }

  function updateRulesetIcon(rulesetIcon, iconUrl, labelText) {
    if (!rulesetIcon) return;
    const resolvedIcon = resolveIconUrl(iconUrl);
    if (resolvedIcon) {
      rulesetIcon.src = resolvedIcon;
      rulesetIcon.alt = labelText ? `${labelText} icon` : 'Ruleset icon';
      rulesetIcon.style.display = 'block';
      rulesetIcon.style.width = `${QR_CODE_SIZE}px`;
      rulesetIcon.style.height = `${QR_CODE_SIZE}px`;
    } else {
      rulesetIcon.removeAttribute('src');
      rulesetIcon.alt = '';
      rulesetIcon.style.display = 'none';
    }
  }

  window.PlayerTrackerShared = {
    QR_CODE_SIZE,
    updateRulesetIcon
  };
})();
