const {
  APP_NAME,
  APP_ICON_URL,
  updateCampaignHeader
} = window.PlayerTrackerShared || {
  APP_NAME: 'Tactical Table Top: Initiative',
  APP_ICON_URL: '/favicon-512.png',
  updateCampaignHeader: () => {}
};

const {
  resolveJoinOutcome
} = window.PlayerTrackerJoinState || {
  resolveJoinOutcome: () => ({ state: 'inactive' })
};

const {
  normalizePlayerName,
  sanitizePlayerDisplayName,
  hasRealPlayerName
} = window.PlayerTrackerPlayerName || {
  normalizePlayerName: (value) => (value || '').trim().toLowerCase(),
  sanitizePlayerDisplayName: (value) => {
    const trimmed = (value || '').trim();
    if (!trimmed || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
      return '';
    }
    return trimmed;
  },
  hasRealPlayerName: (value) => {
    const trimmed = (value || '').trim();
    if (!trimmed || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
      return false;
    }
    return trimmed.toLowerCase() !== 'player';
  }
};

function responseErrorMessage(fallback, response, text) {
  const status = response?.status ? `Server returned ${response.status}` : fallback;
  if (!text) return status;
  try {
    const payload = JSON.parse(text);
    return payload?.reason || payload?.message || text || status;
  } catch (_err) {
    return text || status;
  }
}

function accessLabel(campaign) {
  return campaign?.isInviteOnly ? 'Invite only' : 'Open join';
}

