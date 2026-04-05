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

  window.PlayerTrackerShared = {
    QR_CODE_SIZE,
    updateRulesetIcon,
    parseStandardDie,
    rollStandardDie
  };
})();
