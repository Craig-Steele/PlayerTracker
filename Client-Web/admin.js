const {
  APP_NAME,
  APP_ICON_URL,
  isAdminHost,
  updateCampaignHeader
} = window.PlayerTrackerShared || {
  APP_NAME: 'Roll4Initiative',
  APP_ICON_URL: '/favicon-512.png',
  isAdminHost: () => false,
  updateCampaignHeader: () => {}
};

window.addEventListener('DOMContentLoaded', () => {
  document.title = `${APP_NAME} - Admin`;

  const authSummary = document.getElementById('admin-auth-summary');
  const authStatus = document.getElementById('admin-auth-status');
  const authEmailInput = document.getElementById('admin-auth-email');
  const authPasswordInput = document.getElementById('admin-auth-password');
  const authSignupBtn = document.getElementById('admin-auth-signup');
  const authLoginBtn = document.getElementById('admin-auth-login');
  const authLogoutBtn = document.getElementById('admin-auth-logout');
  const authShutdownBtn = document.getElementById('admin-auth-shutdown');
  const authCredentials = document.getElementById('admin-auth-credentials');
  const authSessionActions = document.getElementById('admin-auth-session-actions');
  const signupModal = document.getElementById('admin-signup-modal');
  const signupModalStatus = document.getElementById('admin-signup-modal-status');
  const signupModalSummary = document.getElementById('admin-signup-modal-summary');
  const signupModalCancelBtn = document.getElementById('admin-signup-cancel');
  const signupModalSaveBtn = document.getElementById('admin-signup-save');
  const signupEmailInput = document.getElementById('admin-signup-email');
  const signupPasswordInput = document.getElementById('admin-signup-password');

  const adminCampaignName = document.getElementById('admin-campaign-name');
  const adminRulesetLink = document.getElementById('admin-ruleset-link');
  const adminRulesetLicense = document.getElementById('admin-ruleset-license');
  const adminRulesetLicenseWrap = document.getElementById('admin-ruleset-license-wrap');
  const adminRulesetIcon = document.getElementById('admin-ruleset-icon');
  const adminActiveSummary = document.getElementById('admin-active-summary');
  const adminHeaderNameTargets = [adminCampaignName];
  const adminHeaderIconTargets = [adminRulesetIcon];
  const adminHeaderLinkTargets = [adminRulesetLink];
  const adminHeaderLicenseTargets = [
    { linkEl: adminRulesetLicense, wrapEl: adminRulesetLicenseWrap }
  ];

  const campaignList = document.getElementById('admin-campaign-list');
  const campaignStatusDiv = document.getElementById('admin-campaign-status');
  const editSelectedBtn = document.getElementById('admin-campaign-edit');
  const newCampaignBtn = document.getElementById('admin-campaign-new');

  const modal = document.getElementById('admin-campaign-modal');
  const modalTitle = document.getElementById('admin-campaign-dialog-title');
  const modalSummary = document.getElementById('admin-campaign-modal-summary');
  const modalStatus = document.getElementById('admin-campaign-modal-status');
  const modalCancelBtn = document.getElementById('admin-campaign-cancel');
  const modalSaveBtn = document.getElementById('admin-campaign-save');
  const campaignNameInput = document.getElementById('admin-campaign-name-input');
  const campaignRulesetSelect = document.getElementById('admin-ruleset-select');
  const campaignClaimTimeoutManualInput = document.getElementById('admin-campaign-claim-timeout-manual');
  const campaignClaimTimeoutTimedInput = document.getElementById('admin-campaign-claim-timeout-timed');
  const campaignClaimTimeoutInput = document.getElementById('admin-campaign-claim-timeout-input');
  const campaignInviteOnlyInput = document.getElementById('admin-campaign-invite-only');
  const campaignMembersList = document.getElementById('admin-campaign-members');
  const campaignInvitePlayerNameInput = document.getElementById('admin-campaign-invite-player-name');
  const campaignInvitePlayerButton = document.getElementById('admin-campaign-invite-player-button');
  const allowLocalAdminActions = isAdminHost();

  let availableRulesets = [];
  let campaignSummaries = [];
  let activeCampaignId = null;
  let selectedCampaignId = null;
  let editorMode = null;
  let editorCampaignId = null;
  let editorOriginalName = '';
  let editorOriginalRulesetId = '';
  let editorOriginalClaimTimeoutMinutes = 5;
  let editorOriginalClaimTimeoutMode = 'timed';
  let editorOriginalInviteOnly = false;
  let editorOriginalRefereeSessionIds = new Set();
  let editorSelectedRefereeSessionIds = new Set();
  let campaignMembers = [];
  let campaignMembersLoaded = true;
  let refreshToken = 0;
  let authRefreshToken = 0;
  let authUser = null;
  let campaignEventSource = null;
  const defaultClaimTimeoutMinutes = 5;
  const adminEmailStorageKey = 'adminEmail';

  if (authEmailInput) {
    authEmailInput.value = localStorage.getItem(adminEmailStorageKey) || '';
  }

  function fetchJson(url, options) {
    return fetch(url, options).then(async (res) => {
      if (!res.ok) {
        const message = await res.text().catch(() => '');
        throw new Error(formatServerError(message, res.status));
      }
      return res.json();
    });
  }

  function fetchMaybeJson(url, options) {
    return fetch(url, options).then(async (res) => {
      if (res.status === 401) {
        return null;
      }
      if (!res.ok) {
        const message = await res.text().catch(() => '');
        throw new Error(message || `Server returned ${res.status}`);
      }
      return res.json();
    });
  }

  function fetchVoid(url, options) {
    return fetch(url, options).then(async (res) => {
      if (!res.ok) {
        const message = await res.text().catch(() => '');
        throw new Error(formatServerError(message, res.status));
      }
      return null;
    });
  }

  function formatServerError(rawMessage, status) {
    if (rawMessage) {
      try {
        const payload = JSON.parse(rawMessage);
        const reason = typeof payload.reason === 'string' ? payload.reason : '';
        if (reason === 'User already exists.') {
          return 'An account with that email already exists.';
        }
        if (reason) {
          return reason;
        }
      } catch (_) {
        if (rawMessage.trim()) {
          return rawMessage.trim();
        }
      }
    }
    return `Server returned ${status}`;
  }

  function setAuthStatus(message, isError = false) {
    if (!authStatus) return;
    authStatus.textContent = message;
    authStatus.style.color = isError ? '#b00020' : '';
  }

  function setStatus(message, isError = false) {
    if (!campaignStatusDiv) return;
    campaignStatusDiv.textContent = message;
    campaignStatusDiv.style.color = isError ? '#b00020' : '';
  }

  function setModalStatus(message, isError = false) {
    if (!modalStatus) return;
    modalStatus.textContent = message;
    modalStatus.style.color = isError ? '#b00020' : '';
  }

  function setSignupModalStatus(message, isError = false) {
    if (!signupModalStatus) return;
    signupModalStatus.textContent = message;
    signupModalStatus.style.color = isError ? '#b00020' : '';
  }

  function updateHeader(activeCampaign, library) {
    updateCampaignHeader(
      {
        nameTargets: adminHeaderNameTargets,
        iconTargets: adminHeaderIconTargets,
        linkTargets: adminHeaderLinkTargets,
        licenseTargets: adminHeaderLicenseTargets
      },
      activeCampaign
        ? {
            campaignName: activeCampaign.name || 'Campaign Admin',
            rulesetLabel: library?.label || activeCampaign.rulesetLabel || activeCampaign.rulesetId || 'No Conditions',
            rulesBaseUrl: library?.rulesBaseUrl || null,
            licenseUrl: library?.license || null,
            iconUrl: library?.icon || null
          }
        : {
            campaignName: null,
            rulesetLabel: '',
            rulesBaseUrl: null,
            licenseUrl: null,
            iconUrl: APP_ICON_URL,
            fallbackName: `${APP_NAME} - Admin`
          }
    );
    if (adminActiveSummary) {
      if (!activeCampaign) {
        adminActiveSummary.textContent = 'No campaign selected.';
      } else {
        const label = library?.label || activeCampaign.rulesetLabel || activeCampaign.rulesetId || 'No Conditions';
        adminActiveSummary.textContent = `Active: ${activeCampaign.name} - ${label} · ${claimTimeoutLabel(activeCampaign.claimTimeoutMinutes)} · ${accessLabel(activeCampaign)}`;
      }
    }
  }

  function updateAuthSummary() {
    if (!authSummary) return;
    if (!authUser) {
      authSummary.textContent = 'Not signed in.';
      return;
    }
    authSummary.textContent = `Signed in as ${authUser.email}`;
  }

  function setCampaignUiEnabled(enabled) {
    if (newCampaignBtn) newCampaignBtn.disabled = !enabled;
    if (editSelectedBtn) editSelectedBtn.disabled = !enabled || !selectedCampaignId;
    if (campaignList) campaignList.toggleAttribute('aria-disabled', !enabled);
    campaignList?.querySelectorAll('.admin-campaign-row').forEach((button) => {
      button.disabled = !enabled;
    });
    updateInvitePlayerControls();
  }

  function updateAuthUi() {
    updateAuthSummary();
    if (authLogoutBtn) {
      authLogoutBtn.disabled = !authUser;
    }
    if (authShutdownBtn) {
      authShutdownBtn.disabled = !authUser || !allowLocalAdminActions;
      authShutdownBtn.title = allowLocalAdminActions
        ? ''
        : 'Shutdown is only available from localhost.';
    }
    if (authSignupBtn) {
      authSignupBtn.disabled = !allowLocalAdminActions;
      authSignupBtn.title = allowLocalAdminActions
        ? ''
        : 'Create account is only available from localhost.';
    }
    if (authCredentials) {
      authCredentials.classList.toggle('hidden', Boolean(authUser));
    }
    if (authSessionActions) {
      authSessionActions.classList.toggle('hidden', !authUser);
    }
    setCampaignUiEnabled(Boolean(authUser));
  }

  function clearCampaignState() {
    availableRulesets = [];
    campaignSummaries = [];
    activeCampaignId = null;
    selectedCampaignId = null;
    renderCampaignList();
    updateHeader(null, null);
    setStatus(authUser ? 'Create or activate a campaign.' : 'Sign in to manage campaigns.');
  }

  function closeCampaignEventStream() {
    if (campaignEventSource) {
      campaignEventSource.close();
      campaignEventSource = null;
    }
  }

  function syncCampaignEventStream() {
    if (typeof EventSource === 'undefined') {
      closeCampaignEventStream();
      return;
    }
    if (campaignEventSource) {
      return;
    }
    const source = new EventSource('/campaign/events');
    campaignEventSource = source;
    const refreshFromCampaignChange = async () => {
      try {
        await refreshAll();
      } catch (_err) {
        // A later stream event or manual action will retry the refresh.
      }
    };
    source.addEventListener('snapshot', refreshFromCampaignChange);
    source.addEventListener('campaign-updated', refreshFromCampaignChange);
    source.onerror = () => {
      // EventSource retries automatically; the next event will refresh the page state.
    };
  }

  function isCampaignModalOpen() {
    return Boolean(modal && !modal.classList.contains('hidden'));
  }

  function populateRulesetSelect(rulesets) {
    if (!campaignRulesetSelect) return;
    campaignRulesetSelect.innerHTML = '';
    if (Array.isArray(rulesets) && rulesets.length > 0) {
      rulesets.forEach((ruleset) => {
        const option = document.createElement('option');
        option.value = ruleset.id;
        option.textContent = ruleset.label || ruleset.id;
        campaignRulesetSelect.appendChild(option);
      });
    } else {
      const option = document.createElement('option');
      option.value = 'none';
      option.textContent = 'No Conditions';
      campaignRulesetSelect.appendChild(option);
    }
  }

  function setEquals(left, right) {
    if (left.size !== right.size) return false;
    for (const value of left) {
      if (!right.has(value)) return false;
    }
    return true;
  }

  function updateRefereeSelection(id, checked) {
    if (!id) return;
    if (checked) {
      editorSelectedRefereeSessionIds.add(id);
    } else {
      editorSelectedRefereeSessionIds.delete(id);
    }
    validateModal();
  }

  function updateInvitePlayerControls() {
    const enabled = Boolean(authUser && editorMode === 'edit' && editorCampaignId && campaignMembersLoaded);
    if (campaignInvitePlayerNameInput) {
      campaignInvitePlayerNameInput.disabled = !enabled;
    }
    if (campaignInvitePlayerButton) {
      const hasName = normalizeName(campaignInvitePlayerNameInput?.value).length > 0;
      campaignInvitePlayerButton.disabled = !enabled || !hasName;
    }
  }

  function renderCampaignMembers() {
    if (!campaignMembersList) return;
    campaignMembersList.innerHTML = '';

    if (editorMode !== 'edit') {
      const empty = document.createElement('div');
      empty.className = 'subtitle';
      empty.textContent = 'Assign referees while editing an existing campaign.';
      campaignMembersList.appendChild(empty);
      return;
    }

    if (!campaignMembersLoaded) {
      const empty = document.createElement('div');
      empty.className = 'subtitle';
      empty.textContent = 'Loading current users...';
      campaignMembersList.appendChild(empty);
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
      const row = document.createElement('label');
      row.className = 'property-toggle-control admin-campaign-member-row';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = editorSelectedRefereeSessionIds.has(member.id);
      checkbox.addEventListener('change', () => {
        updateRefereeSelection(member.id, checkbox.checked);
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

      row.appendChild(checkbox);
      row.appendChild(textWrap);
      campaignMembersList.appendChild(row);
    });
    updateInvitePlayerControls();
  }

  async function fetchCampaignMembers(campaignId) {
    if (!campaignId) {
      campaignMembers = [];
      editorOriginalRefereeSessionIds = new Set();
      editorSelectedRefereeSessionIds = new Set();
      campaignMembersLoaded = true;
      renderCampaignMembers();
      return;
    }
    campaignMembersLoaded = false;
    renderCampaignMembers();
    try {
      const members = await fetchJson(`/campaigns/${campaignId}/members`);
      if (editorCampaignId !== campaignId || !isCampaignModalOpen()) return;
      campaignMembers = Array.isArray(members) ? members : [];
      const selected = new Set(campaignMembers.filter((member) => member.isReferee).map((member) => member.id));
      editorOriginalRefereeSessionIds = new Set(selected);
      editorSelectedRefereeSessionIds = new Set(selected);
      campaignMembersLoaded = true;
      renderCampaignMembers();
      validateModal();
    } catch (err) {
      if (editorCampaignId !== campaignId || !isCampaignModalOpen()) return;
      campaignMembers = [];
      editorOriginalRefereeSessionIds = new Set();
      editorSelectedRefereeSessionIds = new Set();
      campaignMembersLoaded = false;
      renderCampaignMembers();
      setModalStatus(`Failed to load campaign members: ${err.message}`, true);
    }
  }

  async function invitePlayerByName() {
    if (editorMode !== 'edit' || !editorCampaignId) {
      setModalStatus('Save the campaign first before adding players.', true);
      return;
    }
    const playerName = normalizeName(campaignInvitePlayerNameInput?.value);
    if (!playerName) {
      setModalStatus('Enter a player name first.', true);
      campaignInvitePlayerNameInput?.focus();
      return;
    }

    setModalStatus('Adding player...');
    try {
      const member = await fetchJson(`/campaigns/${editorCampaignId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerName })
      });
      const target = member.playerName || playerName;
      setModalStatus(`Added ${target} to the campaign.`);
      if (campaignInvitePlayerNameInput) {
        campaignInvitePlayerNameInput.select();
      }
    } catch (err) {
      setModalStatus(`Failed to add player: ${err.message}`, true);
    }
  }

  function renderCampaignList() {
    if (!campaignList) return;
    campaignList.innerHTML = '';

    if (!campaignSummaries.length) {
      const empty = document.createElement('div');
      empty.className = 'subtitle';
      empty.textContent = authUser ? 'No campaigns yet.' : 'Sign in to load campaigns.';
      campaignList.appendChild(empty);
      updateEditButtonState();
      return;
    }

    const list = document.createElement('ul');
    list.className = 'admin-campaign-list-items';

    campaignSummaries.forEach((campaign) => {
      const li = document.createElement('li');
      li.className = 'admin-campaign-list-item';
      li.dataset.campaignId = campaign.id;
      li.classList.toggle('selected', campaign.id === selectedCampaignId);
      li.classList.toggle('active', campaign.id === activeCampaignId);

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'admin-campaign-row';
      button.addEventListener('click', () => {
        if (!authUser) return;
        selectedCampaignId = campaign.id;
        updateCampaignListSelection();
        updateEditButtonState();
        updateSelectionStatus();
      });
      button.addEventListener('dblclick', () => {
        if (!authUser) return;
        selectedCampaignId = campaign.id;
        activateCampaign(campaign.id);
      });

      const name = document.createElement('span');
      name.className = 'admin-campaign-name';
      name.textContent = campaign.name;

      const meta = document.createElement('span');
      meta.className = 'admin-campaign-meta';
      const ruleset = campaign.rulesetLabel || campaign.rulesetId || 'No Conditions';
      meta.textContent = `${ruleset} · ${claimTimeoutLabel(campaign.claimTimeoutMinutes)} · ${accessLabel(campaign)}${campaign.isActive ? ' · Active' : ''}`;

      button.appendChild(name);
      button.appendChild(meta);
      li.appendChild(button);
      list.appendChild(li);
    });

    campaignList.appendChild(list);
    updateEditButtonState();
  }

  function updateCampaignListSelection() {
    if (!campaignList) return;
    campaignList.querySelectorAll('.admin-campaign-list-item').forEach((item) => {
      const campaignId = item.dataset.campaignId || '';
      item.classList.toggle('selected', campaignId === selectedCampaignId);
      item.classList.toggle('active', campaignId === activeCampaignId);
    });
  }

  function updateSelectionStatus() {
    if (!authUser) {
      setStatus('Sign in to manage campaigns.');
      return;
    }
    const selected = campaignSummaries.find((campaign) => campaign.id === selectedCampaignId) || null;
    if (!selected) {
      setStatus(activeCampaignId ? 'Select a campaign to edit or double-click to activate it.' : 'Create or activate a campaign.');
      return;
    }
    const label = selected.rulesetLabel || selected.rulesetId || 'No Conditions';
    setStatus(`Selected ${selected.name} - ${label}.`);
  }

  function updateEditButtonState() {
    if (!editSelectedBtn) return;
    editSelectedBtn.disabled = !authUser || !selectedCampaignId;
  }

  function normalizeName(name) {
    return (name || '').trim();
  }

  function normalizeClaimTimeoutMinutes(value) {
    const parsed = Number.parseInt(String(value || '').trim(), 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return null;
    }
    return parsed;
  }

  function claimTimeoutLabel(minutes) {
    if (!Number.isInteger(minutes)) {
      return `${defaultClaimTimeoutMinutes}m claim timeout`;
    }
    if (minutes < 0) return 'Explicit release only';
    if (minutes === 0) return 'Release immediately on disconnect';
    return `${minutes}m claim timeout`;
  }

  function accessLabel(campaign) {
    return campaign?.isInviteOnly ? 'Invite only' : 'Open join';
  }

  function getClaimTimeoutMode() {
    if (campaignClaimTimeoutManualInput?.checked) {
      return 'manual';
    }
    return 'timed';
  }

  function getClaimTimeoutMinutes() {
    return getClaimTimeoutMode() === 'manual'
      ? -1
      : (normalizeClaimTimeoutMinutes(campaignClaimTimeoutInput?.value) ?? defaultClaimTimeoutMinutes);
  }

  function syncClaimTimeoutUi() {
    const manual = getClaimTimeoutMode() === 'manual';
    if (campaignClaimTimeoutInput) {
      campaignClaimTimeoutInput.disabled = manual;
      campaignClaimTimeoutInput.classList.toggle('hidden', manual);
    }
  }

  function nameExists(name, ignoreId = null) {
    const normalized = normalizeName(name).toLowerCase();
    return campaignSummaries.some((campaign) => {
      if (ignoreId && campaign.id === ignoreId) return false;
      return campaign.name.trim().toLowerCase() === normalized;
    });
  }

  function hasEditorChanges() {
    if (!campaignNameInput || !campaignRulesetSelect) return false;
    const name = normalizeName(campaignNameInput.value);
    const rulesetId = campaignRulesetSelect.value;
    const claimTimeoutMode = getClaimTimeoutMode();
    const claimTimeoutMinutes = getClaimTimeoutMinutes();
    const inviteOnly = Boolean(campaignInviteOnlyInput?.checked);
    return (
      name !== editorOriginalName ||
      rulesetId !== editorOriginalRulesetId ||
      claimTimeoutMinutes !== editorOriginalClaimTimeoutMinutes ||
      claimTimeoutMode !== editorOriginalClaimTimeoutMode ||
      inviteOnly !== editorOriginalInviteOnly ||
      !setEquals(editorSelectedRefereeSessionIds, editorOriginalRefereeSessionIds)
    );
  }

  function isEditorValid() {
    if (!campaignNameInput || !campaignRulesetSelect) return false;
    const name = normalizeName(campaignNameInput.value);
    const rulesetId = campaignRulesetSelect.value;
    const claimTimeoutMode = getClaimTimeoutMode();
    const claimTimeoutMinutes = claimTimeoutMode === 'manual'
      ? -1
      : normalizeClaimTimeoutMinutes(campaignClaimTimeoutInput?.value);
    const inviteOnly = Boolean(campaignInviteOnlyInput?.checked);
    if (!name) return false;
    if (campaignRulesetSelect.options.length > 0 && !rulesetId) return false;
    if (claimTimeoutMode !== 'manual' && claimTimeoutMinutes === null) return false;
    if (editorMode === 'new') {
      return !nameExists(name);
    }
    return !nameExists(name, editorCampaignId) || name.toLowerCase() === editorOriginalName.toLowerCase();
  }

  function validateModal() {
    if (!modalSaveBtn) return;
    const valid = isEditorValid();
    const changed = hasEditorChanges();
    modalSaveBtn.disabled = !(valid && changed && (editorMode !== 'edit' || campaignMembersLoaded));
  }

  function openModal(mode, campaign = null) {
    if (!modal || !campaignNameInput || !campaignRulesetSelect) return;
    editorMode = mode;
    editorCampaignId = campaign?.id || null;
    editorOriginalName = campaign?.name || '';
    editorOriginalRulesetId = campaign?.rulesetId || availableRulesets[0]?.id || 'none';
    editorOriginalClaimTimeoutMinutes = Number.isInteger(campaign?.claimTimeoutMinutes)
      ? campaign.claimTimeoutMinutes
      : defaultClaimTimeoutMinutes;
    editorOriginalClaimTimeoutMode = editorOriginalClaimTimeoutMinutes < 0 ? 'manual' : 'timed';
    editorOriginalInviteOnly = Boolean(campaign?.isInviteOnly);
    editorOriginalRefereeSessionIds = new Set();
    editorSelectedRefereeSessionIds = new Set();
    campaignMembersLoaded = mode !== 'edit';

    if (modalTitle) {
      modalTitle.textContent = mode === 'new' ? 'New Campaign' : 'Edit Campaign Details';
    }

    if (modalSummary) {
      modalSummary.textContent = mode === 'new'
        ? 'Create a new campaign record. Activate it later from the list.'
        : `Editing ${campaign?.name || 'Campaign'}.`;
    }

    campaignNameInput.value = campaign?.name || '';
    campaignRulesetSelect.value = editorOriginalRulesetId;
    if (campaignClaimTimeoutManualInput) {
      campaignClaimTimeoutManualInput.checked = editorOriginalClaimTimeoutMode === 'manual';
    }
    if (campaignClaimTimeoutTimedInput) {
      campaignClaimTimeoutTimedInput.checked = editorOriginalClaimTimeoutMode !== 'manual';
    }
    if (campaignClaimTimeoutInput) {
      campaignClaimTimeoutInput.value = String(
        Number.isInteger(editorOriginalClaimTimeoutMinutes)
          ? Math.max(0, editorOriginalClaimTimeoutMinutes)
          : defaultClaimTimeoutMinutes
      );
    }
    if (campaignInviteOnlyInput) {
      campaignInviteOnlyInput.checked = editorOriginalInviteOnly;
    }
    if (campaignInvitePlayerNameInput) {
      campaignInvitePlayerNameInput.value = '';
    }
    syncClaimTimeoutUi();
    renderCampaignMembers();
    updateInvitePlayerControls();

    setModalStatus('');
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    validateModal();
    if (mode === 'edit' && editorCampaignId) {
      fetchCampaignMembers(editorCampaignId);
    } else {
      campaignMembers = [];
      editorOriginalRefereeSessionIds = new Set();
      editorSelectedRefereeSessionIds = new Set();
      campaignMembersLoaded = true;
      renderCampaignMembers();
    }
  }

  function openSignupModal() {
    if (!signupModal || !allowLocalAdminActions) {
      setAuthStatus('Create account is only available from localhost.', true);
      return;
    }
    if (signupEmailInput) {
      signupEmailInput.value = authEmailInput ? authEmailInput.value.trim() : '';
    }
    if (signupPasswordInput) {
      signupPasswordInput.value = '';
    }
    if (signupModalSummary) {
      signupModalSummary.textContent = 'Create the local server owner account.';
    }
    setSignupModalStatus('');
    signupModal.classList.remove('hidden');
    signupModal.setAttribute('aria-hidden', 'false');
    validateSignupModal();
  }

  function closeSignupModal() {
    if (!signupModal) return;
    signupModal.classList.add('hidden');
    signupModal.setAttribute('aria-hidden', 'true');
    setSignupModalStatus('');
    validateSignupModal();
  }

  function signupHasChanges() {
    const email = (signupEmailInput?.value || '').trim();
    const password = signupPasswordInput?.value || '';
    return Boolean(email || password);
  }

  function isSignupValid() {
    const email = (signupEmailInput?.value || '').trim();
    const password = signupPasswordInput?.value || '';
    return Boolean(email && password);
  }

  function validateSignupModal() {
    if (!signupModalSaveBtn) return;
    signupModalSaveBtn.disabled = !(isSignupValid() && signupHasChanges());
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    editorMode = null;
    editorCampaignId = null;
    editorOriginalName = '';
    editorOriginalRulesetId = '';
    editorOriginalClaimTimeoutMinutes = defaultClaimTimeoutMinutes;
    editorOriginalClaimTimeoutMode = 'timed';
    editorOriginalRefereeSessionIds = new Set();
    editorSelectedRefereeSessionIds = new Set();
    campaignMembers = [];
    campaignMembersLoaded = true;
    renderCampaignMembers();
    setModalStatus('');
    validateModal();
  }

  async function fetchAuthSession() {
    return fetchMaybeJson('/auth/session');
  }

  async function fetchHeader() {
    const [campaign, library] = await Promise.all([
      fetch('/campaign').then(async (res) => {
        if (res.status === 409) return null;
        if (!res.ok) {
          const message = await res.text().catch(() => '');
          throw new Error(message || `Server returned ${res.status}`);
        }
        return res.json();
      }),
      fetchJson('/conditions-library')
    ]);
    return { campaign, library };
  }

  async function fetchCampaigns() {
    const campaigns = await fetchJson('/campaigns');
    return Array.isArray(campaigns) ? campaigns : [];
  }

  async function fetchRulesets() {
    const rulesets = await fetchJson('/rulesets');
    return Array.isArray(rulesets) ? rulesets : [];
  }

  async function refreshAuth() {
    const token = ++authRefreshToken;
    try {
      const session = await fetchAuthSession();
      if (token !== authRefreshToken) return false;
      authUser = session?.user || null;
      updateAuthUi();
      return Boolean(authUser);
    } catch (err) {
      if (token !== authRefreshToken) return false;
      const message = String(err?.message || err || '');
      if (message.includes('401') || message.toLowerCase().includes('not signed in')) {
        authUser = null;
        updateAuthUi();
        clearCampaignState();
        setAuthStatus('Session expired. Please sign in again.', true);
        return false;
      }
      setAuthStatus(`Failed to load auth session: ${message || 'Network error.'}`, true);
      return true;
    }
  }

  async function refreshCampaignData() {
    if (!authUser) {
      clearCampaignState();
      return;
    }

    const token = ++refreshToken;
    try {
      const [rulesets, campaigns, header] = await Promise.all([
        fetchRulesets(),
        fetchCampaigns(),
        fetchHeader()
      ]);
      if (token !== refreshToken) return;
      availableRulesets = rulesets;
      if (!isCampaignModalOpen()) {
        populateRulesetSelect(availableRulesets);
      }
      campaignSummaries = campaigns;
      activeCampaignId = header.campaign?.id || null;
      updateHeader(header.campaign, header.library);
      if (!campaignSummaries.some((campaign) => campaign.id === selectedCampaignId)) {
        selectedCampaignId = activeCampaignId;
      }
      renderCampaignList();
      updateCampaignListSelection();
      updateSelectionStatus();
      updateEditButtonState();
    } catch (err) {
      if (String(err.message).includes('401') || String(err.message).toLowerCase().includes('not signed in')) {
        authUser = null;
        updateAuthUi();
        clearCampaignState();
        setAuthStatus('Session expired. Please sign in again.', true);
        return;
      }
      setStatus(`Failed to load campaign data: ${err.message}`, true);
    }
  }

  async function refreshAll() {
    const signedIn = await refreshAuth();
    if (!signedIn) {
      clearCampaignState();
      return;
    }
    await refreshCampaignData();
  }

  async function authenticate(path) {
    if (!authEmailInput || !authPasswordInput) return;
    const email = (authEmailInput.value || '').trim();
    const password = authPasswordInput.value || '';
    if (!email) {
      setAuthStatus('Email is required.', true);
      return;
    }
    if (!password) {
      setAuthStatus('Password is required.', true);
      return;
    }
    try {
      setAuthStatus(path.endsWith('signup') ? 'Creating account...' : 'Signing in...');
      await fetchJson(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password
        })
      });
      const session = await fetchAuthSession();
      authUser = session?.user || null;
      authPasswordInput.value = '';
      if (authUser?.email) {
        authEmailInput.value = authUser.email;
        localStorage.setItem(adminEmailStorageKey, authUser.email);
      } else if (email) {
        localStorage.setItem(adminEmailStorageKey, email);
      }
      updateAuthUi();
      await refreshCampaignData();
    } catch (err) {
      setAuthStatus(`Auth failed: ${err.message}`, true);
    }
  }

  async function createAccount() {
    if (!signupEmailInput || !signupPasswordInput) return;
    const email = (signupEmailInput.value || '').trim();
    const password = signupPasswordInput.value || '';
    if (!email) {
      setSignupModalStatus('Email is required.', true);
      return;
    }
    if (!password) {
      setSignupModalStatus('Password is required.', true);
      return;
    }
    try {
      setSignupModalStatus('Creating account...');
      await fetchJson('/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password
        })
      });
      const session = await fetchAuthSession();
      authUser = session?.user || null;
      authPasswordInput.value = '';
      if (authEmailInput) {
        authEmailInput.value = email;
      }
      localStorage.setItem(adminEmailStorageKey, email);
      if (signupPasswordInput) signupPasswordInput.value = '';
      if (authUser?.email) {
        authEmailInput.value = authUser.email;
        localStorage.setItem(adminEmailStorageKey, authUser.email);
      }
      updateAuthUi();
      closeSignupModal();
      await refreshCampaignData();
    } catch (err) {
      setSignupModalStatus(`Sign up failed: ${err.message}`, true);
    }
  }

  async function logout() {
    try {
      await fetchVoid('/auth/logout', { method: 'POST' });
    } catch (err) {
      setAuthStatus(`Logout failed: ${err.message}`, true);
      return;
    }
    authUser = null;
    updateAuthUi();
    clearCampaignState();
  }

  async function shutdownServer() {
    if (!authUser || !allowLocalAdminActions) return;
    const confirmed = window.confirm('Shut down the server now?');
    if (!confirmed) return;
    try {
      await fetchVoid('/admin/shutdown', { method: 'POST' });
      setAuthStatus('Shutdown requested.');
      setStatus('Shutdown requested.');
    } catch (err) {
      setAuthStatus(`Shutdown failed: ${err.message}`, true);
    }
  }

  async function activateCampaign(campaignId) {
    try {
      const selected = await fetchJson(`/campaigns/${campaignId}/select`, {
        method: 'POST'
      });
      selectedCampaignId = selected.id;
      await refreshCampaignData();
      setStatus(`Activated ${selected.name}.`);
    } catch (err) {
      setStatus(`Failed to activate campaign: ${err.message}`, true);
    }
  }

  async function saveCampaign() {
    if (!campaignNameInput || !campaignRulesetSelect) return;
    if (editorMode === 'edit' && !campaignMembersLoaded) {
      setModalStatus('Loading current users...', true);
      return;
    }

    const name = normalizeName(campaignNameInput.value);
    const rulesetId = campaignRulesetSelect.value;
    const claimTimeoutMinutes = getClaimTimeoutMinutes();
    const inviteOnly = Boolean(campaignInviteOnlyInput?.checked);

    if (editorMode === 'new') {
      try {
        const created = await fetchJson('/campaigns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, rulesetId, claimTimeoutMinutes, isInviteOnly: inviteOnly })
        });
        selectedCampaignId = created.id;
        closeModal();
        await refreshCampaignData();
        setStatus(`Created ${created.name}.`);
      } catch (err) {
        setModalStatus(`Failed to create campaign: ${err.message}`, true);
      }
      return;
    }

    if (editorMode === 'edit' && editorCampaignId) {
      try {
        const updated = await fetchJson(`/campaigns/${editorCampaignId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            rulesetId,
            claimTimeoutMinutes,
            isInviteOnly: inviteOnly,
            refereeSessionIds: Array.from(editorSelectedRefereeSessionIds)
          })
        });
        selectedCampaignId = updated.id;
        closeModal();
        await refreshCampaignData();
        setStatus(`Updated ${updated.name}.`);
      } catch (err) {
        setModalStatus(`Failed to update campaign: ${err.message}`, true);
      }
    }
  }

  if (newCampaignBtn) {
    newCampaignBtn.addEventListener('click', () => {
      if (!authUser) return;
      openModal('new');
    });
  }

  if (editSelectedBtn) {
    editSelectedBtn.addEventListener('click', () => {
      if (!authUser) return;
      const selected = campaignSummaries.find((campaign) => campaign.id === selectedCampaignId) || null;
      if (!selected) return;
      openModal('edit', selected);
    });
  }

  if (modalCancelBtn) {
    modalCancelBtn.addEventListener('click', () => {
      closeModal();
    });
  }

  if (modalSaveBtn) {
    modalSaveBtn.addEventListener('click', () => {
      saveCampaign();
    });
  }

  if (modal) {
    modal.addEventListener('click', (event) => {
      if (event.target !== modal) return;
      closeModal();
    });
  }

  if (campaignNameInput) {
    campaignNameInput.addEventListener('input', () => {
      validateModal();
    });
  }

  if (campaignRulesetSelect) {
    campaignRulesetSelect.addEventListener('change', () => {
      validateModal();
    });
  }

  if (campaignInviteOnlyInput) {
    campaignInviteOnlyInput.addEventListener('change', () => {
      validateModal();
    });
  }

  if (campaignInvitePlayerNameInput) {
    campaignInvitePlayerNameInput.addEventListener('input', () => {
      updateInvitePlayerControls();
    });
    campaignInvitePlayerNameInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        invitePlayerByName();
      }
    });
  }

  if (campaignInvitePlayerButton) {
    campaignInvitePlayerButton.addEventListener('click', () => {
      invitePlayerByName();
    });
  }

  if (campaignClaimTimeoutManualInput) {
    campaignClaimTimeoutManualInput.addEventListener('change', () => {
      syncClaimTimeoutUi();
      validateModal();
    });
  }

  if (campaignClaimTimeoutTimedInput) {
    campaignClaimTimeoutTimedInput.addEventListener('change', () => {
      syncClaimTimeoutUi();
      validateModal();
    });
  }

  if (campaignClaimTimeoutInput) {
    campaignClaimTimeoutInput.addEventListener('input', () => {
      validateModal();
    });
  }

  if (authSignupBtn) {
    authSignupBtn.addEventListener('click', () => {
      openSignupModal();
    });
  }

  if (authLoginBtn) {
    authLoginBtn.addEventListener('click', () => {
      authenticate('/auth/login');
    });
  }

  if (authLogoutBtn) {
    authLogoutBtn.addEventListener('click', () => {
      logout();
    });
  }

  if (authShutdownBtn) {
    authShutdownBtn.addEventListener('click', () => {
      shutdownServer();
    });
  }

  if (authEmailInput) {
    authEmailInput.addEventListener('input', () => setAuthStatus(''));
  }

  if (authPasswordInput) {
    authPasswordInput.addEventListener('input', () => setAuthStatus(''));
  }

  if (authEmailInput) {
    authEmailInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      authPasswordInput?.focus();
    });
  }

  if (authPasswordInput) {
    authPasswordInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      authenticate('/auth/login');
    });
  }

  if (signupModalCancelBtn) {
    signupModalCancelBtn.addEventListener('click', () => {
      closeSignupModal();
    });
  }

  if (signupModalSaveBtn) {
    signupModalSaveBtn.addEventListener('click', () => {
      createAccount();
    });
  }

  if (signupModal) {
    signupModal.addEventListener('click', (event) => {
      if (event.target !== signupModal) return;
      closeSignupModal();
    });
  }

  if (signupEmailInput) {
    signupEmailInput.addEventListener('input', () => validateSignupModal());
  }

  if (signupPasswordInput) {
    signupPasswordInput.addEventListener('input', () => validateSignupModal());
  }

  updateAuthUi();
  refreshAll();
  syncCampaignEventStream();
  window.addEventListener('beforeunload', closeCampaignEventStream);
});
