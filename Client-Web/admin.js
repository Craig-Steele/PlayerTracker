const REFRESH_INTERVAL_MS = 5000;

const {
  APP_ICON_URL,
  updateCampaignHeader
} = window.PlayerTrackerShared || {
  APP_ICON_URL: '/favicon-512.png',
  updateCampaignHeader: () => {}
};

window.addEventListener('DOMContentLoaded', () => {
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
  const signupDisplayNameInput = document.getElementById('admin-signup-display-name');

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

  let availableRulesets = [];
  let campaignSummaries = [];
  let activeCampaignId = null;
  let selectedCampaignId = null;
  let editorMode = null;
  let editorCampaignId = null;
  let editorOriginalName = '';
  let editorOriginalRulesetId = '';
  let refreshToken = 0;
  let authRefreshToken = 0;
  let authUser = null;
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
            iconUrl: APP_ICON_URL
          }
    );
    if (adminActiveSummary) {
      if (!activeCampaign) {
        adminActiveSummary.textContent = 'No campaign selected.';
      } else {
        const label = library?.label || activeCampaign.rulesetLabel || activeCampaign.rulesetId || 'No Conditions';
        adminActiveSummary.textContent = `Active: ${activeCampaign.name} - ${label}`;
      }
    }
  }

  function updateAuthSummary() {
    if (!authSummary) return;
    if (!authUser) {
      authSummary.textContent = 'Not signed in.';
      return;
    }
    const parts = [authUser.email];
    if (authUser.displayName) {
      parts.push(`(${authUser.displayName})`);
    }
    authSummary.textContent = `Signed in as ${parts.join(' ')}`;
  }

  function setCampaignUiEnabled(enabled) {
    if (newCampaignBtn) newCampaignBtn.disabled = !enabled;
    if (editSelectedBtn) editSelectedBtn.disabled = !enabled || !selectedCampaignId;
    if (campaignList) campaignList.toggleAttribute('aria-disabled', !enabled);
    campaignList?.querySelectorAll('.admin-campaign-row').forEach((button) => {
      button.disabled = !enabled;
    });
  }

  function updateAuthUi() {
    updateAuthSummary();
    if (authLogoutBtn) {
      authLogoutBtn.disabled = !authUser;
    }
    if (authShutdownBtn) {
      authShutdownBtn.disabled = !authUser;
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
      meta.textContent = `${ruleset}${campaign.isActive ? ' · Active' : ''}`;

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
    if (editorMode === 'new') {
      return Boolean(name);
    }
    return name !== editorOriginalName || rulesetId !== editorOriginalRulesetId;
  }

  function isEditorValid() {
    if (!campaignNameInput || !campaignRulesetSelect) return false;
    const name = normalizeName(campaignNameInput.value);
    const rulesetId = campaignRulesetSelect.value;
    if (!name) return false;
    if (campaignRulesetSelect.options.length > 0 && !rulesetId) return false;
    if (editorMode === 'new') {
      return !nameExists(name);
    }
    return !nameExists(name, editorCampaignId) || name.toLowerCase() === editorOriginalName.toLowerCase();
  }

  function validateModal() {
    if (!modalSaveBtn) return;
    const valid = isEditorValid();
    const changed = hasEditorChanges();
    modalSaveBtn.disabled = !(valid && changed);
  }

  function openModal(mode, campaign = null) {
    if (!modal || !campaignNameInput || !campaignRulesetSelect) return;
    editorMode = mode;
    editorCampaignId = campaign?.id || null;
    editorOriginalName = campaign?.name || '';
    editorOriginalRulesetId = campaign?.rulesetId || '';

    if (modalTitle) {
      modalTitle.textContent = mode === 'new' ? 'New Campaign' : 'Edit Campaign Details';
    }

    if (modalSummary) {
      modalSummary.textContent = mode === 'new'
        ? 'Create a new campaign record. Activate it later from the list.'
        : `Editing ${campaign?.name || 'Campaign'}.`;
    }

    campaignNameInput.value = campaign?.name || '';
    campaignRulesetSelect.value = campaign?.rulesetId || availableRulesets[0]?.id || 'none';

    setModalStatus('');
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    validateModal();
  }

  function openSignupModal() {
    if (!signupModal) return;
    if (signupEmailInput) {
      signupEmailInput.value = authEmailInput ? authEmailInput.value.trim() : '';
    }
    if (signupPasswordInput) {
      signupPasswordInput.value = '';
    }
    if (signupDisplayNameInput) {
      signupDisplayNameInput.value = '';
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
    const displayName = (signupDisplayNameInput?.value || '').trim();
    return Boolean(email || password || displayName);
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
      authUser = null;
      updateAuthUi();
      setAuthStatus(`Failed to load auth session: ${err.message}`, true);
      return false;
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
      populateRulesetSelect(availableRulesets);
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
          password,
          displayName: null
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
    const displayName = signupDisplayNameInput ? (signupDisplayNameInput.value || '').trim() : '';
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
          password,
          displayName: displayName || null
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
    if (!authUser) return;
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

    const name = normalizeName(campaignNameInput.value);
    const rulesetId = campaignRulesetSelect.value;

    if (editorMode === 'new') {
      try {
        const created = await fetchJson('/campaigns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, rulesetId })
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
          body: JSON.stringify({ name, rulesetId })
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

  if (signupDisplayNameInput) {
    signupDisplayNameInput.addEventListener('input', () => validateSignupModal());
  }

  updateAuthUi();
  refreshAll();
  setInterval(refreshAll, REFRESH_INTERVAL_MS);
});
