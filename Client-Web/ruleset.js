(function () {
  const DEFAULT_ICON_SIZE = 67;

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
      // Health/state refreshes reload the campaign metadata frequently. Do not
      // reassign the same image source, since Safari may re-request it and
      // briefly relayout the sticky campaign header.
      if (rulesetIcon.getAttribute('src') !== resolvedIcon && rulesetIcon.src !== resolvedIcon) {
        rulesetIcon.src = resolvedIcon;
      }
      rulesetIcon.alt = labelText ? `${labelText} icon` : 'Ruleset icon';
      rulesetIcon.style.display = 'block';
      rulesetIcon.style.width = `${DEFAULT_ICON_SIZE}px`;
      rulesetIcon.style.height = `${DEFAULT_ICON_SIZE}px`;
    } else {
      if (rulesetIcon.hasAttribute('src')) {
        rulesetIcon.removeAttribute('src');
      }
      rulesetIcon.alt = '';
      rulesetIcon.style.display = 'none';
    }
  }

  function updateRulesetIcons(targets, iconUrl, labelText) {
    (targets || []).forEach((target) => updateRulesetIcon(target, iconUrl, labelText));
  }

  function setRulesetLinkTarget(linkEl, labelText, baseUrl) {
    if (!linkEl) return;
    const resolvedLabel = labelText || '';
    if (linkEl.textContent !== resolvedLabel) linkEl.textContent = resolvedLabel;
    if (baseUrl) {
      if (linkEl.getAttribute('href') !== baseUrl) linkEl.setAttribute('href', baseUrl);
      if (linkEl.hasAttribute('aria-disabled')) linkEl.removeAttribute('aria-disabled');
    } else {
      if (linkEl.hasAttribute('href')) linkEl.removeAttribute('href');
      if (linkEl.getAttribute('aria-disabled') !== 'true') linkEl.setAttribute('aria-disabled', 'true');
    }
  }

  function updateRulesetLinks(targets, labelText, baseUrl) {
    (targets || []).forEach((target) => setRulesetLinkTarget(target, labelText, baseUrl));
  }

  function setRulesetLicenseTarget(linkEl, wrapEl, licenseUrl) {
    if (!linkEl || !wrapEl) return;
    if (licenseUrl) {
      if (linkEl.getAttribute('href') !== licenseUrl) linkEl.setAttribute('href', licenseUrl);
      if (wrapEl.style.display !== 'inline') wrapEl.style.display = 'inline';
    } else {
      if (linkEl.hasAttribute('href')) linkEl.removeAttribute('href');
      if (wrapEl.style.display !== 'none') wrapEl.style.display = 'none';
    }
  }

  function updateRulesetLicenses(targets, licenseUrl) {
    (targets || []).forEach((target) => {
      if (!target) return;
      setRulesetLicenseTarget(target.linkEl, target.wrapEl, licenseUrl);
    });
  }

  window.PlayerTrackerRuleset = {
    updateRulesetIcon,
    updateRulesetIcons,
    setRulesetLinkTarget,
    updateRulesetLinks,
    setRulesetLicenseTarget,
    updateRulesetLicenses
  };
})();
