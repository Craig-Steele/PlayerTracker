(function () {
  const {
    APP_NAME,
    APP_ICON_URL,
    showConfirmDialog,
    updateCampaignHeader
  } = window.PlayerTrackerShared || {
    APP_NAME: 'Tactical Table Top: Initiative',
    APP_ICON_URL: '/favicon-512.png',
    showConfirmDialog: async () => true,
    updateCampaignHeader: () => {}
  };
  const {
    DEFAULT_CLAIM_TIMEOUT_MINUTES,
    claimTimeoutLabel: sharedClaimTimeoutLabel,
    normalizeCampaignName: sharedNormalizeCampaignName,
    normalizeCampaignSettingsSource,
    populateRulesetSelect: sharedPopulateRulesetSelect,
    readClaimTimeoutMode: sharedReadClaimTimeoutMode,
    readClaimTimeoutMinutes: sharedReadClaimTimeoutMinutes,
    syncClaimTimeoutUi: sharedSyncClaimTimeoutUi
  } = window.PlayerTrackerCampaignSettings || {
    DEFAULT_CLAIM_TIMEOUT_MINUTES: 5,
    claimTimeoutLabel: (minutes, defaultMinutes = 5) => {
      if (!Number.isInteger(minutes)) return `${defaultMinutes}m claim timeout`;
      if (minutes < 0) return 'Explicit release only';
      if (minutes === 0) return 'Release immediately on disconnect';
      return `${minutes}m claim timeout`;
    },
    normalizeCampaignName: (value) => (value || '').trim(),
    normalizeCampaignSettingsSource: (value) => (value === 'admin' ? 'admin' : 'referee'),
    populateRulesetSelect: (selectEl, rulesets, options = {}) => {
      if (!selectEl) return;
      const {
        currentRulesetId = '',
        emptyValue = 'none',
        emptyLabel = 'No Conditions'
      } = options;
      selectEl.innerHTML = '';
      if (Array.isArray(rulesets) && rulesets.length > 0) {
        rulesets.forEach((ruleset) => {
          const option = document.createElement('option');
          option.value = ruleset.id;
          option.textContent = ruleset.label || ruleset.id;
          selectEl.appendChild(option);
        });
        return;
      }
      const option = document.createElement('option');
      option.value = currentRulesetId || emptyValue;
      option.textContent = currentRulesetId || emptyLabel;
      selectEl.appendChild(option);
    },
    readClaimTimeoutMode: (manualInput) => (manualInput?.checked ? 'manual' : 'timed'),
    readClaimTimeoutMinutes: (manualInput, input, defaultMinutes = 5) => (
      manualInput?.checked
        ? -1
        : ((Number.isFinite(Number.parseInt(String(input?.value || '').trim(), 10)) &&
          Number.parseInt(String(input?.value || '').trim(), 10) >= 0)
          ? Number.parseInt(String(input?.value || '').trim(), 10)
          : defaultMinutes)
    ),
    syncClaimTimeoutUi: (manualInput, input) => {
      const manual = Boolean(manualInput?.checked);
      if (input) {
        input.disabled = manual;
        input.classList.toggle('hidden', manual);
      }
      return manual;
    }
  };

  function fetchJson(path, options = {}) {
    return fetch(path, {
      credentials: 'same-origin',
      ...options
    }).then(async (res) => {
      if (res.status === 401 || res.status === 403) {
        window.location.replace('/index.html');
        return null;
      }
      if (!res.ok) {
        const message = await res.text().catch(() => '');
        throw new Error(message || `Server returned ${res.status}`);
      }
      if (res.status === 204) return null;
      return res.json();
    });
  }

  window.addEventListener('DOMContentLoaded', () => {
    document.title = `${APP_NAME} - Campaign Settings`;

    const titleEl = document.getElementById('campaign-settings-title');
    const iconEl = document.getElementById('campaign-settings-icon');
    const rulesetLinkEl = document.getElementById('campaign-settings-ruleset-link');
    const rulesetLicenseEl = document.getElementById('campaign-settings-ruleset-license');
    const rulesetLicenseWrapEl = document.getElementById('campaign-settings-ruleset-license-wrap');
    const statusEl = document.getElementById('campaign-settings-status');
    const cancelBtn = document.getElementById('campaign-settings-cancel');
    const saveBtn = document.getElementById('campaign-settings-save');
    const campaignNameInput = document.getElementById('campaign-settings-name-input');
    const campaignRulesetSelect = document.getElementById('campaign-settings-ruleset-select');
    const campaignRulesetLockNote = document.getElementById('campaign-settings-ruleset-lock-note');
    const campaignClaimTimeoutManualInput = document.getElementById('campaign-settings-claim-timeout-manual');
    const campaignClaimTimeoutTimedInput = document.getElementById('campaign-settings-claim-timeout-timed');
    const campaignClaimTimeoutInput = document.getElementById('campaign-settings-claim-timeout-input');
    const campaignInviteOnlyInput = document.getElementById('campaign-settings-invite-only');
    const campaignOpenJoinInput = document.getElementById('campaign-settings-open-join');
    const campaignMembersList = document.getElementById('campaign-settings-members');
    const campaignInvitePlayerNameInput = document.getElementById('campaign-settings-invite-player-name');
    const campaignInvitePlayerButton = document.getElementById('campaign-settings-invite-player-button');

    const params = new URLSearchParams(window.location.search);
    const campaignId = params.get('campaignId') || '';
    const isCreateMode = params.get('mode') === 'new';
    const campaignSource = normalizeCampaignSettingsSource(params.get('source'));
    const backHref = campaignSource === 'admin' ? 'admin.html' : 'referee.html';
    let availableRulesets = [];
    let campaignSummaries = [];
    let currentCampaign = null;
    let currentCampaignName = '';
    let currentRulesetId = '';
    let currentCampaignClaimTimeoutMinutes = DEFAULT_CLAIM_TIMEOUT_MINUTES;
    let currentCampaignInviteOnly = false;
    let currentRefereeSessionIds = new Set();
    let selectedRefereeSessionIds = new Set();
    let campaignMembers = [];
    let campaignMembersLoaded = false;

    function setStatus(message, isError = false) {
      if (!statusEl) return;
      statusEl.textContent = message;
      statusEl.style.color = isError ? '#b00020' : '';
    }

    function normalizeName(name) {
      return sharedNormalizeCampaignName(name);
    }

    function claimTimeoutLabel(minutes) {
      return sharedClaimTimeoutLabel(minutes, DEFAULT_CLAIM_TIMEOUT_MINUTES);
    }

    function getClaimTimeoutMode() {
      return sharedReadClaimTimeoutMode(campaignClaimTimeoutManualInput);
    }

    function getClaimTimeoutMinutes() {
      return sharedReadClaimTimeoutMinutes(
        campaignClaimTimeoutManualInput,
        campaignClaimTimeoutInput,
        DEFAULT_CLAIM_TIMEOUT_MINUTES
      );
    }

    function syncClaimTimeoutUi() {
      return sharedSyncClaimTimeoutUi(campaignClaimTimeoutManualInput, campaignClaimTimeoutInput);
    }

    function isInviteOnlySelected() {
      return Boolean(campaignInviteOnlyInput?.checked);
    }

    function setHeader(campaign) {
      const headerName = campaign?.name || (isCreateMode ? 'New Campaign' : 'Campaign Settings');
      updateCampaignHeader(
        {
          nameTargets: [titleEl],
          iconTargets: [iconEl],
          linkTargets: [rulesetLinkEl],
          licenseTargets: [{ linkEl: rulesetLicenseEl, wrapEl: rulesetLicenseWrapEl }]
        },
        {
          campaignName: headerName,
          rulesetLabel: campaign?.rulesetLabel || campaign?.rulesetId || '',
          rulesBaseUrl: null,
          licenseUrl: null,
          iconUrl: APP_ICON_URL,
          fallbackName: headerName
        }
      );
      if (cancelBtn) {
        cancelBtn.textContent = 'Back';
      }
    }

    function populateRulesetSelect() {
      sharedPopulateRulesetSelect(campaignRulesetSelect, availableRulesets, {
        currentRulesetId,
        emptyValue: 'none',
        emptyLabel: currentRulesetId || 'No Conditions'
      });
      if (campaignRulesetSelect) {
        campaignRulesetSelect.disabled = Boolean(currentCampaign);
      }
      if (campaignRulesetLockNote) {
        campaignRulesetLockNote.textContent = 'Locked after save';
        campaignRulesetLockNote.classList.toggle('hidden', !currentCampaign);
      }
    }

    function setPlayerManagementEnabled(enabled) {
      const canInteract = Boolean(enabled);
      if (campaignInvitePlayerNameInput) {
        campaignInvitePlayerNameInput.disabled = !canInteract;
      }
      if (campaignInvitePlayerButton) {
        campaignInvitePlayerButton.disabled = !canInteract || !normalizeName(campaignInvitePlayerNameInput?.value);
      }
      if (campaignMembersList) {
        campaignMembersList.querySelectorAll('input[type="checkbox"]').forEach((input) => {
          input.disabled = !canInteract;
        });
        campaignMembersList.querySelectorAll('button.campaign-settings-remove-player-button').forEach((button) => {
          button.disabled = !canInteract;
        });
      }
    }

    async function removeCampaignMember(member) {
      if (!currentCampaign) {
        setStatus('Save the campaign first before removing players.', true);
        return;
      }
      const memberName = member?.displayName || 'this player';
      const confirmed = await showConfirmDialog({
        title: 'Remove player?',
        message: `Remove ${memberName} from this campaign?`,
        confirmLabel: 'Remove',
        cancelLabel: 'Cancel',
        confirmButtonClass: 'danger',
        initialFocus: 'cancel'
      });
      if (!confirmed) return;

      setStatus(`Removing ${memberName}...`);
      try {
        await fetchJson(
          `/campaigns/${encodeURIComponent(currentCampaign.id)}/members/${encodeURIComponent(member.membershipId || member.id)}`,
          { method: 'DELETE' }
        );
        setStatus(`Removed ${memberName} from the campaign.`);
        await loadCampaignMembers();
        updateSaveState();
      } catch (err) {
        setStatus(`Failed to remove player: ${err.message}`, true);
      }
    }

    function renderCampaignMembers() {
      if (!campaignMembersList) return;
      campaignMembersList.innerHTML = '';

      if (!currentCampaign) {
        setPlayerManagementEnabled(false);
        return;
      }

      if (!campaignMembersLoaded) {
        const empty = document.createElement('div');
        empty.className = 'subtitle';
        empty.textContent = 'Loading current users...';
        campaignMembersList.appendChild(empty);
        setPlayerManagementEnabled(false);
        return;
      }

      if (!campaignMembers.length) {
        const empty = document.createElement('div');
        empty.className = 'subtitle';
        empty.textContent = 'No current users in this campaign.';
        campaignMembersList.appendChild(empty);
        return;
      }

      campaignMembers.forEach((member) => {
        const row = document.createElement('div');
        row.className = 'campaign-settings-member-row';

        const toggle = document.createElement('label');
        toggle.className = 'property-toggle-control admin-campaign-member-row campaign-settings-member-toggle';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = selectedRefereeSessionIds.has(member.id);
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) {
            selectedRefereeSessionIds.add(member.id);
          } else {
            selectedRefereeSessionIds.delete(member.id);
          }
          updateSaveState();
        });

        const textWrap = document.createElement('span');
        textWrap.className = 'admin-campaign-member-text';

        const name = document.createElement('span');
        name.className = 'admin-campaign-member-name';
        name.textContent = member.displayName;
        textWrap.appendChild(name);

        if (member.isReferee) {
          const badge = document.createElement('span');
          badge.className = 'admin-campaign-member-badge';
          badge.textContent = 'Referee';
          textWrap.appendChild(badge);
        }

        toggle.appendChild(checkbox);
        toggle.appendChild(textWrap);

        const actions = document.createElement('div');
        actions.className = 'campaign-settings-member-actions';

        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'secondary danger campaign-settings-remove-player-button';
        removeButton.textContent = 'Remove';
        removeButton.addEventListener('click', () => {
          void removeCampaignMember(member);
        });

        actions.appendChild(removeButton);
        row.appendChild(toggle);
        row.appendChild(actions);
        campaignMembersList.appendChild(row);
      });

      setPlayerManagementEnabled(true);
    }

    async function loadCampaignMembers() {
      if (!campaignId) {
        campaignMembers = [];
        currentRefereeSessionIds = new Set();
        selectedRefereeSessionIds = new Set();
        campaignMembersLoaded = true;
        renderCampaignMembers();
        return;
      }
      campaignMembersLoaded = false;
      renderCampaignMembers();
      try {
        const members = await fetchJson(`/campaigns/${encodeURIComponent(campaignId)}/members`);
        if (!currentCampaign || currentCampaign.id !== campaignId) return;
        campaignMembers = Array.isArray(members) ? members : [];
        const selected = new Set(campaignMembers.filter((member) => member.isReferee).map((member) => member.id));
        currentRefereeSessionIds = new Set(selected);
        selectedRefereeSessionIds = new Set(selected);
        campaignMembersLoaded = true;
        renderCampaignMembers();
        updateSaveState();
      } catch (err) {
        campaignMembers = [];
        currentRefereeSessionIds = new Set();
        selectedRefereeSessionIds = new Set();
        campaignMembersLoaded = false;
        renderCampaignMembers();
        setStatus(`Failed to load campaign members: ${err.message}`, true);
      }
    }

    function populateCampaignForm() {
      currentCampaignName = currentCampaign?.name || '';
      currentRulesetId = currentCampaign?.rulesetId || availableRulesets[0]?.id || 'none';
      currentCampaignClaimTimeoutMinutes = Number.isInteger(currentCampaign?.claimTimeoutMinutes)
        ? currentCampaign.claimTimeoutMinutes
        : (isCreateMode ? -1 : DEFAULT_CLAIM_TIMEOUT_MINUTES);
      currentCampaignInviteOnly = Boolean(currentCampaign?.isInviteOnly);
      if (campaignNameInput) campaignNameInput.value = currentCampaignName;
      populateRulesetSelect();
      if (campaignRulesetSelect) {
        campaignRulesetSelect.value = currentRulesetId || 'none';
      }
      if (campaignClaimTimeoutManualInput) {
        campaignClaimTimeoutManualInput.checked = currentCampaignClaimTimeoutMinutes < 0;
      }
      if (campaignClaimTimeoutTimedInput) {
        campaignClaimTimeoutTimedInput.checked = currentCampaignClaimTimeoutMinutes >= 0;
      }
      if (campaignClaimTimeoutInput) {
        campaignClaimTimeoutInput.value = String(
          Number.isInteger(currentCampaignClaimTimeoutMinutes) && currentCampaignClaimTimeoutMinutes >= 0
            ? currentCampaignClaimTimeoutMinutes
            : DEFAULT_CLAIM_TIMEOUT_MINUTES
        );
      }
      if (campaignInviteOnlyInput) {
        campaignInviteOnlyInput.checked = currentCampaignInviteOnly;
      }
      if (campaignOpenJoinInput) {
        campaignOpenJoinInput.checked = !currentCampaignInviteOnly;
      }
      syncClaimTimeoutUi();
      setPlayerManagementEnabled(Boolean(currentCampaign) && campaignMembersLoaded);
      setStatus('');
      setHeader(currentCampaign);
      renderCampaignMembers();
      updateSaveState();
    }

    function campaignSettingsHaveChanges() {
      const name = normalizeName(campaignNameInput?.value);
      const rulesetId = campaignRulesetSelect?.value || '';
      const claimTimeoutMinutes = getClaimTimeoutMinutes();
      const inviteOnly = isInviteOnlySelected();
      const refereeSessionIds = new Set(selectedRefereeSessionIds);
      if (isCreateMode && !currentCampaign) {
        return Boolean(name || rulesetId !== 'none' || claimTimeoutMinutes !== DEFAULT_CLAIM_TIMEOUT_MINUTES || inviteOnly);
      }
      return (
        name !== currentCampaignName ||
        rulesetId !== currentRulesetId ||
        claimTimeoutMinutes !== currentCampaignClaimTimeoutMinutes ||
        inviteOnly !== currentCampaignInviteOnly ||
        !setsEqual(refereeSessionIds, currentRefereeSessionIds)
      );
    }

    function setsEqual(a, b) {
      if (a.size !== b.size) return false;
      for (const value of a) {
        if (!b.has(value)) return false;
      }
      return true;
    }

    function campaignSettingsAreValid() {
      const name = normalizeName(campaignNameInput?.value);
      const rulesetId = campaignRulesetSelect?.value || '';
      if (!name) return false;
      if (!rulesetId || rulesetId === 'none') return false;
      if (getClaimTimeoutMode() !== 'manual' && getClaimTimeoutMinutes() === null) return false;
      return true;
    }

    function updateSaveState() {
      if (!saveBtn) return;
      saveBtn.disabled = !(campaignSettingsAreValid() && campaignSettingsHaveChanges() && campaignMembersLoaded);
    }

    async function loadCampaignSummaries() {
      const campaigns = await fetchJson('/campaigns');
      campaignSummaries = Array.isArray(campaigns) ? campaigns : [];
      currentCampaign = campaignSummaries.find((campaign) => campaign.id === campaignId) || null;
      if (!currentCampaign && !isCreateMode) {
        throw new Error('Campaign not found.');
      }
    }

    async function loadAvailableRulesets() {
      try {
        const rulesets = await fetchJson('/rulesets');
        availableRulesets = Array.isArray(rulesets) ? rulesets : [];
      } catch (err) {
        availableRulesets = [];
        console.warn('Unable to load rulesets:', err);
      }
      populateRulesetSelect();
    }

    async function saveCampaignSettings() {
      if (!campaignSettingsAreValid()) {
        setStatus('Fix the campaign settings before saving.', true);
        updateSaveState();
        return;
      }

      const payload = {
        name: normalizeName(campaignNameInput?.value),
        rulesetId: campaignRulesetSelect?.value || '',
        claimTimeoutMinutes: getClaimTimeoutMode() === 'manual' ? -1 : getClaimTimeoutMinutes(),
        isInviteOnly: isInviteOnlySelected(),
        refereeSessionIds: Array.from(selectedRefereeSessionIds)
      };

      const savePath = currentCampaign
        ? `/campaigns/${encodeURIComponent(currentCampaign.id)}`
        : '/campaigns';

      setStatus('Saving campaign settings...');
      try {
        const updated = await fetchJson(savePath, {
          method: currentCampaign ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!currentCampaign) {
          const createdId = updated?.id;
          if (createdId) {
            window.location.replace(
              window.PlayerTrackerCampaignSettings?.buildCampaignSettingsPageUrl?.(createdId, campaignSource) ||
                `campaign-settings.html?campaignId=${encodeURIComponent(createdId)}&source=${campaignSource}`
            );
            return;
          }
        }
        currentCampaign = updated || currentCampaign;
        currentCampaignName = currentCampaign.name || currentCampaignName;
        currentRulesetId = currentCampaign.rulesetId || currentRulesetId;
        currentCampaignClaimTimeoutMinutes = Number.isInteger(currentCampaign.claimTimeoutMinutes)
          ? currentCampaign.claimTimeoutMinutes
          : currentCampaignClaimTimeoutMinutes;
        currentCampaignInviteOnly = Boolean(currentCampaign.isInviteOnly);
        await loadCampaignSummaries();
        await loadAvailableRulesets();
        await loadCampaignMembers();
        populateCampaignForm();
        setStatus('Campaign settings saved.');
        updateSaveState();
      } catch (err) {
        setStatus(`Unable to save campaign settings: ${err.message}`, true);
      }
    }

    async function invitePlayerByName() {
      if (!currentCampaign) {
        setStatus('Save the campaign first before adding players.', true);
        return;
      }
      const playerName = normalizeName(campaignInvitePlayerNameInput?.value);
      if (!playerName) {
        setStatus('Enter a player name first.', true);
        campaignInvitePlayerNameInput?.focus();
        return;
      }

      setStatus('Adding player...');
      try {
        const member = await fetchJson(`/campaigns/${encodeURIComponent(currentCampaign.id)}/members`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerName })
        });
        const target = member?.displayName || playerName;
        setStatus(`Added ${target} to the campaign.`);
        if (campaignInvitePlayerNameInput) {
          campaignInvitePlayerNameInput.value = '';
          campaignInvitePlayerNameInput.focus();
        }
        await loadCampaignMembers();
        updateSaveState();
      } catch (err) {
        setStatus(`Failed to add player: ${err.message}`, true);
      }
    }

    function wireEvents() {
      if (campaignNameInput) {
        campaignNameInput.addEventListener('input', updateSaveState);
      }
      if (campaignRulesetSelect) {
        campaignRulesetSelect.addEventListener('change', updateSaveState);
      }
      if (campaignClaimTimeoutManualInput) {
        campaignClaimTimeoutManualInput.addEventListener('change', () => {
          syncClaimTimeoutUi();
          updateSaveState();
        });
      }
      if (campaignClaimTimeoutTimedInput) {
        campaignClaimTimeoutTimedInput.addEventListener('change', () => {
          syncClaimTimeoutUi();
          updateSaveState();
        });
      }
      if (campaignClaimTimeoutInput) {
        campaignClaimTimeoutInput.addEventListener('input', updateSaveState);
      }
      if (campaignInviteOnlyInput) {
        campaignInviteOnlyInput.addEventListener('change', updateSaveState);
      }
      if (campaignOpenJoinInput) {
        campaignOpenJoinInput.addEventListener('change', updateSaveState);
      }
      if (campaignInvitePlayerNameInput) {
        campaignInvitePlayerNameInput.addEventListener('input', () => {
          setPlayerManagementEnabled(Boolean(currentCampaign) && campaignMembersLoaded);
        });
        campaignInvitePlayerNameInput.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            void invitePlayerByName();
          }
        });
      }
      if (campaignInvitePlayerButton) {
        campaignInvitePlayerButton.addEventListener('click', () => {
          void invitePlayerByName();
        });
      }
      if (saveBtn) {
        saveBtn.addEventListener('click', () => {
          void saveCampaignSettings();
        });
      }
      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
          window.location.href = backHref;
        });
      }
    }

    async function bootstrap() {
      setHeader(null);
      setStatus('Loading campaign settings...');
      wireEvents();

      if (!campaignId && !isCreateMode) {
        setStatus('No campaign selected.', true);
        return;
      }

      try {
        await loadCampaignSummaries();
        await loadAvailableRulesets();
        populateCampaignForm();
        await loadCampaignMembers();
        if (campaignInvitePlayerButton) {
          setPlayerManagementEnabled(Boolean(currentCampaign) && campaignMembersLoaded);
        }
        if (params.get('focus') === 'add-player') {
          campaignInvitePlayerNameInput?.focus();
        } else {
          campaignNameInput?.focus();
        }
        updateSaveState();
      } catch (err) {
        setStatus(err.message || 'Unable to load campaign settings.', true);
      }
    }

    bootstrap();
  });
})();