window.addEventListener('DOMContentLoaded', () => {
  const campaignNameEl = document.getElementById('join-campaign-name');
  const rulesetIconEl = document.getElementById('join-ruleset-icon');
  const rulesetLinkEl = document.getElementById('join-ruleset-link');
  const rulesetLicenseEl = document.getElementById('join-ruleset-license');
  const rulesetLicenseWrapEl = document.getElementById('join-ruleset-license-wrap');
  const playerNameDisplayEl = document.getElementById('join-player-name-display');
  const playerNameEditBtn = document.getElementById('join-player-name-edit-btn');
  const playerNameCancelBtn = document.getElementById('join-player-name-cancel');
  const form = document.getElementById('join-form');
  const playerNameInput = document.getElementById('join-player-name');
  const continueBtn = document.getElementById('join-continue');
  const statusEl = document.getElementById('join-status');
  const campaignsPanel = document.getElementById('join-campaigns-panel');
  const campaignsListEl = document.getElementById('join-campaign-list');
  const preferredView = new URLSearchParams(window.location.search).get('view');

  const headerNameTargets = [campaignNameEl];
  const headerIconTargets = [rulesetIconEl];
  const headerLinkTargets = [rulesetLinkEl];
  const headerLicenseTargets = [
    { linkEl: rulesetLicenseEl, wrapEl: rulesetLicenseWrapEl }
  ];

  let campaignLoaded = false;
  let restoreCampaigns = [];
  let playerSessionReady = false;
  let currentPlayerName = '';
  let currentPlayerIsReferee = false;
  let editingPlayerName = false;
  let currentCampaign = null;
  let accessDenied = false;
  let campaignEventSource = null;

  function setStatus(message, isError = false) {
    if (!statusEl) return;
    statusEl.textContent = message || '';
    statusEl.classList.toggle('error', Boolean(isError));
  }

  function setJoinEnabled(enabled) {
    if (continueBtn) {
      continueBtn.disabled = !enabled;
    }
    if (playerNameInput) {
      playerNameInput.disabled = !enabled;
    }
  }

  function setCampaignPanelVisible(visible) {
    if (!campaignsPanel) return;
    campaignsPanel.classList.toggle('hidden', !visible);
  }

  function updatePlayerNameDisplay(name) {
    currentPlayerName = sanitizePlayerDisplayName(name) || currentPlayerName || '';
    if (playerNameDisplayEl) {
      playerNameDisplayEl.textContent = currentPlayerName || 'Player';
    }
    if (playerNameInput && !editingPlayerName) {
      playerNameInput.value = currentPlayerName || '';
    }
    if (playerNameEditBtn) {
      playerNameEditBtn.classList.toggle('hidden', !currentPlayerName);
    }
    if (playerNameCancelBtn) {
      playerNameCancelBtn.classList.toggle('hidden', !editingPlayerName);
    }
    if (form) {
      form.classList.toggle('hidden', !editingPlayerName && Boolean(currentPlayerName));
    }
    if (continueBtn) {
      continueBtn.textContent = currentPlayerName ? '💾 Save' : '👋 Join';
    }
    if (!currentPlayerName) {
      setCampaignPanelVisible(false);
    }
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
        await fetchCampaign();
      } catch (_err) {
        // The next server event will retry the refresh.
      }
    };
    source.addEventListener('snapshot', refreshFromCampaignChange);
    source.addEventListener('campaign-updated', refreshFromCampaignChange);
    source.onerror = () => {
      // EventSource retries automatically; the next event will refresh the page state.
    };
  }

  async function maybeForwardToCurrentView() {
    if (!campaignLoaded || !currentCampaign || !currentPlayerName || editingPlayerName) {
      return 'inactive';
    }

    try {
      const membershipsRes = await fetch('/me/campaigns');
      if (!membershipsRes.ok) {
        throw new Error(`Server returned ${membershipsRes.status}`);
      }
      const memberships = await membershipsRes.json();
      const outcome = resolveJoinOutcome({
        campaignLoaded,
        currentCampaign,
        currentPlayerName,
        editingPlayerName,
        memberships,
        hasRefereeAccess: Boolean(currentPlayerIsReferee),
        preferredView
      });

      if (outcome.state === 'denied') {
        accessDenied = true;
        setCampaignPanelVisible(false);
        setStatus(outcome.message, true);
        return 'denied';
      }

      accessDenied = false;
      window.location.replace(outcome.destination);
      return 'forwarded';
    } catch (_err) {
      const outcome = resolveJoinOutcome({
        campaignLoaded,
        currentCampaign,
        currentPlayerName,
        editingPlayerName,
        memberships: [],
        hasRefereeAccess: false,
        preferredView
      });
      accessDenied = true;
      setCampaignPanelVisible(false);
      setStatus(outcome.message, true);
      return 'denied';
    }
  }

  function setPlayerNameEditing(open) {
    editingPlayerName = open;
    updatePlayerNameDisplay(currentPlayerName);
    if (playerNameInput) {
      playerNameInput.placeholder = currentPlayerName ? 'Edit your player name' : 'Enter your player name';
    }
    if (open) {
      setCampaignPanelVisible(false);
    }
    if (open && playerNameInput) {
      playerNameInput.value = currentPlayerName || '';
      playerNameInput.focus();
      playerNameInput.select();
    }
  }

  function renderCampaigns(campaigns) {
    restoreCampaigns = Array.isArray(campaigns) ? campaigns : [];
    if (!campaignsListEl) return;

    campaignsListEl.innerHTML = '';
    if (!restoreCampaigns.length) {
      const empty = document.createElement('div');
      empty.className = 'subtitle';
      empty.textContent = 'No campaign memberships yet.';
      campaignsListEl.appendChild(empty);
      setCampaignPanelVisible(true);
      return;
    }

    restoreCampaigns.forEach((campaign) => {
      const row = document.createElement('div');
      row.className = 'join-campaign-row';

      const nameWrap = document.createElement('div');
      nameWrap.className = 'join-campaign-name-wrap';
      const name = document.createElement('div');
      name.className = 'join-campaign-name';
      name.textContent = campaign.name || 'Campaign';
      nameWrap.appendChild(name);

      const meta = document.createElement('div');
      meta.className = 'join-campaign-meta';
      meta.textContent = `${campaign.rulesetLabel || campaign.rulesetId || 'No Conditions'} · ${campaign.claimTimeoutMinutes < 0 ? 'Explicit release only' : `${campaign.claimTimeoutMinutes || 5}m claim timeout`} · ${accessLabel(campaign)}`;
      nameWrap.appendChild(meta);

      const status = document.createElement('div');
      status.className = campaign.isActive ? 'join-campaign-active' : 'join-campaign-meta';
      status.textContent = campaign.isActive ? 'Current campaign' : 'Joined';

      row.appendChild(nameWrap);
      row.appendChild(status);
      campaignsListEl.appendChild(row);
    });
    setCampaignPanelVisible(true);
  }

  async function loadPlayerCampaigns() {
    try {
      const res = await fetch('/me/campaigns');
      if (!res.ok) {
        if (res.status === 401) {
          renderCampaigns([]);
          return false;
        }
        throw new Error(`Server returned ${res.status}`);
      }
      const campaigns = await res.json();
      renderCampaigns(campaigns);
      return true;
    } catch (_err) {
      renderCampaigns([]);
      return false;
    }
  }

  async function fetchCampaign() {
    try {
      const res = await fetch('/campaign');
      if (!res.ok) {
        if (res.status === 409) {
          campaignLoaded = false;
          updateCampaignHeader(
            {
              nameTargets: headerNameTargets,
              iconTargets: headerIconTargets,
              linkTargets: headerLinkTargets,
              licenseTargets: headerLicenseTargets
            },
            {
              campaignName: null,
              rulesetLabel: '',
              rulesBaseUrl: null,
              licenseUrl: null,
              iconUrl: APP_ICON_URL
            }
          );
          setJoinEnabled(false);
          setStatus('No campaign selected. Ask the server owner to activate one.', true);
          return false;
        }
        throw new Error(`Server returned ${res.status}`);
      }
      const campaign = await res.json();
      const previousCampaignID = currentCampaign?.id || null;
      campaignLoaded = true;
      updateCampaignHeader(
        {
          nameTargets: headerNameTargets,
          iconTargets: headerIconTargets,
          linkTargets: headerLinkTargets,
          licenseTargets: headerLicenseTargets
        },
        {
          campaignName: campaign.name || null,
          rulesetLabel: campaign.rulesetLabel || '',
          rulesBaseUrl: null,
          licenseUrl: null,
          iconUrl: APP_ICON_URL
        }
      );
      currentCampaign = campaign;
      accessDenied = false;
      setJoinEnabled(true);
      if (previousCampaignID && previousCampaignID !== campaign.id) {
        currentPlayerIsReferee = false;
        await restoreSession();
        return true;
      }
      if (currentPlayerName && !editingPlayerName) {
        const forwardState = await maybeForwardToCurrentView();
        if (forwardState === 'forwarded') {
          return true;
        }
      }
      if (!accessDenied && campaign.isInviteOnly) {
        setStatus('Invite-only campaign. Ask the server owner or a referee to add you by name.');
      } else if (!accessDenied) {
        setStatus('');
      }
      return true;
    } catch (err) {
      campaignLoaded = false;
      currentCampaign = null;
      updateCampaignHeader(
        {
          nameTargets: headerNameTargets,
          iconTargets: headerIconTargets,
          linkTargets: headerLinkTargets,
          licenseTargets: headerLicenseTargets
        },
        {
          campaignName: null,
          rulesetLabel: '',
          rulesBaseUrl: null,
          licenseUrl: null,
          iconUrl: APP_ICON_URL
        }
      );
      setJoinEnabled(false);
      setStatus(`Failed to load campaign: ${err.message}`, true);
      return false;
    }
  }

  async function redirectForCurrentSession() {
    try {
      const refereeRes = await fetch('/state?view=referee');
      if (refereeRes.ok) {
        window.location.replace('/referee.html');
        return true;
      }
    } catch (_err) {
      // Fall back to the player page below.
    }
    window.location.replace('/player.html');
    return true;
  }

  async function restoreSession() {
    try {
      const res = await fetch('/player/session');
      if (!res.ok) {
        return false;
      }
      const payload = await res.json();
      const player = payload.player || {};
      const displayName = sanitizePlayerDisplayName(player.displayName);
      currentPlayerIsReferee = Boolean(player.isReferee);
      if (displayName) {
        localStorage.setItem('playerLoginName', displayName);
        localStorage.setItem('ownerName', displayName);
        if (player.id) {
          localStorage.setItem('playerId', player.id);
        }
      }
      playerSessionReady = true;
      accessDenied = false;
      updatePlayerNameDisplay(displayName);
      await loadPlayerCampaigns();
      const forwardState = await maybeForwardToCurrentView();
      if (forwardState === 'inactive') {
        setStatus('Welcome back. Join the active campaign or edit your player name.');
      }
      return true;
    } catch (_err) {
      return false;
    }
  }

  async function joinPlayerSession(displayName) {
    const trimmedName = sanitizePlayerDisplayName(displayName);
    if (!trimmedName) {
      throw new Error('Enter a real player name.');
    }
    const res = await fetch('/player/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: trimmedName
      })
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(responseErrorMessage('Join failed.', res, text));
    }
    const payload = await res.json();
    const player = payload.player || {};
    const joinedName = sanitizePlayerDisplayName(player.displayName) || trimmedName;
    currentPlayerIsReferee = Boolean(player.isReferee);
    if (player.id) {
      localStorage.setItem('playerId', player.id);
    }
    localStorage.setItem('playerLoginName', joinedName);
    localStorage.setItem('ownerName', joinedName);
    playerSessionReady = true;
    updatePlayerNameDisplay(joinedName);
    return payload;
  }

  async function handleJoinSubmit(event) {
    event.preventDefault();
    if (!campaignLoaded) {
      setStatus('No campaign is currently selected.', true);
      return;
    }
    const enteredName = sanitizePlayerDisplayName(playerNameInput?.value);
    if (!hasRealPlayerName(enteredName)) {
      setStatus('Enter a real player name to continue.', true);
      playerNameInput?.focus();
      return;
    }

    setStatus('Joining...');
    setJoinEnabled(false);
    try {
      if (playerSessionReady && currentPlayerName) {
        const res = await fetch('/player/session', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ displayName: enteredName })
        });
        if (!res.ok) {
          if (res.status === 401) {
            const payload = await joinPlayerSession(enteredName);
            const player = payload.player || {};
            if (player.displayName) {
              localStorage.setItem('ownerName', sanitizePlayerDisplayName(player.displayName));
            }
          } else {
            throw new Error(responseErrorMessage('Save failed.', res, await res.text()));
          }
        } else {
          const payload = await res.json();
          const player = payload.player || {};
          const savedName = sanitizePlayerDisplayName(player.displayName) || enteredName;
          currentPlayerIsReferee = Boolean(player.isReferee);
          if (player.id) {
            localStorage.setItem('playerId', player.id);
          }
          localStorage.setItem('playerLoginName', savedName);
          localStorage.setItem('ownerName', savedName);
          currentPlayerName = savedName;
          accessDenied = false;
        }
      } else {
        const payload = await joinPlayerSession(enteredName);
        const player = payload.player || {};
        currentPlayerIsReferee = Boolean(player.isReferee);
        if (player.displayName) {
          localStorage.setItem('ownerName', sanitizePlayerDisplayName(player.displayName));
        }
        accessDenied = false;
      }
      await loadPlayerCampaigns();
      setPlayerNameEditing(false);
      const forwardState = await maybeForwardToCurrentView();
      if (forwardState === 'inactive') {
        if (!accessDenied) {
          setStatus('Join the active campaign or edit your player name.');
        }
        setCampaignPanelVisible(true);
      }
    } catch (err) {
      setStatus(`Join failed: ${err.message}`, true);
      setJoinEnabled(true);
      playerNameInput?.focus();
      playerNameInput?.select();
    }
  }

  async function initJoinPage() {
    await fetchCampaign();
    syncCampaignEventStream();
    const savedName =
      sanitizePlayerDisplayName(localStorage.getItem('ownerName')) ||
      sanitizePlayerDisplayName(localStorage.getItem('playerDisplayName')) ||
      sanitizePlayerDisplayName(localStorage.getItem('playerLoginName')) ||
      sanitizePlayerDisplayName(localStorage.getItem('playerName'));
    if (savedName && playerNameInput) {
      playerNameInput.value = savedName;
    }
    if (await restoreSession()) {
      setPlayerNameEditing(false);
      return;
    }
    if (savedName) {
      try {
        setStatus('Restoring player session...');
        await joinPlayerSession(savedName);
        await loadPlayerCampaigns();
        setPlayerNameEditing(false);
        const forwardState = await maybeForwardToCurrentView();
        if (forwardState === 'inactive') {
          if (!accessDenied) {
            setCampaignPanelVisible(true);
            setStatus('Join the active campaign or edit your player name.');
          }
      }
        return;
      } catch (err) {
        setStatus(`Failed to restore player session: ${err.message}`, true);
      }
    }

    setPlayerNameEditing(true);
    if (playerNameInput) {
      playerNameInput.focus();
      playerNameInput.select();
    }
  }

  if (playerNameEditBtn) {
    playerNameEditBtn.addEventListener('click', () => {
      setPlayerNameEditing(true);
    });
  }

  if (playerNameCancelBtn) {
    playerNameCancelBtn.addEventListener('click', () => {
      if (!currentPlayerName) {
        if (playerNameInput) {
          playerNameInput.focus();
          playerNameInput.select();
        }
        return;
      }
      setPlayerNameEditing(false);
      setStatus('Join the active campaign or edit your player name.');
    });
  }

  window.addEventListener('beforeunload', closeCampaignEventStream);

  if (form) {
    form.addEventListener('submit', handleJoinSubmit);
  }

  initJoinPage();
});
