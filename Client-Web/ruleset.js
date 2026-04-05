(function () {
  const DEFAULT_ICON_SIZE = 96;

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
      rulesetIcon.style.width = `${DEFAULT_ICON_SIZE}px`;
      rulesetIcon.style.height = `${DEFAULT_ICON_SIZE}px`;
    } else {
      rulesetIcon.removeAttribute('src');
      rulesetIcon.alt = '';
      rulesetIcon.style.display = 'none';
    }
  }

  function updateRulesetIcons(targets, iconUrl, labelText) {
    (targets || []).forEach((target) => updateRulesetIcon(target, iconUrl, labelText));
  }

  function setRulesetLinkTarget(linkEl, labelText, baseUrl) {
    if (!linkEl) return;
    linkEl.textContent = labelText || '';
    if (baseUrl) {
      linkEl.href = baseUrl;
      linkEl.removeAttribute('aria-disabled');
    } else {
      linkEl.removeAttribute('href');
      linkEl.setAttribute('aria-disabled', 'true');
    }
  }

  function updateRulesetLinks(targets, labelText, baseUrl) {
    (targets || []).forEach((target) => setRulesetLinkTarget(target, labelText, baseUrl));
  }

  function setRulesetLicenseTarget(linkEl, wrapEl, licenseUrl) {
    if (!linkEl || !wrapEl) return;
    if (licenseUrl) {
      linkEl.href = licenseUrl;
      wrapEl.style.display = 'inline';
    } else {
      linkEl.removeAttribute('href');
      wrapEl.style.display = 'none';
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
