(function () {
  const APP_NAME = 'Tactical Table Top: Initiative';
  const APP_ICON_URL = '/favicon-512.png';
  const QR_CODE_SIZE = 96;
  let confirmDialogState = null;
  let confirmDialogResolve = null;
  let confirmDialogLastFocus = null;
  let choiceDialogState = null;
  let choiceDialogResolve = null;
  let choiceDialogLastFocus = null;

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
    if (!Number.isFinite(value)) return '🎲';
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

  function closeChoiceDialog(result) {
    if (!choiceDialogState) return;
    const resolve = choiceDialogResolve;
    choiceDialogResolve = null;
    choiceDialogState.modal.classList.add('hidden');
    choiceDialogState.modal.setAttribute('aria-hidden', 'true');
    if (resolve) {
      resolve(result);
    }
    if (choiceDialogLastFocus && typeof choiceDialogLastFocus.focus === 'function') {
      try {
        choiceDialogLastFocus.focus();
      } catch (err) {
        // Ignore focus restoration failures.
      }
    }
    choiceDialogLastFocus = null;
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

  function ensureChoiceDialog() {
    if (choiceDialogState) return choiceDialogState;
    if (!document.body) return null;
    const modal = document.createElement('div');
    modal.id = 'shared-choice-modal';
    modal.className = 'conditions-modal hidden';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="conditions-dialog confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="shared-choice-title" aria-describedby="shared-choice-message">
        <div class="conditions-dialog-header confirm-dialog-header">
          <div class="confirm-dialog-copy">
            <h2 id="shared-choice-title"></h2>
            <div id="shared-choice-header" class="subtitle confirm-dialog-header-text hidden"></div>
          </div>
          <div class="conditions-dialog-actions choice-dialog-actions">
            <button type="button" id="shared-choice-option-1" class="secondary"></button>
            <button type="button" id="shared-choice-option-2" class="secondary"></button>
            <button type="button" id="shared-choice-option-3"></button>
          </div>
        </div>
        <div id="shared-choice-message" class="confirm-dialog-message hidden"></div>
      </div>
    `;
    document.body.appendChild(modal);
    const dialog = modal.querySelector('.conditions-dialog');
    const title = modal.querySelector('#shared-choice-title');
    const header = modal.querySelector('#shared-choice-header');
    const message = modal.querySelector('#shared-choice-message');
    const option1 = modal.querySelector('#shared-choice-option-1');
    const option2 = modal.querySelector('#shared-choice-option-2');
    const option3 = modal.querySelector('#shared-choice-option-3');

    const state = {
      modal,
      dialog,
      title,
      header,
      message,
      option1,
      option2,
      option3,
      dismissValue: null
    };

    modal.addEventListener('click', (event) => {
      event.stopPropagation();
      if (event.target === modal) {
        closeChoiceDialog(state.dismissValue);
      }
    });
    dialog.addEventListener('click', (event) => {
      event.stopPropagation();
    });
    dialog.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Escape') {
        event.preventDefault();
        closeChoiceDialog(state.dismissValue);
      }
    });
    option1.addEventListener('click', () => closeChoiceDialog(option1.dataset.choiceValue || null));
    option2.addEventListener('click', () => closeChoiceDialog(option2.dataset.choiceValue || null));
    option3.addEventListener('click', () => closeChoiceDialog(option3.dataset.choiceValue || null));

    choiceDialogState = state;
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

  function showChoiceDialog(options = {}) {
    const state = ensureChoiceDialog();
    const {
      title = 'Choose',
      header = '',
      message = '',
      option1Label = 'Option 1',
      option2Label = 'Option 2',
      option3Label = 'Option 3',
      option1Value = 'option-1',
      option2Value = 'option-2',
      option3Value = 'option-3',
      option1ButtonClass = 'secondary',
      option2ButtonClass = 'secondary',
      option3ButtonClass = 'danger',
      initialFocus = 'option1',
      dismissValue = null
    } = options;

    if (!state) {
      return Promise.resolve(dismissValue);
    }

    if (choiceDialogResolve) {
      closeChoiceDialog(dismissValue);
    }

    state.title.textContent = title;
    state.header.textContent = header;
    state.header.classList.toggle('hidden', !header);
    state.message.textContent = message;
    state.message.classList.toggle('hidden', !message);
    state.option1.textContent = option1Label;
    state.option2.textContent = option2Label;
    state.option3.textContent = option3Label;
    state.option1.className = option1ButtonClass || 'secondary';
    state.option2.className = option2ButtonClass || 'secondary';
    state.option3.className = option3ButtonClass || 'danger';
    state.option1.dataset.choiceValue = option1Value;
    state.option2.dataset.choiceValue = option2Value;
    state.option3.dataset.choiceValue = option3Value;
    state.dismissValue = dismissValue;
    state.modal.classList.remove('hidden');
    state.modal.setAttribute('aria-hidden', 'false');

    return new Promise((resolve) => {
      choiceDialogResolve = resolve;
      choiceDialogLastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      window.requestAnimationFrame(() => {
        const focusTarget =
          initialFocus === 'option2' ? state.option2 : initialFocus === 'option3' ? state.option3 : state.option1;
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
    showConfirmDialog,
    showChoiceDialog
  };
})();
