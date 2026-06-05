(function () {
  const APP_NAME = 'Roll4Initiative';
  const APP_ICON_URL = '/favicon-512.png';
  const QR_CODE_SIZE = 96;
  let confirmDialogState = null;
  let confirmDialogResolve = null;
  let confirmDialogLastFocus = null;

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

  function appendOverflowMenuSeparator(menuEl) {
    if (!menuEl) return null;
    const separator = document.createElement('div');
    separator.className = 'character-overflow-separator';
    separator.setAttribute('role', 'separator');
    separator.setAttribute('aria-hidden', 'true');
    menuEl.appendChild(separator);
    return separator;
  }

  function closeConfirmDialog(result) {
    if (!confirmDialogState) return;
    const resolve = confirmDialogResolve;
    confirmDialogResolve = null;
    confirmDialogState.modal.classList.add('hidden');
    confirmDialogState.modal.setAttribute('aria-hidden', 'true');
    if (resolve) {
      resolve(result);
    }
    if (confirmDialogLastFocus && typeof confirmDialogLastFocus.focus === 'function') {
      try {
        confirmDialogLastFocus.focus();
      } catch (err) {
        // Ignore focus restoration failures.
      }
    }
    confirmDialogLastFocus = null;
  }

  function ensureConfirmDialog() {
    if (confirmDialogState) return confirmDialogState;
    if (!document.body) return null;
    const modal = document.createElement('div');
    modal.id = 'shared-confirm-modal';
    modal.className = 'conditions-modal hidden';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="conditions-dialog confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="shared-confirm-title" aria-describedby="shared-confirm-message">
        <div class="conditions-dialog-header confirm-dialog-header">
          <div class="confirm-dialog-copy">
            <h2 id="shared-confirm-title"></h2>
            <div id="shared-confirm-header" class="subtitle confirm-dialog-header-text hidden"></div>
          </div>
          <div class="conditions-dialog-actions">
            <button type="button" id="shared-confirm-cancel" class="secondary">Cancel</button>
            <button type="button" id="shared-confirm-confirm">OK</button>
          </div>
        </div>
        <div id="shared-confirm-message" class="confirm-dialog-message hidden"></div>
      </div>
    `;
    document.body.appendChild(modal);
    const dialog = modal.querySelector('.conditions-dialog');
    const title = modal.querySelector('#shared-confirm-title');
    const header = modal.querySelector('#shared-confirm-header');
    const message = modal.querySelector('#shared-confirm-message');
    const cancelButton = modal.querySelector('#shared-confirm-cancel');
    const confirmButton = modal.querySelector('#shared-confirm-confirm');

    const state = {
      modal,
      dialog,
      title,
      header,
      message,
      cancelButton,
      confirmButton
    };

    modal.addEventListener('click', (event) => {
      event.stopPropagation();
      if (event.target === modal) {
        closeConfirmDialog(false);
      }
    });
    dialog.addEventListener('click', (event) => {
      event.stopPropagation();
    });
    dialog.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Escape') {
        event.preventDefault();
        closeConfirmDialog(false);
      }
    });
    cancelButton.addEventListener('click', () => {
      closeConfirmDialog(false);
    });
    confirmButton.addEventListener('click', () => {
      closeConfirmDialog(true);
    });

    confirmDialogState = state;
    return state;
  }

  function showConfirmDialog(options = {}) {
    const state = ensureConfirmDialog();
    const {
      title = 'Confirm',
      header = '',
      message = '',
      confirmLabel = 'OK',
      cancelLabel = 'Cancel',
      confirmButtonClass = '',
      initialFocus = 'cancel'
    } = options;

    if (!state) {
      const fallbackText = message || header || title;
      return Promise.resolve(window.confirm(fallbackText));
    }

    if (confirmDialogResolve) {
      closeConfirmDialog(false);
    }

    state.title.textContent = title;
    state.header.textContent = header;
    state.header.classList.toggle('hidden', !header);
    state.message.textContent = message;
    state.message.classList.toggle('hidden', !message);
    state.confirmButton.textContent = confirmLabel;
    state.cancelButton.textContent = cancelLabel;
    state.confirmButton.classList.toggle('danger', confirmButtonClass === 'danger');
    state.modal.classList.remove('hidden');
    state.modal.setAttribute('aria-hidden', 'false');

    return new Promise((resolve) => {
      confirmDialogResolve = resolve;
      confirmDialogLastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      window.requestAnimationFrame(() => {
        const focusTarget = initialFocus === 'confirm' ? state.confirmButton : state.cancelButton;
        if (focusTarget) {
          focusTarget.focus();
        }
      });
    });
  }

  window.PlayerTrackerShared = {
    APP_NAME,
    APP_ICON_URL,
    QR_CODE_SIZE,
    isAdminHost,
    parseStandardDie,
    rollStandardDie,
    formatInitiative,
    updateCampaignHeader,
    appendOverflowMenuSeparator,
    showConfirmDialog
  };
})();
