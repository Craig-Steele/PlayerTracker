const {
  APP_NAME,
  APP_ICON_URL,
  updateCampaignHeader
} = window.PlayerTrackerShared || {
  APP_NAME: 'Roll4Initiative',
  APP_ICON_URL: '/favicon-512.png',
  updateCampaignHeader: () => {}
};

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    (value || '').trim()
  );
}

function normalizePlayerName(value) {
  return (value || '').trim().toLowerCase();
}

function sanitizePlayerDisplayName(value) {
  const trimmed = (value || '').trim();
  if (!trimmed || isUuidLike(trimmed)) {
    return '';
  }
  return trimmed;
}

function hasRealPlayerName(value) {
  const trimmed = sanitizePlayerDisplayName(value);
  if (!trimmed) return false;
  return normalizePlayerName(trimmed) !== 'player';
}

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

window.addEventListener('DOMContentLoaded', () => {
  const campaignNameEl = document.getElementById('join-campaign-name');
  const rulesetIconEl = document.getElementById('join-ruleset-icon');
  const rulesetLinkEl = document.getElementById('join-ruleset-link');
  const rulesetLicenseEl = document.getElementById('join-ruleset-license');
  const rulesetLicenseWrapEl = document.getElementById('join-ruleset-license-wrap');
  const form = document.getElementById('join-form');
  const playerNameInput = document.getElementById('join-player-name');
  const continueBtn = document.getElementById('join-continue');
  const statusEl = document.getElementById('join-status');

  const headerNameTargets = [campaignNameEl];
  const headerIconTargets = [rulesetIconEl];
  const headerLinkTargets = [rulesetLinkEl];
  const headerLicenseTargets = [
    { linkEl: rulesetLicenseEl, wrapEl: rulesetLicenseWrapEl }
  ];

  let campaignLoaded = false;

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
          licenseUrl: null
        }
      );
      setJoinEnabled(true);
      setStatus('');
      return true;
    } catch (err) {
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
      const loginName = sanitizePlayerDisplayName(player.loginName);
      const displayName = sanitizePlayerDisplayName(player.displayName);
      if (loginName) {
        localStorage.setItem('playerLoginName', loginName);
      }
      if (displayName) {
        localStorage.setItem('ownerName', displayName);
        if (player.id) {
          localStorage.setItem('playerId', player.id);
        }
      }
      await redirectForCurrentSession();
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
      body: JSON.stringify({ displayName: trimmedName })
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(responseErrorMessage('Join failed.', res, text));
    }
    const payload = await res.json();
    const player = payload.player || {};
    const loginName = sanitizePlayerDisplayName(player.loginName) || trimmedName;
    const joinedName = sanitizePlayerDisplayName(player.displayName) || loginName;
    if (player.id) {
      localStorage.setItem('playerId', player.id);
    }
    localStorage.setItem('playerLoginName', loginName);
    localStorage.setItem('ownerName', joinedName);
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
      const payload = await joinPlayerSession(enteredName);
      const player = payload.player || {};
      if (player.displayName) {
        localStorage.setItem('ownerName', sanitizePlayerDisplayName(player.displayName));
      }
      await redirectForCurrentSession();
    } catch (err) {
      setStatus(`Join failed: ${err.message}`, true);
      setJoinEnabled(true);
      playerNameInput?.focus();
      playerNameInput?.select();
    }
  }

  async function initJoinPage() {
    if (await restoreSession()) {
      return;
    }

    await fetchCampaign();
    const savedName =
      sanitizePlayerDisplayName(localStorage.getItem('playerLoginName')) ||
      sanitizePlayerDisplayName(localStorage.getItem('playerName'));
    if (savedName && playerNameInput) {
      playerNameInput.value = savedName;
    }
    if (playerNameInput) {
      playerNameInput.focus();
      if (!savedName) {
        playerNameInput.select();
      }
    }
  }

  if (form) {
    form.addEventListener('submit', handleJoinSubmit);
  }

  initJoinPage();
});
