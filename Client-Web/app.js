// Shared state
let lastStateJson = null;
let skipRefresh = false;
let loadStateInFlight = false;
let loadStateRefreshQueued = false;

const {
  APP_NAME,
  APP_ICON_URL,
  QR_CODE_SIZE,
  isAdminHost,
  rollStandardDie,
  formatInitiative,
  updateCampaignHeader
} = window.PlayerTrackerShared || {
  APP_NAME: 'Roll4Initiative',
  APP_ICON_URL: '/favicon-512.png',
  QR_CODE_SIZE: 96,
  isAdminHost: () => false,
  rollStandardDie: () => null,
  formatInitiative: () => 'X',
  updateCampaignHeader: () => {}
};
const {
  normalizeConditionEntry,
  createConditionLink,
  formatEncounterStateText,
  healthStatusLabel,
  orderedEncounterStats,
  encounterStatusInfo,
  applyEncounterHealthClasses,
  formatEncounterStatsText,
  buildEncounterConditionsList,
  createEmptyEncounterRow
} = window.PlayerTrackerEncounter || {
  normalizeConditionEntry: () => null,
  createConditionLink: () => null,
  formatEncounterStateText: () => 'Encounter: New',
  healthStatusLabel: () => '',
  orderedEncounterStats: (stats) => (Array.isArray(stats) ? stats : []),
  encounterStatusInfo: () => null,
  applyEncounterHealthClasses: () => {},
  formatEncounterStatsText: () => '',
  buildEncounterConditionsList: () => null,
  createEmptyEncounterRow: (colSpan, text) => {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = colSpan;
    td.textContent = text || '(no players yet)';
    tr.appendChild(td);
    return tr;
  }
};
const { filterClaimableCharacters } = window.PlayerTrackerClaimableCharacters || {
  filterClaimableCharacters: (characters) =>
    Array.isArray(characters)
      ? characters.filter((character) => !character?.isReferee && !character?.claimedSessionId)
      : []
};
const { collectStatPayloadFromInputs } = window.PlayerTrackerStatInputs || {
  collectStatPayloadFromInputs: () => []
};
const {
  SESSION_EXPIRED_MESSAGE,
  resolvePlayerNameSaveOutcome
} = window.Roll4InitiativePlayerNameSave || {
  SESSION_EXPIRED_MESSAGE: 'Player session expired. Please rejoin from the join page.',
  resolvePlayerNameSaveOutcome: ({ status, responsePayload, enteredName }) => {
    if (status === 401) {
      return {
        kind: 'session-expired',
        message: 'Player session expired. Please rejoin from the join page.'
      };
    }
    if (status < 200 || status >= 300) {
      return {
        kind: 'error',
        message: `Server returned ${status}`
      };
    }
    const player = responsePayload?.player || {};
    return {
      kind: 'saved',
      playerId: player.id || '',
      displayName: player.displayName || enteredName || '',
      message: ''
    };
  }
};
const AUTO_SAVE_DELAY_MS = 600;
const LOCAL_DRAFT_PREFIX = 'characterDrafts:';

const EMPTY_CONDITION_SET = {
  id: 'none',
  label: '',
  rulesBaseUrl: '',
  conditions: []
};

const campaignHeaderNameTargets = [];
const campaignHeaderIconTargets = [];
const campaignHeaderLinkTargets = [];
const campaignHeaderLicenseTargets = [];
const APP_JS_VERSION = '10';

function normalizePlayerName(name) {
  return (name || '').trim().toLowerCase();
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    (value || '').trim()
  );
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

function isDisplayPath() {
  const path = window.location.pathname || '';
  return path === '/display.html' || path.endsWith('/display.html');
}

function isJoinPage() {
  const path = window.location.pathname || '';
  return path === '/index.html' || path === '/' || path.endsWith('/index.html');
}

const shouldRedirectToDisplay =
  isAdminHost() &&
  !isDisplayPath() &&
  window.location.pathname === '/';

if (shouldRedirectToDisplay) {
  window.location.replace('/display.html');
}

// Render a QR code for a given URL into #qr-container
function renderQrCode(url) {
  const container = document.getElementById('qr-container');
  if (!container || typeof QRCode === 'undefined') return;

  // Clear any previous QR
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  new QRCode(container, {
    text: url,
    width: QR_CODE_SIZE,
    height: QR_CODE_SIZE
  });
}

// Fetch the available join addresses and show the selected URL as a QR code.
async function showServerIP() {
  try {
    const res = await fetch('/server-ip');
    if (!res.ok) return;

    const json = await res.json();
    const selector = document.getElementById('ip-selector');
    const localIP = typeof json.localIP === 'string' ? json.localIP.trim() : '';
    const publicIP = typeof json.publicIP === 'string' ? json.publicIP.trim() : '';
    const localURL = localIP && localIP !== 'unknown' ? `http://${localIP}:8080` : null;
    const publicURL = publicIP && publicIP !== 'unknown' ? `http://${publicIP}:7531` : null;

    if (!localURL && !publicURL) {
      if (selector) {
        selector.classList.add('hidden');
      }
      return;
    }

    const availableOptions = [];
    if (localURL) availableOptions.push({ label: `Local: ${localURL}`, url: localURL, host: localIP });
    if (publicURL) availableOptions.push({ label: `Public: ${publicURL}`, url: publicURL, host: publicIP });
    const currentHost = (window.location.hostname || '').trim();
    const matchingOption = availableOptions.find((option) => option.host === currentHost);
    let selectedURL = (matchingOption || availableOptions[0])?.url || null;

    function updateSelectedAddress() {
      if (!selectedURL) return;
      renderQrCode(selectedURL);
    }

    if (selector) {
      selector.innerHTML = '';
      availableOptions.forEach(({ label, url }) => {
        const option = document.createElement('option');
        option.value = url;
        option.textContent = label;
        selector.appendChild(option);
      });
      selector.value = selectedURL;
      selector.classList.toggle('hidden', availableOptions.length < 2);
      selector.onchange = () => {
        selectedURL = selector.value;
        updateSelectedAddress();
      };
    }
    updateSelectedAddress();
  } catch (err) {
    console.error('Failed to fetch server IP:', err);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('player-form');
  const statusDiv = document.getElementById('status');
  const playersBody = document.getElementById('players-body');

  const adminToolbar = document.getElementById('admin-toolbar');
  const clearBtn = document.getElementById('clear');

  const qrContainer = document.getElementById('qr-container'); // if you have it

  const ownerInput = document.getElementById('owner-name');
  const playerNameEdit = document.getElementById('player-name-edit');
  const playerNameInput = document.getElementById('player-name-input');
  const playerNameEditBtn = document.getElementById('edit-player-name');
  const playerNameSaveBtn = document.getElementById('player-name-save');
  const playerNameCancelBtn = document.getElementById('player-name-cancel');
  const playerNameNudge = document.getElementById('player-name-nudge');
  const nameInput = document.getElementById('name');
  const useAppInitiativeRollInput = document.getElementById('use-app-initiative-roll');
  const initiativeBonusInput = document.getElementById('initiative-bonus');
  const initiativeBonusWrap = document.getElementById('initiative-bonus-wrap');
  const statsFields = document.getElementById('stats-fields');
  const currentStatsInputs = document.getElementById('current-stats-inputs');
  const revealStatsInput = document.getElementById('reveal-stats');
  const autoSkipTurnInput = document.getElementById('auto-skip-turn');
  const currentActor = document.getElementById('current-actor');
  const healthHeading = document.getElementById('health-heading');
  const conditionGrid = document.getElementById('conditions-grid');
  const selectedConditionsWrap = document.getElementById('selected-conditions');
  const conditionFilterInput = document.getElementById('condition-filter');
  const conditionsCharacter = document.getElementById('conditions-character');
  const campaignNameLabel = document.getElementById('campaign-name');
  const playerCampaignName = document.getElementById('player-campaign-name');
  const displayCampaignName = document.getElementById('display-campaign-name');
  const playerCardPlayerName = document.getElementById('player-card-player-name');
  const playerEncounterState = document.getElementById('player-encounter-state');
  const displayEncounterState = document.getElementById('display-encounter-state');
  const playerRulesetLink = document.getElementById('player-ruleset-link');
  const playerRulesetLicense = document.getElementById('player-ruleset-license');
  const playerRulesetLicenseWrap = document.getElementById('player-ruleset-license-wrap');
  const displayRulesetLink = document.getElementById('display-ruleset-link');
  const displayRulesetLicense = document.getElementById('display-ruleset-license');
  const displayRulesetLicenseWrap = document.getElementById('display-ruleset-license-wrap');
  const rulesetLink = document.getElementById('ruleset-link');
  const rulesetLicense = document.getElementById('ruleset-license');
  const rulesetLicenseWrap = document.getElementById('ruleset-license-wrap');
  const rulesetIcon = document.getElementById('ruleset-icon');
  const playerRulesetIcon = document.getElementById('player-ruleset-icon');
  const displayRulesetIcon = document.getElementById('display-ruleset-icon');
  const characterList = document.getElementById('character-list');
  const claimableCharacterPanel = document.getElementById('claimable-character-panel');
  const claimableCharacterList = document.getElementById('claimable-character-list');
  const addCharacterBtn = document.getElementById('character-add');
  const removeCharacterBtn = document.getElementById('character-remove');
  const addForm = document.getElementById('add-character-form');
  const addNameInput = document.getElementById('add-name');
  const addUseAppInitiativeRollInput = document.getElementById('add-use-app-initiative-roll');
  const addInitiativeBonusInput = document.getElementById('add-initiative-bonus');
  const addInitiativeBonusWrap = document.getElementById('add-initiative-bonus-wrap');
  const addRevealStatsInput = document.getElementById('add-reveal-stats');
  const addAutoSkipTurnInput = document.getElementById('add-auto-skip-turn');
  const addStatsFields = document.getElementById('add-stats-fields');
  const addCurrentStats = document.getElementById('add-current-stats');
  const addSaveBtn = document.getElementById('add-save');
  const addCancelBtn = document.getElementById('add-cancel');
  const detailsToggles = document.querySelector('.details-toggles');
  const detailsToggle = document.getElementById('details-toggle');
  const detailsPanel = document.getElementById('details-panel');
  const detailPanel = document.querySelector('.detail-panel');
  const conditionsToggle = document.getElementById('conditions-toggle');
  const conditionsPanel = document.getElementById('conditions-panel');
  const initiativePanel = document.getElementById('initiative-panel');
  const initiativeEditorInput = document.getElementById('initiative-editor-input');
  const initiativeSaveBtn = document.getElementById('initiative-save');
  const initiativeCancelBtn = document.getElementById('initiative-cancel');
  const initiativeClearBtn = document.getElementById('initiative-clear');
  const initiativeDialogTitle = document.getElementById('initiative-dialog-title');
  const conditionsSaveBtn = document.getElementById('conditions-save');
  const conditionsCancelBtn = document.getElementById('conditions-cancel');
  const detailsSaveBtn = document.getElementById('details-save');
  const detailsCancelBtn = document.getElementById('details-cancel');
  const playerListSection = document.querySelector('.player-list');
  const playerTable = playerListSection ? playerListSection.querySelector('table') : null;
  const characterListActions = document.querySelector('.character-list-actions');
  const releaseCharacterBtn = document.getElementById('character-release');
  const characterOverflowToggle = document.getElementById('character-overflow-toggle');
  const characterOverflowMenu = document.getElementById('character-overflow-menu');
  const selectionToolbarAnchor = document.getElementById('player-selection-toolbar-anchor');

  let selectedConditions = new Set();
  let conditionsDirty = false;
  let lastConditionsSignatureFromState = null;
  let conditionLibrary = [];
  let conditionLookup = new Map();
  let conditionLibraryLabel = '';
  let myCharacters = [];
  let selectedCharacterId = null;
  let formDirty = false;
  let currentTurnId = null;
  let lastTurnId = null;
  let isEditingForm = false;
  let currentCampaignName = '';
  let currentRulesetId = '';
  let encounterState = 'new';
  let statKeys = ['HP'];
  let playerNameRequired = false;
  let allowNegativeHealth = false;
  let supportsTempHp = false;
  let currentStandardDie = null;
  let currentPlayerSessionId = '';
  let statInputs = new Map();
  let addStatInputs = new Map();
  const perCharacterSaveTimers = new Map();
  let isCreatingCharacter = false;
  let conditionsPanelOpen = false;
  let initiativeEditorCharacterId = null;
  let currentCampaignId = '';
  let claimableCharacters = [];
  const campaignLiveStream = window.PlayerTrackerLiveStream?.createCampaignLiveStream?.({
    getCampaignId: () => currentCampaignId,
    refresh: async () => {
      const hasActiveCampaign = await loadCampaign();
      if (hasActiveCampaign) {
        await loadState();
      }
    },
    shouldSkipRefresh: () => skipRefresh,
    consumeSkipRefresh: () => {
      skipRefresh = false;
    }
  }) || {
    start() {},
    stop() {},
    refresh() {
      return Promise.resolve();
    },
    sync() {},
    close() {}
  };

  campaignHeaderNameTargets.push(campaignNameLabel, playerCampaignName, displayCampaignName);
  campaignHeaderIconTargets.push(rulesetIcon, playerRulesetIcon, displayRulesetIcon);
  campaignHeaderLinkTargets.push(rulesetLink, playerRulesetLink, displayRulesetLink);
  campaignHeaderLicenseTargets.push(
    { linkEl: rulesetLicense, wrapEl: rulesetLicenseWrap },
    { linkEl: playerRulesetLicense, wrapEl: playerRulesetLicenseWrap },
    { linkEl: displayRulesetLicense, wrapEl: displayRulesetLicenseWrap }
  );

const displayOnly = isDisplayPath();
const viewMode = new URLSearchParams(window.location.search).get('view');
const playerPath = (window.location.pathname || '').endsWith('/player.html');
const preferPlayerView = viewMode === 'player' || playerPath;
const hideTurnTable = !displayOnly && viewMode === 'B';
  if (playerTable) {
    playerTable.style.display = hideTurnTable ? 'none' : '';
  }
  if (characterListActions) {
    characterListActions.style.display = 'flex';
    characterListActions.style.flexWrap = 'nowrap';
    characterListActions.style.justifyContent = 'flex-start';
    characterListActions.style.alignItems = 'center';
    characterListActions.style.gap = '0.5rem';
    characterListActions.querySelectorAll('button').forEach((button) => {
      button.style.width = 'auto';
      button.style.flex = '0 0 auto';
    });
  }

  function logDisplayForbidden(context) {
    if (!displayOnly) return;
    console.warn(`[display] ${context}: 403 Forbidden`);
  }

  function setConditionsPanelOpen(open) {
    if (!conditionsToggle || !conditionsPanel) return;
    conditionsPanelOpen = open;
    if (open && detailsToggle && detailsPanel) {
      detailsPanel.classList.remove('details-panel-open');
      detailsPanel.classList.add('details-panel-collapsed');
      detailsToggle.setAttribute('aria-expanded', 'false');
      detailsPanel.setAttribute('aria-hidden', 'true');
    }
    conditionsPanel.classList.toggle('hidden', !open);
    conditionsPanel.classList.toggle('conditions-panel-open', open);
    conditionsToggle.setAttribute('aria-expanded', open.toString());
    conditionsPanel.setAttribute('aria-hidden', (!open).toString());
  }

  function revertSelectedConditions() {
    if (!selectedCharacterId) return;
    const current = myCharacters.find((character) => character.id === selectedCharacterId);
    applySelectedConditions(current?.conditions || []);
    statusDiv.textContent = '';
  }

  function revertSelectedCharacterDetails() {
    if (!selectedCharacterId) return;
    const current = myCharacters.find((character) => character.id === selectedCharacterId);
    if (!current) {
      clearCharacterSelection();
      return;
    }
    nameInput.value = current.name || '';
    if (revealStatsInput) {
      revealStatsInput.checked = Boolean(current.revealStats);
    }
    if (autoSkipTurnInput) {
      autoSkipTurnInput.checked = Boolean(current.autoSkipTurn);
    }
    if (useAppInitiativeRollInput) {
      useAppInitiativeRollInput.checked = current.useAppInitiativeRoll !== false;
    }
    if (initiativeBonusInput) {
      initiativeBonusInput.value = Number.isFinite(current.initiativeBonus) ? current.initiativeBonus : '0';
    }
    updateInitiativeBonusAvailability();
    formDirty = false;
    updateDraftFromForm();
    statusDiv.textContent = '';
  }

  function confirmDiscardDetailsChanges() {
    if (!formDirty) return true;
    const confirmed = confirm('Discard unsaved detail changes?');
    if (confirmed) {
      revertSelectedCharacterDetails();
    }
    return confirmed;
  }

  function confirmDiscardConditionChanges() {
    if (!conditionsDirty) return true;
    const confirmed = confirm('Discard unsaved condition changes?');
    if (confirmed) {
      revertSelectedConditions();
    }
    return confirmed;
  }

  function updateConditionsAvailability() {
    const hasCharacter = Boolean(selectedCharacterId);
    if (detailsToggles) {
      detailsToggles.classList.toggle('conditions-hidden', !hasCharacter);
    }
    if (!hasCharacter) {
      conditionsPanelOpen = false;
      if (detailsPanel && detailsToggle) {
        detailsPanel.classList.remove('details-panel-open');
        detailsPanel.classList.add('details-panel-collapsed');
        detailsToggle.setAttribute('aria-expanded', 'false');
        detailsPanel.setAttribute('aria-hidden', 'true');
      }
      if (conditionsPanel && conditionsToggle) {
        conditionsPanel.classList.remove('conditions-panel-open');
        conditionsPanel.classList.add('hidden');
        conditionsToggle.setAttribute('aria-expanded', 'false');
        conditionsPanel.setAttribute('aria-hidden', 'true');
      }
      return;
    }
    setConditionsPanelOpen(conditionsPanelOpen);
  }

  function updateReleaseButtonState() {
    if (!releaseCharacterBtn) return;
    const selected = selectedCharacterId
      ? myCharacters.find((character) => character.id === selectedCharacterId)
      : null;
    const canRelease = Boolean(selected && selected.claimedSessionId === currentPlayerSessionId);
    releaseCharacterBtn.classList.toggle('hidden', !canRelease);
    releaseCharacterBtn.disabled = !canRelease;
    releaseCharacterBtn.setAttribute('aria-disabled', (!canRelease).toString());
    if (removeCharacterBtn) {
      const canRemove = Boolean(selected);
      removeCharacterBtn.disabled = !canRemove;
      removeCharacterBtn.setAttribute('aria-disabled', (!canRemove).toString());
      removeCharacterBtn.classList.toggle('hidden', !canRemove);
    }
    if (characterOverflowToggle) {
      const hasSelection = Boolean(selected);
      characterOverflowToggle.classList.toggle('hidden', !hasSelection);
      characterOverflowToggle.disabled = !hasSelection;
      characterOverflowToggle.setAttribute('aria-disabled', (!hasSelection).toString());
    }
    if (!selected) {
      closeCharacterOverflowMenu();
    }
  }

  function closeCharacterOverflowMenu() {
    if (!characterOverflowMenu || !characterOverflowToggle) return;
    characterOverflowMenu.classList.add('hidden');
    characterOverflowMenu.setAttribute('aria-hidden', 'true');
    characterOverflowToggle.setAttribute('aria-expanded', 'false');
  }

  function openCharacterOverflowMenu() {
    if (!characterOverflowMenu || !characterOverflowToggle) return;
    characterOverflowMenu.classList.remove('hidden');
    characterOverflowMenu.setAttribute('aria-hidden', 'false');
    characterOverflowToggle.setAttribute('aria-expanded', 'true');
  }

  function toggleCharacterOverflowMenu() {
    if (!characterOverflowMenu || !characterOverflowToggle) return;
    const isOpen = !characterOverflowMenu.classList.contains('hidden');
    if (isOpen) {
      closeCharacterOverflowMenu();
    } else {
      openCharacterOverflowMenu();
    }
  }

  function updatePlayerEntryGate() {
    const ownerName = getOwnerName();
    playerNameRequired = !ownerName;
    if (playerNameNudge) {
      playerNameNudge.classList.toggle('hidden', Boolean(ownerName));
    }
    if (playerNameInput) {
      playerNameInput.readOnly = Boolean(ownerName);
      playerNameInput.placeholder = ownerName ? '' : 'Enter your player name';
    }
    if (playerNameEditBtn) {
      playerNameEditBtn.classList.toggle('hidden', !ownerName);
    }
    if (playerNameCancelBtn) {
      playerNameCancelBtn.classList.toggle('hidden', !ownerName);
    }
    if (playerNameEdit) {
      playerNameEdit.classList.toggle('visible', !ownerName);
    }
    if (characterListActions) {
      characterListActions.querySelectorAll('button').forEach((button) => {
        button.disabled = !ownerName;
        button.setAttribute('aria-disabled', (!ownerName).toString());
      });
    }
    if (detailsToggle) {
      detailsToggle.disabled = !ownerName;
      detailsToggle.setAttribute('aria-disabled', (!ownerName).toString());
    }
    if (conditionsToggle) {
      conditionsToggle.disabled = !ownerName;
      conditionsToggle.setAttribute('aria-disabled', (!ownerName).toString());
    }
    updateReleaseButtonState();
    if (!ownerName && playerNameInput) {
      playerNameInput.focus();
      playerNameInput.select();
    }
  }

  function updatePlayerNameDisplay() {
    if (!playerNameInput) return;
    const ownerName = getOwnerName();
    playerNameInput.value = ownerName ? ownerName : 'Player';
    playerNameInput.classList.toggle('player-name-placeholder', !ownerName);
    document.body.classList.toggle('no-player-name', !ownerName);
    updatePlayerEntryGate();
    if (playerCardPlayerName) {
      playerCardPlayerName.textContent = `Player: ${ownerName || 'Player'}`;
    }
    updateConditionsAvailability();
    updateWindowTitle();
  }

  function updateWindowTitle() {
    const campaignName = currentCampaignName ? currentCampaignName.trim() : '';
    const ownerName = getOwnerName();
    if (!campaignName) {
      document.title = APP_NAME;
      return;
    }
    if (displayOnly) {
      document.title = campaignName;
      return;
    }
    document.title = `${campaignName} - ${ownerName || 'Player'}`;
  }

  function updateEncounterStateDisplay(round = 1, currentTurnPlayer = null, isMineTurn = false) {
    const encounterText = formatEncounterStateText(encounterState, round, currentTurnPlayer);
    if (playerEncounterState) {
      playerEncounterState.classList.toggle('player-encounter-state-mine', Boolean(isMineTurn));
      playerEncounterState.textContent = encounterText;
    }
    if (displayEncounterState) {
      displayEncounterState.classList.remove('player-encounter-state-mine');
      displayEncounterState.textContent = encounterText;
    }
  }

  // Admin UI: show/hide toolbar & IP banner/QR
  if (displayOnly) {
    if (adminToolbar) adminToolbar.style.display = 'none';
    if (detailPanel) detailPanel.style.display = 'none';
    if (playerNameEdit) playerNameEdit.style.display = 'none';
    document.body.classList.add('display-only');
    showServerIP();
  } else {
    if (adminToolbar) adminToolbar.style.display = 'none';
    if (qrContainer) qrContainer.innerHTML = '';
  }

  updatePlayerNameDisplay();
  updateInitiativeBonusAvailability();
  updateAddInitiativeBonusAvailability();

  if (nameInput) {
    nameInput.addEventListener('input', () => {
      formDirty = true;
      updateDraftFromForm();
    });
  }

  function updateInitiativeBonusAvailability() {
    if (!initiativeBonusInput || !initiativeBonusWrap) return;
    const enabled = !useAppInitiativeRollInput || useAppInitiativeRollInput.checked;
    initiativeBonusInput.disabled = !enabled;
    initiativeBonusWrap.classList.toggle('disabled', !enabled);
  }

  function updateAddInitiativeBonusAvailability() {
    if (!addInitiativeBonusInput || !addInitiativeBonusWrap) return;
    const enabled = !addUseAppInitiativeRollInput || addUseAppInitiativeRollInput.checked;
    addInitiativeBonusInput.disabled = !enabled;
    addInitiativeBonusWrap.classList.toggle('disabled', !enabled);
  }

  if (useAppInitiativeRollInput) {
    useAppInitiativeRollInput.addEventListener('change', () => {
      formDirty = true;
      updateInitiativeBonusAvailability();
      updateDraftFromForm();
    });
  }

  if (initiativeBonusInput) {
    initiativeBonusInput.addEventListener('input', () => {
      formDirty = true;
      updateDraftFromForm();
    });
  }

  if (addUseAppInitiativeRollInput) {
    addUseAppInitiativeRollInput.addEventListener('change', () => {
      updateAddInitiativeBonusAvailability();
    });
  }

  if (revealStatsInput) {
    revealStatsInput.addEventListener('change', () => {
      formDirty = true;
      updateDraftFromForm();
    });
  }
  if (autoSkipTurnInput) {
    autoSkipTurnInput.addEventListener('change', () => {
      formDirty = true;
      updateDraftFromForm();
    });
  }

  if (form) {
    form.addEventListener('focusin', () => {
      isEditingForm = true;
    });
    form.addEventListener('focusout', () => {
      if (!form.contains(document.activeElement)) {
        isEditingForm = false;
      }
    });
  }

  if (detailsToggle && detailsPanel) {
    detailsToggle.addEventListener('click', () => {
      const isOpen =
        detailsPanel.classList.contains('details-panel-open') &&
        !detailsPanel.classList.contains('hidden');
      if (isOpen) {
        if (!confirmDiscardDetailsChanges()) return;
      } else if (conditionsToggle && conditionsPanel && conditionsPanel.classList.contains('conditions-panel-open')) {
        if (!confirmDiscardConditionChanges()) return;
        setConditionsPanelOpen(false);
      }
      detailsPanel.classList.toggle('hidden', isOpen);
      detailsPanel.classList.toggle('details-panel-open', !isOpen);
      detailsPanel.classList.toggle('details-panel-collapsed', isOpen);
      detailsToggle.setAttribute('aria-expanded', (!isOpen).toString());
      detailsPanel.setAttribute('aria-hidden', isOpen.toString());
    });
  }

  if (conditionsToggle && conditionsPanel) {
    conditionsToggle.addEventListener('click', () => {
      const isOpen =
        conditionsPanel.classList.contains('conditions-panel-open') &&
        !conditionsPanel.classList.contains('hidden');
      if (isOpen) {
        if (!confirmDiscardConditionChanges()) return;
      } else if (detailsToggle && detailsPanel && detailsPanel.classList.contains('details-panel-open')) {
        if (!confirmDiscardDetailsChanges()) return;
        detailsPanel.classList.remove('details-panel-open');
        detailsPanel.classList.add('details-panel-collapsed');
        detailsPanel.classList.add('hidden');
        detailsToggle.setAttribute('aria-expanded', 'false');
        detailsPanel.setAttribute('aria-hidden', 'true');
      }
      setConditionsPanelOpen(!isOpen);
    });
  }

  if (conditionsPanel) {
    conditionsPanel.addEventListener('click', (event) => {
      if (event.target !== conditionsPanel) return;
      if (!confirmDiscardConditionChanges()) return;
      setConditionsPanelOpen(false);
    });
  }

  function buildStatsFields() {
    statInputs.clear();
    if (statsFields) statsFields.innerHTML = '';
    if (currentStatsInputs) currentStatsInputs.innerHTML = '';
    if (healthHeading) {
      healthHeading.textContent = statKeys.length === 1 ? statKeys[0] : 'Stats';
    }

    statKeys.forEach((key) => {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const maxId = `max-stat-${normalizedKey}`;
      const currentId = `current-stat-${normalizedKey}`;
      const isTempHp = key === 'TempHP';
      const currentInput = document.createElement('input');
      currentInput.type = 'number';
      currentInput.id = currentId;
      if (key === 'TempHP' || !allowNegativeHealth) {
        currentInput.min = '0';
      }

      let maxInput = null;
      if (!isTempHp) {
        maxInput = document.createElement('input');
        maxInput.type = 'number';
        maxInput.id = maxId;
        maxInput.min = '0';
      }

      if (statsFields) {
        const row = document.createElement('div');
        row.className = 'stat-editor-row';
        if (isTempHp) row.classList.add('temp-hp-row');

        const keyLabel = document.createElement('div');
        keyLabel.className = 'stat-editor-key';
        keyLabel.textContent = key;
        row.appendChild(keyLabel);

        const currentLabel = document.createElement('label');
        currentLabel.className = 'stat-editor-input';
        const currentText = document.createElement('span');
        currentText.textContent = 'Current';
        currentLabel.appendChild(currentText);
        currentLabel.appendChild(currentInput);
        row.appendChild(currentLabel);

        if (maxInput) {
          const maxLabel = document.createElement('label');
          maxLabel.className = 'stat-editor-input';
          const maxText = document.createElement('span');
          maxText.textContent = 'Max';
          maxLabel.appendChild(maxText);
          maxLabel.appendChild(maxInput);
          row.appendChild(maxLabel);
        }

        statsFields.appendChild(row);
      }

      statInputs.set(key, { maxInput, currentInput });
    });

    statInputs.forEach((entry, key) => {
      if (entry.maxInput) {
        entry.maxInput.addEventListener('input', () => {
          formDirty = true;
          updateDraftFromForm();
        });
      }
      if (entry.currentInput) {
        entry.currentInput.addEventListener('input', () => {
          formDirty = true;
          updateDraftFromForm();
        });
      }
    });

    buildAddStatsFields();
  }

  function buildAddStatsFields() {
    addStatInputs.clear();
    if (addStatsFields) addStatsFields.innerHTML = '';
    if (addCurrentStats) addCurrentStats.innerHTML = '';

    statKeys.forEach((key) => {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const maxId = `add-max-stat-${normalizedKey}`;
      const currentId = `add-current-stat-${normalizedKey}`;
      const isTempHp = key === 'TempHP';
      const currentInput = document.createElement('input');
      currentInput.type = 'number';
      currentInput.id = currentId;
      if (key === 'TempHP' || !allowNegativeHealth) {
        currentInput.min = '0';
      }

      let maxInput = null;
      if (!isTempHp) {
        maxInput = document.createElement('input');
        maxInput.type = 'number';
        maxInput.id = maxId;
        maxInput.min = '0';
      }

      if (addStatsFields) {
        const row = document.createElement('div');
        row.className = 'stat-editor-row';
        if (isTempHp) row.classList.add('temp-hp-row');

        const keyLabel = document.createElement('div');
        keyLabel.className = 'stat-editor-key';
        keyLabel.textContent = key;
        row.appendChild(keyLabel);

        const currentLabel = document.createElement('label');
        currentLabel.className = 'stat-editor-input';
        const currentText = document.createElement('span');
        currentText.textContent = 'Current';
        currentLabel.appendChild(currentText);
        currentLabel.appendChild(currentInput);
        row.appendChild(currentLabel);

        if (maxInput) {
          const maxLabel = document.createElement('label');
          maxLabel.className = 'stat-editor-input';
          const maxText = document.createElement('span');
          maxText.textContent = 'Max';
          maxLabel.appendChild(maxText);
          maxLabel.appendChild(maxInput);
          row.appendChild(maxLabel);
        }

        addStatsFields.appendChild(row);
      }

      addStatInputs.set(key, { maxInput, currentInput });
    });
  }

  function draftKeyForOwner(ownerName) {
    const normalized = normalizePlayerName(ownerName);
    const campaignKey = currentCampaignName ? currentCampaignName : 'default';
    return `${LOCAL_DRAFT_PREFIX}${normalized}:${campaignKey}`;
  }

  function loadDrafts(ownerName) {
    if (!ownerName) return {};
    try {
      const raw = localStorage.getItem(draftKeyForOwner(ownerName));
      return raw ? JSON.parse(raw) : {};
    } catch (err) {
      console.warn('Failed to load drafts:', err);
      return {};
    }
  }

  function saveDrafts(ownerName, drafts) {
    if (!ownerName) return;
    try {
      localStorage.setItem(draftKeyForOwner(ownerName), JSON.stringify(drafts));
    } catch (err) {
      console.warn('Failed to save drafts:', err);
    }
  }

  function updateDraftFromForm() {
    const ownerName = getOwnerName();
    if (!ownerName) return;
    const draftKey = selectedCharacterId || (nameInput ? nameInput.value.trim() : '');
    if (!draftKey) return;
    const drafts = loadDrafts(ownerName);
    const stats = {};
    statInputs.forEach((entry, key) => {
      const currentRaw = entry.currentInput ? entry.currentInput.value.trim() : '';
      const maxRaw = entry.maxInput ? entry.maxInput.value.trim() : '';
      const currentVal = currentRaw === '' ? null : Number(currentRaw);
      const maxVal = maxRaw === '' ? null : Number(maxRaw);
      stats[key] = {
        current: Number.isFinite(currentVal) ? currentVal : null,
        max: Number.isFinite(maxVal) ? maxVal : null
      };
    });
    drafts[draftKey] = {
      id: selectedCharacterId,
      name: nameInput ? nameInput.value.trim() : '',
      stats,
      revealStats: revealStatsInput ? revealStatsInput.checked : null,
      autoSkipTurn: autoSkipTurnInput ? autoSkipTurnInput.checked : null,
      useAppInitiativeRoll: useAppInitiativeRollInput ? useAppInitiativeRollInput.checked : true,
      initiativeBonus: initiativeBonusInput ? initiativeBonusInput.value.trim() : '0'
    };
    saveDrafts(ownerName, drafts);
  }

  function applyDraftToForm(character) {
    const ownerName = getOwnerName();
    if (!ownerName || !character) return;
    const drafts = loadDrafts(ownerName);
    const draft = drafts[character.id] || drafts[character.name];
    if (!draft) return;
    if (draft.name && nameInput) {
      nameInput.value = draft.name;
    }
    if (draft.stats) {
      statInputs.forEach((entry, key) => {
        const statDraft = draft.stats[key];
        if (!statDraft) return;
        if (entry.currentInput && Number.isFinite(statDraft.current)) {
          entry.currentInput.value = statDraft.current;
        }
        if (entry.maxInput && Number.isFinite(statDraft.max) && statDraft.max > 0) {
          entry.maxInput.value = statDraft.max;
        }
      });
    }
    if (revealStatsInput && typeof draft.revealStats === 'boolean') {
      revealStatsInput.checked = draft.revealStats;
    }
    if (autoSkipTurnInput && typeof draft.autoSkipTurn === 'boolean') {
      autoSkipTurnInput.checked = draft.autoSkipTurn;
    }
    if (useAppInitiativeRollInput && typeof draft.useAppInitiativeRoll === 'boolean') {
      useAppInitiativeRollInput.checked = draft.useAppInitiativeRoll;
    }
    if (initiativeBonusInput && typeof draft.initiativeBonus === 'string') {
      initiativeBonusInput.value = draft.initiativeBonus;
    }
    updateInitiativeBonusAvailability();
  }

  function applyDraftsToCharacters(ownerName, characters) {
    if (!ownerName || !Array.isArray(characters)) return;
    const drafts = loadDrafts(ownerName);
    characters.forEach((character) => {
      const draft = drafts[character.id] || drafts[character.name];
      if (!draft) return;
      if (draft.name) {
        character.name = draft.name;
      }
      if (draft.stats && Array.isArray(character.stats)) {
        character.stats = character.stats.map((stat) => {
          const statDraft = draft.stats[stat.key];
          if (!statDraft) return stat;
          const nextCurrent = Number.isFinite(statDraft.current) ? statDraft.current : stat.current;
          const nextMax =
            Number.isFinite(statDraft.max) && statDraft.max > 0 ? statDraft.max : stat.max;
          return {
            ...stat,
            current: nextCurrent,
            max: nextMax
          };
        });
      }
      if (typeof draft.revealStats === 'boolean') {
        character.revealStats = draft.revealStats;
      }
      if (typeof draft.autoSkipTurn === 'boolean') {
        character.autoSkipTurn = draft.autoSkipTurn;
      }
      if (typeof draft.useAppInitiativeRoll === 'boolean') {
        character.useAppInitiativeRoll = draft.useAppInitiativeRoll;
      }
      if (draft.initiativeBonus !== undefined) {
        const parsedBonus = Number(draft.initiativeBonus);
        character.initiativeBonus = Number.isFinite(parsedBonus) ? parsedBonus : 0;
      }
    });
  }

  function updateDraftForCharacter(character) {
    const ownerName = getOwnerName();
    if (!ownerName || !character) return;
    const drafts = loadDrafts(ownerName);
    const draftKey = character.id || character.name;
    const stats = {};
    if (Array.isArray(character.stats)) {
      character.stats.forEach((stat) => {
        stats[stat.key] = {
          current: Number.isFinite(stat.current) ? stat.current : null,
          max: Number.isFinite(stat.max) ? stat.max : null
        };
      });
    }
    drafts[draftKey] = {
      id: character.id,
      name: character.name,
      stats,
      revealStats: typeof character.revealStats === 'boolean' ? character.revealStats : null,
      autoSkipTurn: typeof character.autoSkipTurn === 'boolean' ? character.autoSkipTurn : null,
      useAppInitiativeRoll:
        typeof character.useAppInitiativeRoll === 'boolean' ? character.useAppInitiativeRoll : true,
      initiativeBonus: Number.isFinite(character.initiativeBonus) ? String(character.initiativeBonus) : '0'
    };
    saveDrafts(ownerName, drafts);
  }

  function scheduleCharacterSave(character) {
    if (!character) return;
    const timerKey = character.id || character.name;
    if (!timerKey) return;
    if (perCharacterSaveTimers.has(timerKey)) {
      clearTimeout(perCharacterSaveTimers.get(timerKey));
    }
    const timer = setTimeout(() => {
      saveCharacterEntry(character);
      perCharacterSaveTimers.delete(timerKey);
    }, AUTO_SAVE_DELAY_MS);
    perCharacterSaveTimers.set(timerKey, timer);
  }

  async function saveCharacterEntry(character) {
    if (!character) return;
    try {
      await ensurePlayerSessionId();
      const payload = {
        id: character.id,
        ownerId: currentPlayerSessionId,
        ownerName: character.ownerName,
        name: character.name,
        initiative: character.initiative,
        stats: Array.isArray(character.stats) ? character.stats : [],
        revealStats: character.revealStats,
        autoSkipTurn: character.autoSkipTurn,
        useAppInitiativeRoll: character.useAppInitiativeRoll,
        initiativeBonus: character.initiativeBonus,
        conditions: Array.isArray(character.conditions) ? character.conditions : []
      };
      if (currentCampaignName) {
        payload.campaignName = currentCampaignName;
      }
      if (!currentCampaignId) {
        throw new Error('No active campaign selected.');
      }
      const characterRes = await fetch(
        `/campaigns/${encodeURIComponent(currentCampaignId)}/me/characters`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      if (!characterRes.ok) {
        if (characterRes.status === 401 || characterRes.status === 403) {
          if (preferPlayerView) {
            return;
          }
          window.location.replace('/index.html');
          return;
        }
        throw new Error('Server returned ' + characterRes.status);
      }
      updateDraftForCharacter(character);
      lastStateJson = null;
      await loadState();
    } catch (err) {
      console.error('Failed to auto-save character:', err);
    }
  }

  async function editCharacterInitiative(character) {
    if (!character) return;
    openInitiativeEditor(character);
  }

  async function deleteMyCharacter(character) {
    if (!character?.id) return;
    try {
      if (!currentCampaignId) {
        throw new Error('No active campaign selected.');
      }
      const res = await fetch(
        `/campaigns/${encodeURIComponent(currentCampaignId)}/me/characters/${character.id}`,
        { method: 'DELETE' }
      );
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          if (preferPlayerView) {
            myCharacters = [];
            renderCharacterList();
            updateConditionsAvailability();
            return;
          }
          window.location.replace('/index.html');
          return;
        }
        throw new Error('Server returned ' + res.status);
      }
      myCharacters = myCharacters.filter((entry) => entry.id !== character.id);
      if (selectedCharacterId === character.id) {
        clearCharacterSelection();
      }
      renderCharacterList();
      updateConditionsAvailability();
      lastStateJson = null;
      await loadState();
    } catch (err) {
      console.error('Failed to remove character:', err);
      if (statusDiv) {
        statusDiv.textContent = 'Failed to remove character.';
      }
    }
  }

  function setConditionLibraryFromSet(conditionSet) {
    const baseUrl =
      typeof conditionSet?.rulesBaseUrl === 'string' && conditionSet.rulesBaseUrl.trim()
        ? conditionSet.rulesBaseUrl.trim()
        : null;

    const normalizedEntries = (conditionSet?.conditions ?? [])
      .map((entry) => normalizeConditionEntry(entry))
      .filter(Boolean);

    if (Array.isArray(conditionSet?.stats) && conditionSet.stats.length > 0) {
      statKeys = conditionSet.stats;
    } else {
      statKeys = ['HP'];
    }
    supportsTempHp = Boolean(conditionSet?.supportsTempHp);
    if (supportsTempHp && !statKeys.includes('TempHP')) {
      statKeys = [...statKeys, 'TempHP'];
    }
    allowNegativeHealth = Boolean(conditionSet?.allowNegativeHealth);
    currentStandardDie =
      typeof conditionSet?.standardDie === 'string' && conditionSet.standardDie.trim()
        ? conditionSet.standardDie.trim()
        : null;
    buildStatsFields();

    if (normalizedEntries.length === 0) {
      conditionLibrary = [];
      conditionLookup = new Map();
      conditionLibraryLabel = '';
      updateCampaignHeader(
        {
          nameTargets: campaignHeaderNameTargets,
          iconTargets: campaignHeaderIconTargets,
          linkTargets: campaignHeaderLinkTargets,
          licenseTargets: campaignHeaderLicenseTargets
        },
        {
          campaignName: currentCampaignName || null,
          rulesetLabel: '',
          rulesBaseUrl: null,
          licenseUrl: null,
          iconUrl: currentCampaignName ? null : APP_ICON_URL
        }
      );
      document.body.classList.add('no-conditions');
      renderConditionGrid(conditionFilterInput ? conditionFilterInput.value : '');
      return;
    }

    conditionLibrary = normalizedEntries;
    conditionLookup = new Map(normalizedEntries.map((entry) => [entry.name, entry]));
    conditionLibraryLabel = conditionSet?.label || '';
    updateCampaignHeader(
      {
        nameTargets: campaignHeaderNameTargets,
        iconTargets: campaignHeaderIconTargets,
        linkTargets: campaignHeaderLinkTargets,
        licenseTargets: campaignHeaderLicenseTargets
      },
      {
        campaignName: currentCampaignName || null,
        rulesetLabel: conditionLibraryLabel,
        rulesBaseUrl: baseUrl,
        licenseUrl: conditionSet?.license || null,
        iconUrl: currentCampaignName ? (conditionSet?.icon || null) : APP_ICON_URL
      }
    );

    document.body.classList.remove('no-conditions');
    renderConditionGrid(conditionFilterInput ? conditionFilterInput.value : '');
  }

  function getOwnerName() {
    return ownerInput ? ownerInput.value.trim() : '';
  }

  function generateUuid() {
    if (crypto && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
      const rand = Math.random() * 16 | 0;
      const value = char === 'x' ? rand : (rand & 0x3) | 0x8;
      return value.toString(16);
    });
  }

  function isValidUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    );
  }

  async function responseErrorMessage(res) {
    const fallback = `Server returned ${res.status}`;
    try {
      const text = await res.text();
      if (!text) {
        return fallback;
      }
      const payload = JSON.parse(text);
      return payload?.reason || payload?.message || text || fallback;
    } catch (_err) {
      return fallback;
    }
  }

  async function joinPlayerSession(displayName) {
    const trimmedName = sanitizePlayerDisplayName(displayName) || 'Player';
    const res = await fetch('/player/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: trimmedName })
    });
    if (!res.ok) {
      throw new Error('Server returned ' + res.status);
    }
    const payload = await res.json();
    const player = payload.player || {};
    currentPlayerSessionId = player.id || currentPlayerSessionId;
    const loginName = sanitizePlayerDisplayName(player.loginName || trimmedName) || trimmedName;
    const displayNameValue = sanitizePlayerDisplayName(player.displayName) || loginName;
    if (ownerInput) ownerInput.value = displayNameValue;
    if (playerNameInput) playerNameInput.value = displayNameValue;
    updatePlayerNameDisplay();
    return payload;
  }

  async function bootstrapPlayerSession() {
    try {
      const res = await fetch('/player/session');
      if (!res.ok) {
        if (res.status === 403 && displayOnly) {
          logDisplayForbidden('GET /player/session');
        }
        currentPlayerSessionId = '';
        return false;
      }
      const payload = await res.json();
      const player = payload.player || {};
      currentPlayerSessionId = player.id || currentPlayerSessionId;
      const loginName = sanitizePlayerDisplayName(player.loginName);
      const displayName = sanitizePlayerDisplayName(player.displayName);
      if (ownerInput) {
        ownerInput.value = displayName;
      }
      if (playerNameInput) {
        playerNameInput.value = displayName;
      }
      updatePlayerNameDisplay();
      return true;
    } catch (err) {
      currentPlayerSessionId = '';
      return false;
    }
  }

  async function ensurePlayerSessionId() {
    if (!currentPlayerSessionId || !isValidUuid(currentPlayerSessionId)) {
      const loginName = getOwnerName();
      if (currentCampaignName && loginName) {
        try {
          await joinPlayerSession(loginName);
          return currentPlayerSessionId;
        } catch (err) {
          console.error('Failed to join player session:', err);
        }
      }
      throw new Error('Player login name is required.');
    }
    return currentPlayerSessionId;
  }

  function getCharacterControllerName(character) {
    if (!character) return '';
    const claimedDisplayName = typeof character.claimedDisplayName === 'string'
      ? character.claimedDisplayName.trim()
      : '';
    if (claimedDisplayName) return claimedDisplayName;
    if (character.isReferee) return 'Referee';
    return '';
  }

  function renderCharacterList() {
    if (!characterList) return;
    characterList.innerHTML = '';
    if (selectionToolbarAnchor) {
      selectionToolbarAnchor.classList.add('hidden');
    }

    if (myCharacters.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'subtitle';
      empty.textContent = 'No characters yet.';
      characterList.appendChild(empty);
      if (removeCharacterBtn) {
        removeCharacterBtn.disabled = true;
        removeCharacterBtn.setAttribute('aria-disabled', 'true');
      }
      return;
    }

    myCharacters.forEach((character) => {
      const item = document.createElement('div');
      item.className = 'character-item';
      if (character.id === selectedCharacterId) {
        item.classList.add('active');
      }
      if (character.id === currentTurnId) {
        item.classList.add('current-turn');
      }

      const row = document.createElement('div');
      row.className = 'character-row';

      const nameWrap = document.createElement('div');
      const name = document.createElement('div');
      name.className = 'character-name';
      name.textContent = character.name;
      const meta = document.createElement('div');
      meta.className = 'character-meta';
      const initiativeButton = document.createElement('button');
      initiativeButton.type = 'button';
      initiativeButton.className = 'initiative-inline-button';
      initiativeButton.textContent = `Init ${formatInitiative(character.initiative)}`;
      initiativeButton.addEventListener('click', (event) => {
        event.stopPropagation();
        editCharacterInitiative(character);
      });
      meta.appendChild(initiativeButton);
      nameWrap.appendChild(name);
      nameWrap.appendChild(meta);
      row.appendChild(nameWrap);

      const statsWrap = document.createElement('div');
      statsWrap.className = 'character-stats';
      const stats = Array.isArray(character.stats) ? character.stats : [];
      const statsByKey = new Map(stats.map((stat) => [stat.key, stat]));

      statKeys.forEach((key) => {
        const stat = statsByKey.get(key) || { key, current: 0, max: 0 };
        const line = document.createElement('div');
        line.className = 'character-stat-line';
        const label = document.createElement('span');
        label.className = 'character-stat-label';
        label.textContent = key;

        const minus = document.createElement('button');
        minus.type = 'button';
        minus.className = 'hp-adjust';
        minus.textContent = '−';
        minus.addEventListener('click', (event) => {
          event.stopPropagation();
          adjustCharacterStat(character, key, -1);
        });

        const value = document.createElement('span');
        value.className = 'character-hp-value';
        const currentVal = Number.isFinite(stat.current) ? stat.current : 0;
        const maxVal = Number.isFinite(stat.max) ? stat.max : 0;
        value.textContent = key === 'TempHP' ? `${currentVal}` : `${currentVal}/${maxVal}`;

        const plus = document.createElement('button');
        plus.type = 'button';
        plus.className = 'hp-adjust';
        plus.textContent = '+';
        plus.addEventListener('click', (event) => {
          event.stopPropagation();
          adjustCharacterStat(character, key, 1);
        });

        line.appendChild(label);
        line.appendChild(minus);
        line.appendChild(value);
        line.appendChild(plus);
        statsWrap.appendChild(line);
      });

      row.appendChild(statsWrap);

      item.appendChild(row);

      const conditionsList = buildEncounterConditionsList(character.conditions, conditionLookup);
      if (conditionsList) {
        conditionsList.classList.add('character-card-conditions');
        item.appendChild(conditionsList);
      }

      const showTurnCompleteAction =
        !displayOnly &&
        encounterState === 'active' &&
        Boolean(currentTurnId) &&
        character.id === currentTurnId &&
        myCharacters.some((entry) => entry.id === currentTurnId);

      if (needsInitiativeAction(character) || showTurnCompleteAction) {
        const initiativeActions = document.createElement('div');
        initiativeActions.className = 'character-actions';
        if (needsInitiativeAction(character)) {
          const rollButton = document.createElement('button');
          rollButton.type = 'button';
          rollButton.textContent = 'Roll for Initiative!';
          rollButton.addEventListener('click', (event) => {
            event.stopPropagation();
            handleInitiativeAction(character);
          });
          initiativeActions.appendChild(rollButton);
        }
        if (showTurnCompleteAction) {
          const turnButton = document.createElement('button');
          turnButton.type = 'button';
          turnButton.textContent = 'Turn Complete';
          turnButton.className = 'character-turn-complete';
          turnButton.addEventListener('click', async (event) => {
            event.stopPropagation();
            await handleTurnComplete();
          });
          initiativeActions.appendChild(turnButton);
        }
        item.appendChild(initiativeActions);
      }

      if (character.id === selectedCharacterId && selectionToolbarAnchor) {
        selectionToolbarAnchor.classList.remove('hidden');
        item.appendChild(selectionToolbarAnchor);
      }

      item.addEventListener('click', () => {
        selectCharacter(character.id);
      });

      characterList.appendChild(item);
    });

    if (removeCharacterBtn) {
      const canRemove = Boolean(selectedCharacterId);
      removeCharacterBtn.disabled = !canRemove;
      removeCharacterBtn.setAttribute('aria-disabled', (!canRemove).toString());
    }
    updateReleaseButtonState();

    renderClaimableCharacterList();
  }

  function renderClaimableCharacterList() {
    if (!claimableCharacterList) return;
    claimableCharacterList.innerHTML = '';

    if (!currentCampaignId) {
      if (claimableCharacterPanel) {
        claimableCharacterPanel.classList.add('hidden');
        claimableCharacterPanel.setAttribute('aria-hidden', 'true');
      }
      return;
    }

    if (claimableCharacterPanel) {
      claimableCharacterPanel.classList.toggle('hidden', displayOnly);
      claimableCharacterPanel.setAttribute('aria-hidden', displayOnly.toString());
    }

    const unclaimedCharacters = filterClaimableCharacters(claimableCharacters);

    if (unclaimedCharacters.length === 0) {
      if (claimableCharacterPanel) {
        claimableCharacterPanel.classList.add('hidden');
        claimableCharacterPanel.setAttribute('aria-hidden', 'true');
      }
      return;
    }

    if (claimableCharacterPanel) {
      claimableCharacterPanel.classList.remove('hidden');
      claimableCharacterPanel.setAttribute('aria-hidden', 'false');
    }

    unclaimedCharacters.forEach((character) => {
      const item = document.createElement('div');
      item.className = 'claimable-character-item unclaimed';

      const name = document.createElement('div');
      name.className = 'claimable-character-name';
      name.textContent = character.name || 'Unnamed Character';
      item.appendChild(name);

      const meta = document.createElement('div');
      meta.className = 'claimable-character-meta';
      const metaParts = ['Unclaimed'];
      if (character.ownerName) {
        metaParts.push(`created by ${character.ownerName}`);
      }
      if (character.lastPlayedByName) {
        metaParts.push(`last played by ${character.lastPlayedByName}`);
      }
      meta.textContent = metaParts.join(' • ');
      item.appendChild(meta);

      const actions = document.createElement('div');
      actions.className = 'claimable-character-actions';
      const claimButton = document.createElement('button');
      claimButton.type = 'button';
      claimButton.textContent = 'Claim';
      claimButton.addEventListener('click', async (event) => {
        event.stopPropagation();
        await claimCharacter(character);
      });
      actions.appendChild(claimButton);
      item.appendChild(actions);

      claimableCharacterList.appendChild(item);
    });
  }

  function clearPendingCharacterSaveTimers() {
    perCharacterSaveTimers.forEach((timer) => clearTimeout(timer));
    perCharacterSaveTimers.clear();
  }

  function syncMyCharacterStatsFromState(players) {
    if (displayOnly) return;
    if (typeof currentPlayerSessionId === 'undefined' || !currentPlayerSessionId || !Array.isArray(players)) return;
    if (encounterState === 'new') {
      clearPendingCharacterSaveTimers();
      myCharacters = myCharacters.map((character) => ({
        ...character,
        initiative: null
      }));
      renderCharacterList();
      if (
        !formDirty &&
        !conditionsDirty &&
        selectedCharacterId &&
        myCharacters.some((character) => character.id === selectedCharacterId)
      ) {
        selectCharacter(selectedCharacterId);
      }
      return;
    }
    const byId = new Map(
      players
        .filter((player) => player.ownerId && player.ownerId === currentPlayerSessionId)
        .map((player) => [player.id, player])
    );
    if (byId.size === 0) return;
    let updated = false;
    myCharacters = myCharacters.map((character) => {
      const match = byId.get(character.id);
      if (!match) return character;
      updated = true;
      return {
        ...character,
        initiative: match.initiative,
        stats: Array.isArray(match.stats) ? match.stats : character.stats,
        revealStats: match.revealStats,
        autoSkipTurn: match.autoSkipTurn,
        useAppInitiativeRoll: match.useAppInitiativeRoll,
        initiativeBonus: match.initiativeBonus,
        conditions: match.conditions
      };
    });
    if (updated) {
      renderCharacterList();
      if (
        !formDirty &&
        !conditionsDirty &&
        selectedCharacterId &&
        myCharacters.some((character) => character.id === selectedCharacterId)
      ) {
        selectCharacter(selectedCharacterId);
      }
    }
  }

  function clampCurrentHp(value, maxValue) {
    let clamped = allowNegativeHealth ? value : Math.max(0, value);
    if (Number.isFinite(maxValue)) {
      clamped = Math.min(clamped, maxValue);
    }
    return clamped;
  }

  function clampCurrentForKey(statKey, value, maxValue) {
    if (statKey === 'TempHP') {
      return Math.max(0, value);
    }
    return clampCurrentHp(value, maxValue);
  }

  function adjustCharacterStat(character, statKey, delta) {
    if (!character) return;
    if (!Array.isArray(character.stats)) {
      character.stats = [];
    }
    const existing = character.stats.find((stat) => stat.key === statKey) || {
      key: statKey,
      current: 0,
      max: 0
    };
    const nextStats = character.stats.map((stat) => ({ ...stat }));
    const statIndex = nextStats.findIndex((stat) => stat.key === statKey);
    const tempIndex = nextStats.findIndex((stat) => stat.key === 'TempHP');

    if (supportsTempHp && statKey === 'HP' && delta < 0 && tempIndex >= 0) {
      const tempStat = nextStats[tempIndex];
      let damage = Math.abs(delta);
      const absorbed = Math.min(Math.max(0, tempStat.current), damage);
      tempStat.current = clampCurrentForKey('TempHP', tempStat.current - absorbed, tempStat.max);
      damage -= absorbed;

      const hpStat = statIndex >= 0 ? nextStats[statIndex] : { ...existing };
      hpStat.current = clampCurrentForKey('HP', hpStat.current - damage, hpStat.max);

      if (statIndex >= 0) {
        nextStats[statIndex] = hpStat;
      } else {
        nextStats.push(hpStat);
      }
      nextStats[tempIndex] = tempStat;
    } else {
      const nextCurrent = clampCurrentForKey(statKey, existing.current + delta, existing.max);
      const nextStat = { ...existing, current: nextCurrent };
      if (statIndex >= 0) {
        nextStats[statIndex] = nextStat;
      } else {
        nextStats.push(nextStat);
      }
    }

    character.stats = nextStats;
    if (selectedCharacterId === character.id) {
      const entry = statInputs.get(statKey);
      const updated = character.stats.find((stat) => stat.key === statKey);
      if (entry?.currentInput && updated) {
        entry.currentInput.value = updated.current;
      }
      if (supportsTempHp && statKey === 'HP') {
        const tempEntry = statInputs.get('TempHP');
        const updatedTemp = character.stats.find((stat) => stat.key === 'TempHP');
        if (tempEntry?.currentInput && updatedTemp) {
          tempEntry.currentInput.value = updatedTemp.current;
        }
      }
    }
    renderCharacterList();
    updateDraftForCharacter(character);
    scheduleCharacterSave(character);
    skipRefresh = true;
  }

  function selectCharacter(id) {
    const found = myCharacters.find((character) => character.id === id);
    if (!found) return;

    selectedCharacterId = found.id;
    isCreatingCharacter = false;
    nameInput.value = found.name;
    if (Array.isArray(found.stats)) {
      const statsByKey = new Map(found.stats.map((stat) => [stat.key, stat]));
      statInputs.forEach((entry, key) => {
        const stat = statsByKey.get(key);
        if (entry.currentInput) {
          entry.currentInput.value = Number.isFinite(stat?.current) ? stat.current : '';
        }
        if (entry.maxInput) {
          entry.maxInput.value = Number.isFinite(stat?.max) ? stat.max : '';
        }
      });
    }
    if (revealStatsInput) {
      revealStatsInput.checked = Boolean(found.revealStats);
    }
    if (autoSkipTurnInput) {
      autoSkipTurnInput.checked = Boolean(found.autoSkipTurn);
    }
    if (useAppInitiativeRollInput) {
      useAppInitiativeRollInput.checked = found.useAppInitiativeRoll !== false;
    }
    if (initiativeBonusInput) {
      initiativeBonusInput.value = Number.isFinite(found.initiativeBonus) ? found.initiativeBonus : '0';
    }
    updateInitiativeBonusAvailability();
    applyDraftToForm(found);
    applySelectedConditions(found.conditions || []);
    formDirty = false;
    renderCharacterList();
    updateConditionsAvailability();
    if (conditionsCharacter) {
      conditionsCharacter.textContent = found.name || 'this character';
    }
  }

  function clearCharacterSelection() {
    selectedCharacterId = null;
    closeCharacterOverflowMenu();
    nameInput.value = '';
    statInputs.forEach((entry) => {
      if (entry.currentInput) entry.currentInput.value = '';
      if (entry.maxInput) entry.maxInput.value = '';
    });
    if (revealStatsInput) revealStatsInput.checked = false;
    if (autoSkipTurnInput) autoSkipTurnInput.checked = false;
    if (useAppInitiativeRollInput) useAppInitiativeRollInput.checked = true;
    if (initiativeBonusInput) initiativeBonusInput.value = '0';
    updateInitiativeBonusAvailability();
    applySelectedConditions([]);
    formDirty = false;
    renderCharacterList();
    updateConditionsAvailability();
    if (conditionsCharacter) {
      conditionsCharacter.textContent = 'this character';
    }
  }

  function revertSelectedCharacterForm() {
    revertSelectedCharacterDetails();
  }

  function clearAddForm() {
    if (addNameInput) addNameInput.value = '';
    if (addUseAppInitiativeRollInput) addUseAppInitiativeRollInput.checked = true;
    if (addInitiativeBonusInput) addInitiativeBonusInput.value = '';
    if (addRevealStatsInput) addRevealStatsInput.checked = false;
    if (addAutoSkipTurnInput) addAutoSkipTurnInput.checked = false;
    updateAddInitiativeBonusAvailability();
    addStatInputs.forEach((entry) => {
      if (entry.maxInput) entry.maxInput.value = '';
      if (entry.currentInput) entry.currentInput.value = '';
    });
  }

  function needsInitiativeAction(character) {
    return encounterState === 'active' && (character.initiative === null || character.initiative === undefined);
  }

  async function handleInitiativeAction(character) {
    if (!character) return;
    if (character.useAppInitiativeRoll !== false) {
      const rolled = rollStandardDie(currentStandardDie, character.initiativeBonus);
      if (Number.isFinite(rolled)) {
        character.initiative = rolled;
        await saveCharacterEntry(character);
        return;
      }
    }

    const entered = prompt(`Enter initiative for ${character.name}`, '');
    if (entered === null) return;
    const trimmed = entered.trim();
    if (!trimmed) return;
    const initiative = Number(trimmed);
    if (!Number.isFinite(initiative)) {
      statusDiv.textContent = 'Initiative must be a valid number.';
      return;
    }
    character.initiative = initiative;
    await saveCharacterEntry(character);
  }

  function showAddForm() {
    if (!addForm) return;
    addForm.classList.remove('hidden');
    addForm.classList.add('details-panel-open');
    addForm.setAttribute('aria-hidden', 'false');
    isCreatingCharacter = true;
    clearCharacterSelection();
    clearAddForm();
    updateConditionsAvailability();
    if (conditionsCharacter) {
      conditionsCharacter.textContent = addNameInput ? addNameInput.value.trim() || 'this character' : 'this character';
    }
  }

  function hideAddForm() {
    if (!addForm) return;
    addForm.classList.add('details-panel-collapsed');
    addForm.classList.remove('details-panel-open');
    addForm.classList.add('hidden');
    addForm.setAttribute('aria-hidden', 'true');
    isCreatingCharacter = false;
    clearAddForm();
    applySelectedConditions([]);
    updateConditionsAvailability();
    if (conditionsCharacter) {
      conditionsCharacter.textContent = 'this character';
    }
  }

  async function loadCharactersForOwner(ownerName) {
    if (!ownerName) {
      myCharacters = [];
      selectedCharacterId = null;
      renderCharacterList();
      updateConditionsAvailability();
      return;
    }

    if (!currentCampaignId) {
      myCharacters = [];
      selectedCharacterId = null;
      renderCharacterList();
      updateConditionsAvailability();
      return;
    }

    try {
      await ensurePlayerSessionId();
      const res = await fetch(
        `/campaigns/${encodeURIComponent(currentCampaignId)}/me/characters`
      );
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          if (preferPlayerView) {
            lastStateJson = null;
            updateConditionsAvailability();
            return;
          }
          window.location.replace('/index.html');
          return;
        }
        throw new Error('Server returned ' + res.status);
      }
      myCharacters = await res.json();
      applyDraftsToCharacters(ownerName, myCharacters);
      if (selectedCharacterId && myCharacters.some((c) => c.id === selectedCharacterId)) {
        selectCharacter(selectedCharacterId);
      } else if (myCharacters.length > 0) {
        selectCharacter(myCharacters[0].id);
      } else {
        clearCharacterSelection();
      }
    } catch (err) {
      console.error('Failed to load characters:', err);
    }
  }

  async function loadClaimableCharacters() {
    if (!currentCampaignId || displayOnly) {
      claimableCharacters = [];
      renderClaimableCharacterList();
      return;
    }

    try {
      const res = await fetch(`/campaigns/${encodeURIComponent(currentCampaignId)}/characters`);
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          if (preferPlayerView) {
            claimableCharacters = [];
            renderClaimableCharacterList();
            return;
          }
          window.location.replace('/index.html');
          return;
        }
        throw new Error('Server returned ' + res.status);
      }
      claimableCharacters = await res.json();
      renderClaimableCharacterList();
    } catch (err) {
      console.error('Failed to load claimable characters:', err);
      claimableCharacters = [];
      renderClaimableCharacterList();
    }
  }

  async function refreshCharacterState(ownerName) {
    await loadCharactersForOwner(ownerName);
    await loadClaimableCharacters();
  }

  async function claimCharacter(character) {
    if (!character || !currentCampaignId) return;
    try {
      statusDiv.textContent = 'Claiming character...';
      const res = await fetch(
        `/campaigns/${encodeURIComponent(currentCampaignId)}/me/characters/${encodeURIComponent(character.id)}/claim`,
        { method: 'POST' }
      );
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          if (preferPlayerView) {
            loadStateInFlight = false;
            if (loadStateRefreshQueued) {
              loadStateRefreshQueued = false;
              void loadState();
            }
            return;
          }
          window.location.replace('/index.html');
          return;
        }
        throw new Error(await responseErrorMessage(res));
      }
      statusDiv.textContent = '';
      await refreshCharacterState(getOwnerName());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      statusDiv.textContent = `Claim failed: ${message}`;
    }
  }

  async function releaseClaimForCharacter(character) {
    if (!character || !currentCampaignId) return;
    try {
      statusDiv.textContent = 'Releasing character...';
      const res = await fetch(
        `/campaigns/${encodeURIComponent(currentCampaignId)}/me/characters/${encodeURIComponent(character.id)}/release`,
        { method: 'POST' }
      );
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          if (preferPlayerView) {
            statusDiv.textContent = '';
            return;
          }
          window.location.replace('/index.html');
          return;
        }
        throw new Error(await responseErrorMessage(res));
      }
      statusDiv.textContent = '';
      await refreshCharacterState(getOwnerName());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      statusDiv.textContent = `Release failed: ${message}`;
    }
  }

  async function loadCampaign() {
    try {
      const res = await fetch('/campaign');
      if (!res.ok) {
        if (res.status === 403) {
          logDisplayForbidden('GET /campaign');
          return false;
        }
        if (res.status === 409) {
          campaignLiveStream.close();
          if (currentCampaignId) {
            if (preferPlayerView) {
              return false;
            }
            window.location.replace('/index.html');
            return false;
          }
          currentCampaignName = '';
          currentCampaignId = '';
          currentRulesetId = '';
          updateCampaignHeader(
            {
              nameTargets: campaignHeaderNameTargets,
              iconTargets: campaignHeaderIconTargets,
              linkTargets: campaignHeaderLinkTargets,
              licenseTargets: campaignHeaderLicenseTargets
            },
            {
              campaignName: null,
              rulesetLabel: '',
              rulesBaseUrl: null,
              licenseUrl: null,
              iconUrl: APP_ICON_URL
            }
          );
          updateWindowTitle();
          await loadConditionLibraryFromServer();
          await refreshCharacterState(getOwnerName());
          return false;
        }
        throw new Error('Server returned ' + res.status);
      }
      const campaign = await res.json();
      const previousCampaignId = currentCampaignId || '';
      currentCampaignId = campaign.id || '';
      currentCampaignName = campaign.name || '';
      currentRulesetId = campaign.rulesetId || '';
      updateCampaignHeader(
        {
          nameTargets: campaignHeaderNameTargets,
          linkTargets: campaignHeaderLinkTargets,
          licenseTargets: campaignHeaderLicenseTargets
        },
        {
          campaignName: currentCampaignName || null,
          rulesetLabel: campaign.rulesetLabel || '',
          rulesBaseUrl: null,
          licenseUrl: null
        }
      );
      updateWindowTitle();
      await loadConditionLibraryFromServer();
      await refreshCharacterState(getOwnerName());
      if (previousCampaignId && previousCampaignId !== currentCampaignId) {
        campaignLiveStream.close();
        if (preferPlayerView) {
          return false;
        }
        window.location.replace('/index.html');
        return false;
      }
      return true;
    } catch (err) {
      console.error('Failed to load campaign:', err);
      currentCampaignId = '';
      currentCampaignName = '';
      updateCampaignHeader(
        {
          nameTargets: campaignHeaderNameTargets,
          iconTargets: campaignHeaderIconTargets,
          linkTargets: campaignHeaderLinkTargets,
          licenseTargets: campaignHeaderLicenseTargets
        },
        {
          campaignName: currentCampaignName || null,
          rulesetLabel: '',
          rulesBaseUrl: null,
          licenseUrl: null,
          iconUrl: currentCampaignName ? undefined : APP_ICON_URL
        }
      );
      updateWindowTitle();
      await loadConditionLibraryFromServer();
      await refreshCharacterState(getOwnerName());
      campaignLiveStream.close();
      return false;
    }
  }

  async function loadConditionLibraryFromServer() {
    if (conditionGrid) {
      conditionGrid.innerHTML = '';
      const loading = document.createElement('div');
      loading.className = 'subtitle';
      loading.textContent = 'Loading conditions...';
      conditionGrid.appendChild(loading);
    }

    try {
      const res = await fetch('/conditions-library');
      if (!res.ok) {
        if (res.status === 403 && displayOnly) {
          logDisplayForbidden('GET /conditions-library');
        }
        throw new Error('Server returned ' + res.status);
      }
      const json = await res.json();
      setConditionLibraryFromSet(json);
    } catch (err) {
      console.warn('Unable to load condition library from server. No conditions available.', err);
      setConditionLibraryFromSet(EMPTY_CONDITION_SET);
    }

    updateSelectedConditionsDisplay();
  }

  function conditionsSignature(source) {
    const arr = Array.isArray(source) ? source.slice() : Array.from(source);
    return JSON.stringify(arr.sort());
  }

  function updateSelectedConditionsDisplay() {
    if (!selectedConditionsWrap) return;
    selectedConditionsWrap.innerHTML = '';
    if (selectedConditions.size === 0) {
      const pill = document.createElement('span');
      pill.className = 'selected-pill';
      pill.textContent = 'No conditions';
      selectedConditionsWrap.appendChild(pill);
      return;
    }

    for (const conditionName of Array.from(selectedConditions).sort()) {
      const pill = document.createElement('span');
      pill.className = 'selected-pill';
      const nameSpan = document.createElement('span');
      nameSpan.textContent = conditionName;
      pill.appendChild(nameSpan);

      const entry = conditionLookup.get(conditionName);
      const link = createConditionLink(entry?.link);
      if (link) {
        pill.appendChild(link);
      }

      selectedConditionsWrap.appendChild(pill);
    }
  }

  function renderConditionGrid(filterText = '') {
    if (!conditionGrid) return;
    const normalizedFilter = filterText.trim().toLowerCase();
    conditionGrid.innerHTML = '';

    if (conditionLibrary.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.className = 'subtitle';
      emptyState.textContent = 'No conditions available.';
      conditionGrid.appendChild(emptyState);
      return;
    }

    const filtered = conditionLibrary.filter((condition) =>
      condition.name.toLowerCase().includes(normalizedFilter)
    );

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'subtitle';
      empty.textContent = 'No matching conditions.';
      conditionGrid.appendChild(empty);
      return;
    }

    filtered.forEach((condition) => {
      const wrapper = document.createElement('button');
      wrapper.type = 'button';
      wrapper.classList.add('condition-row');
      wrapper.setAttribute('aria-pressed', selectedConditions.has(condition.name) ? 'true' : 'false');
      if (selectedConditions.has(condition.name)) {
        wrapper.classList.add('selected');
      }

      wrapper.addEventListener('click', () => {
        if (selectedConditions.has(condition.name)) {
          selectedConditions.delete(condition.name);
          wrapper.classList.remove('selected');
          wrapper.setAttribute('aria-pressed', 'false');
        } else {
          selectedConditions.add(condition.name);
          wrapper.classList.add('selected');
          wrapper.setAttribute('aria-pressed', 'true');
        }
        conditionsDirty = true;
        formDirty = true;
        lastConditionsSignatureFromState = null;
        updateSelectedConditionsDisplay();
      });

      const indicator = document.createElement('span');
      indicator.className = 'condition-row-indicator';
      indicator.textContent = selectedConditions.has(condition.name) ? '✓' : '';
      wrapper.appendChild(indicator);

      const nameSpan = document.createElement('span');
      nameSpan.classList.add('condition-row-name');
      nameSpan.textContent = condition.name;
      const nameContainer = document.createElement('div');
      nameContainer.classList.add('condition-name-cell');
      nameContainer.appendChild(nameSpan);

      const link = createConditionLink(condition.link);
      if (link) {
        link.addEventListener('click', (event) => {
          event.stopPropagation();
        });
        link.classList.add('condition-row-link');
        nameContainer.appendChild(link);
      }

      wrapper.appendChild(nameContainer);
      wrapper.addEventListener('click', () => {
        indicator.textContent = selectedConditions.has(condition.name) ? '✓' : '';
      });
      conditionGrid.appendChild(wrapper);
    });
  }

  function applySelectedConditions(nextList) {
    selectedConditions = new Set(nextList);
    conditionsDirty = false;
    lastConditionsSignatureFromState = conditionsSignature(nextList);
    updateSelectedConditionsDisplay();
    renderConditionGrid(conditionFilterInput ? conditionFilterInput.value : '');
  }

  function syncConditionsFromState(players) {
    if (!conditionGrid || conditionsDirty) return;
    if (!selectedCharacterId) return;

    const match = players.find((player) => player.id === selectedCharacterId);
    if (!match) return;

    const serverConditions = Array.isArray(match.conditions) ? match.conditions : [];
    const signature = conditionsSignature(serverConditions);
    if (signature === lastConditionsSignatureFromState) return;

    applySelectedConditions(serverConditions);
  }

  if (conditionFilterInput) {
    conditionFilterInput.addEventListener('input', (event) => {
      renderConditionGrid(event.target.value || '');
    });
  }

  if (ownerInput) {
    ownerInput.addEventListener('change', async () => {
      const ownerName = getOwnerName();
      if (!ownerName) return;
      try {
        await joinPlayerSession(ownerName);
        await refreshCharacterState(ownerName);
      } catch (err) {
        console.error('Failed to join player session:', err);
      }
    });
  }

  function showPlayerNameEdit(show) {
    if (!playerNameEdit) return;
    playerNameEdit.classList.toggle('visible', show);
    if (playerNameEditBtn) {
      playerNameEditBtn.classList.toggle('hidden', show);
    }
    if (playerNameInput) {
      playerNameInput.readOnly = !show;
    }
  }

  if (playerNameEditBtn && playerNameInput) {
    playerNameEditBtn.addEventListener('click', () => {
      const ownerName = getOwnerName();
      playerNameInput.value = ownerName;
      playerNameInput.classList.remove('player-name-placeholder');
      showPlayerNameEdit(true);
      playerNameInput.focus();
    });
  }

  if (playerNameCancelBtn && playerNameInput) {
    playerNameCancelBtn.addEventListener('click', () => {
      if (!getOwnerName()) {
        playerNameInput.focus();
        playerNameInput.select();
        return;
      }
      playerNameInput.value = getOwnerName();
      updatePlayerNameDisplay();
      showPlayerNameEdit(false);
      updateWindowTitle();
    });
  }

  if (playerNameSaveBtn && playerNameInput) {
    playerNameSaveBtn.addEventListener('click', async () => {
      const newName = playerNameInput.value.trim();
      if (!newName) return;
      try {
        let res = await fetch('/player/session', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ displayName: newName })
        });
        const outcome = resolvePlayerNameSaveOutcome({
          status: res.status,
          responsePayload: res.status >= 200 && res.status < 300 ? await res.json().catch(() => ({})) : null,
          enteredName: newName
        });
        if (outcome.kind === 'session-expired') {
          statusDiv.textContent = SESSION_EXPIRED_MESSAGE;
          currentPlayerSessionId = '';
          await bootstrapPlayerSession();
          showPlayerNameEdit(false);
          return;
        }
        if (outcome.kind === 'error') {
          throw new Error(outcome.message);
        }
        const player = (outcome && outcome.kind === 'saved') ? {
          id: outcome.playerId,
          displayName: outcome.displayName
        } : {};
        currentPlayerSessionId = player.id || currentPlayerSessionId;
        const savedName = player.displayName || newName;
        if (ownerInput) ownerInput.value = savedName;
        if (playerNameInput) playerNameInput.value = savedName;
        updatePlayerNameDisplay();
        await refreshCharacterState(savedName);
        statusDiv.textContent = '';
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('Failed to rename player:', err);
        statusDiv.textContent = `Rename failed: ${message}`;
      }
      showPlayerNameEdit(false);
    });
  }

  if (playerNameInput) {
    playerNameInput.addEventListener('input', () => {
      updateWindowTitle();
    });
  }

  if (addCharacterBtn) {
    if (!displayOnly) {
      addCharacterBtn.addEventListener('click', () => {
        showAddForm();
        if (conditionsToggle && conditionsPanel) {
          setConditionsPanelOpen(false);
        }
      });
    } else {
      addCharacterBtn.style.display = 'none';
    }
  }

  if (removeCharacterBtn) {
    if (!displayOnly) {
      removeCharacterBtn.addEventListener('click', () => {
        closeCharacterOverflowMenu();
        const selected = myCharacters.find((character) => character.id === selectedCharacterId);
        if (!selected) return;
        const confirmed = confirm(`Remove ${selected.name} from the tracker?`);
        if (!confirmed) return;
        deleteMyCharacter(selected);
      });
    } else {
      removeCharacterBtn.style.display = 'none';
    }
  }

  if (releaseCharacterBtn) {
    releaseCharacterBtn.addEventListener('click', async () => {
      closeCharacterOverflowMenu();
      const selected = selectedCharacterId
        ? myCharacters.find((character) => character.id === selectedCharacterId)
        : null;
      if (!selected || selected.claimedSessionId !== currentPlayerSessionId) return;
      await releaseClaimForCharacter(selected);
    });
  }

  if (characterOverflowToggle) {
    characterOverflowToggle.addEventListener('click', (event) => {
      event.stopPropagation();
      if (!selectedCharacterId) return;
      toggleCharacterOverflowMenu();
    });
  }

  if (characterOverflowMenu) {
    characterOverflowMenu.addEventListener('click', (event) => {
      event.stopPropagation();
    });
  }

  document.addEventListener('click', () => {
    closeCharacterOverflowMenu();
  });

  updateSelectedConditionsDisplay();

  async function handleAddCharacterSubmit() {
    const ownerName = getOwnerName();
    const name = addNameInput ? addNameInput.value.trim() : '';
    if (!ownerName || !name) {
      statusDiv.textContent = 'Player and character are required.';
      return;
    }

    const statsPayload = [];
    for (const key of statKeys) {
      const entry = addStatInputs.get(key);
      const maxStr = entry?.maxInput ? entry.maxInput.value.trim() : '';
      const currentStr = entry?.currentInput ? entry.currentInput.value.trim() : '';
      const isTempHp = key === 'TempHP';
      if (!isTempHp && maxStr === '') {
        statusDiv.textContent = `Max ${key} is required.`;
        return;
      }
      const maxVal = isTempHp ? 0 : Number(maxStr);
      const requiresPositiveMax = !isTempHp;
      if (!isTempHp && (!Number.isFinite(maxVal) || (requiresPositiveMax ? maxVal <= 0 : maxVal < 0))) {
        statusDiv.textContent = requiresPositiveMax
          ? `Max ${key} must be greater than 0.`
          : `Max ${key} must be 0 or greater.`;
        return;
      }
      const currentVal = currentStr === '' ? (isTempHp ? 0 : maxVal) : Number(currentStr);
      if (!Number.isFinite(currentVal)) {
        statusDiv.textContent = `${key} current value must be a valid number.`;
        return;
      }
      const allowsNegative = key !== 'TempHP' && allowNegativeHealth;
      if ((!isTempHp && currentVal > maxVal) || (!allowsNegative && currentVal < 0)) {
        statusDiv.textContent = allowsNegative
          ? `${key} current must be less than or equal to Max.`
          : `${key} current must be between 0 and Max.`;
        return;
      }
      statsPayload.push({ key, current: currentVal, max: isTempHp ? 0 : maxVal });
    }

    try {
      await ensurePlayerSessionId();
      const conditionList = [];
      const initiativeBonusRaw = addInitiativeBonusInput ? addInitiativeBonusInput.value.trim() : '0';
      const initiativeBonus = initiativeBonusRaw === '' ? 0 : Number(initiativeBonusRaw);
      if (!Number.isFinite(initiativeBonus)) {
        statusDiv.textContent = 'Initiative bonus must be a valid number.';
        return;
      }
      const payload = {
        ownerId: currentPlayerSessionId,
        ownerName,
        name,
        initiative: null,
        stats: statsPayload,
        revealStats: addRevealStatsInput ? addRevealStatsInput.checked : null,
        autoSkipTurn: addAutoSkipTurnInput ? addAutoSkipTurnInput.checked : null,
        useAppInitiativeRoll: addUseAppInitiativeRollInput ? addUseAppInitiativeRollInput.checked : true,
        initiativeBonus,
        conditions: conditionList
      };
      if (currentCampaignName) {
        payload.campaignName = currentCampaignName;
      }
      if (!currentCampaignId) {
        throw new Error('No active campaign selected.');
      }
      const characterRes = await fetch(
        `/campaigns/${encodeURIComponent(currentCampaignId)}/me/characters`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      if (!characterRes.ok) {
        if (characterRes.status === 401 || characterRes.status === 403) {
          if (preferPlayerView) {
            return;
          }
          window.location.replace('/index.html');
          return;
        }
        throw new Error('Server returned ' + characterRes.status);
      }

      const savedCharacter = await characterRes.json();
      selectedCharacterId = savedCharacter.id;
      hideAddForm();
      await refreshCharacterState(ownerName);
      await loadState();
    } catch (err) {
      statusDiv.textContent = 'Error: ' + err.message;
    }
  }

  async function initApp() {
    const hadPlayerSession = await bootstrapPlayerSession();
    updatePlayerEntryGate();
    updatePlayerNameDisplay();
    if (!displayOnly) {
      if (!hadPlayerSession && !getOwnerName()) {
        if (!isJoinPage() && !preferPlayerView) {
          window.location.replace('/index.html');
          return;
        }
      }
    }
    await loadCampaign();
    if (!displayOnly && currentCampaignName && !hadPlayerSession) {
      const savedOwnerName = getOwnerName();
      if (!savedOwnerName) {
        updatePlayerNameDisplay();
        await loadState();
        campaignLiveStream.start();
        return;
      }
      try {
        await joinPlayerSession(savedOwnerName);
        await refreshCharacterState(savedOwnerName);
      } catch (err) {
        console.error('Failed to bootstrap player session:', err);
      }
    }
    await loadState();
    campaignLiveStream.start();
  }

  initApp();

  // --- Load state (round + current turn + players) -------------------------

  async function loadState() {
    if (loadStateInFlight) {
      loadStateRefreshQueued = true;
      return;
    }
    loadStateInFlight = true;
    try {
      const res = await fetch('/state');
      if (!res.ok) {
        if (res.status === 403 && displayOnly) {
          logDisplayForbidden('GET /state');
          loadStateInFlight = false;
          if (loadStateRefreshQueued) {
            loadStateRefreshQueued = false;
            void loadState();
          }
          return;
        }
        if (res.status === 401 || res.status === 403) {
          if (preferPlayerView) {
            loadStateInFlight = false;
            if (loadStateRefreshQueued) {
              loadStateRefreshQueued = false;
              void loadState();
            }
            return;
          }
          window.location.replace('/index.html');
          return;
        }
        if (res.status === 409) {
          currentTurnId = null;
          encounterState = 'new';
          myCharacters = [];
          selectedCharacterId = null;
          lastTurnId = null;
          lastStateJson = null;
          renderCharacterList();
          if (playersBody) {
            playersBody.innerHTML = '';
            playersBody.appendChild(createEmptyEncounterRow(conditionLibrary.length > 0 ? 4 : 3));
          }
          if (currentActor) {
            currentActor.textContent = '';
            currentActor.classList.remove('current-actor-mine');
          }
          updateEncounterStateDisplay();
          updateConditionsAvailability();
          return;
        }
        throw new Error('Server returned ' + res.status);
      }

      const state = await res.json();
      const players = state.players || [];
      const round = state.round || 1;
      encounterState = state.encounterState || 'new';
      currentTurnId = state.currentTurnId || null;
      const currentTurnPlayer = currentTurnId
        ? players.find((player) => player.id === currentTurnId) || null
        : null;
      const turnChanged = currentTurnId !== lastTurnId;

      // Build a normalized snapshot for no-blink detection
      const normalized = {
        round,
        currentTurnName: currentTurnPlayer?.name || null,
        currentTurnId,
        players,
        encounterState
      };
      const currentJson = JSON.stringify(normalized);

      if (currentJson === lastStateJson) {
        // No change → no DOM update → no blinking
        // Still need to update "Turn Complete" visibility, because it
        // depends on local saved name (but that rarely changes)
      } else {
        lastStateJson = currentJson;

        const isMineTurn = Boolean(
          currentTurnId && myCharacters.some((character) => character.id === currentTurnId)
        );
        updateEncounterStateDisplay(round, currentTurnPlayer, isMineTurn);
        if (currentActor) {
          if (hideTurnTable && currentTurnId) {
            const current = players.find((player) => player.id === currentTurnId);
            if (current) {
              currentActor.textContent = `Acting: ${current.name}`;
              currentActor.classList.toggle('current-actor-mine', Boolean(isMineTurn));
            } else {
              currentActor.textContent = '';
              currentActor.classList.remove('current-actor-mine');
            }
          } else {
            currentActor.textContent = '';
            currentActor.classList.remove('current-actor-mine');
          }
        }

        // Rebuild table
        playersBody.innerHTML = '';

        if (players.length === 0) {
          const hasConditions = conditionLibrary.length > 0;
          playersBody.appendChild(createEmptyEncounterRow(hasConditions ? 4 : 3));
        } else {
          for (const p of players) {
            const tr = document.createElement('tr');
            tr.classList.add('player-row');

            const initTd = document.createElement('td');
            const nameTd = document.createElement('td');
            const hpTd = document.createElement('td');
            const conditionsTd = document.createElement('td');
            conditionsTd.classList.add('conditions-cell');

            initTd.textContent = formatInitiative(p.initiative);
            if (p.isReferee) {
              initTd.classList.add('init-referee');
            }
            nameTd.innerHTML = '';
            const nameLine = document.createElement('div');
            nameLine.textContent = p.name;
            nameTd.appendChild(nameLine);
            const controllerName = getCharacterControllerName(p);
            if (controllerName) {
              const ownerLine = document.createElement('div');
              ownerLine.classList.add('player-owner');
              ownerLine.textContent = `(${controllerName})`;
              nameTd.appendChild(ownerLine);
            }

            const isMine =
              !displayOnly &&
              Boolean(currentPlayerSessionId) &&
              ((p.ownerId && p.ownerId === currentPlayerSessionId) ||
                myCharacters.some((character) => character.id === p.id));
            if (isMine) {
              initTd.classList.add('init-mine');
            }

            const stats = Array.isArray(p.stats) ? p.stats : [];
            const orderedStats = orderedEncounterStats(stats, statKeys);
            const statusInfo = encounterStatusInfo(stats, statKeys);

            if (statusInfo) {
              applyEncounterHealthClasses(hpTd, statusInfo);
              hpTd.innerHTML = '';
              const canReveal = isMine || p.revealStats;
              if (!canReveal) {
                const statusLabel = healthStatusLabel(statusInfo.ratio, statusInfo.isDead);
                const statusLine = document.createElement('div');
                statusLine.textContent = statusLabel;
                hpTd.appendChild(statusLine);
              }
              if (canReveal) {
                const valueLine = document.createElement('div');
                valueLine.textContent = formatEncounterStatsText(orderedStats, statKeys);
                hpTd.appendChild(valueLine);
              }
            } else {
              hpTd.textContent = '—';
            }

            const list = buildEncounterConditionsList(p.conditions, conditionLookup);
            if (list) {
              conditionsTd.appendChild(list);
            } else {
              conditionsTd.textContent = '—';
            }

            if (currentTurnId && p.id === currentTurnId) {
              tr.classList.add('current-turn');
            }

            tr.appendChild(initTd);
            tr.appendChild(nameTd);
            tr.appendChild(hpTd);
            tr.appendChild(conditionsTd);
            playersBody.appendChild(tr);
          }
        }

        syncMyCharacterStatsFromState(players);
        syncConditionsFromState(players);

        if (currentTurnId && turnChanged && !formDirty && !isEditingForm) {
          if (myCharacters.some((character) => character.id === currentTurnId)) {
            if (selectedCharacterId !== currentTurnId) {
              selectCharacter(currentTurnId);
            }
          }
        }

        renderCharacterList();
        lastTurnId = currentTurnId;
      }

    } catch (err) {
      statusDiv.textContent = 'Error loading state: ' + err.message;
    } finally {
      await loadClaimableCharacters();
      loadStateInFlight = false;
      if (loadStateRefreshQueued) {
        loadStateRefreshQueued = false;
        loadState();
      }
    }
  }

  // --- Save player (add/update this client's entry) ------------------------

  async function persistCharacterPayload(payload, { showStatus = true, successMessage = '' } = {}) {
      const ownerName = payload.ownerName || getOwnerName();
      const safeOwnerName = sanitizePlayerDisplayName(ownerName) || 'Player';
      if (showStatus) {
        statusDiv.textContent = 'Saving...';
      }

    try {
      await ensurePlayerSessionId();
      if (!payload.ownerId) {
        payload.ownerId = currentPlayerSessionId;
      }
      if (currentCampaignName) {
        payload.campaignName = currentCampaignName;
      }
      if (!currentCampaignId) {
        throw new Error('No active campaign selected.');
      }
      const characterRes = await fetch(
        `/campaigns/${encodeURIComponent(currentCampaignId)}/me/characters`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      if (!characterRes.ok) {
        if (characterRes.status === 401 || characterRes.status === 403) {
          if (preferPlayerView) {
            return null;
          }
          window.location.replace('/index.html');
          return null;
        }
        throw new Error('Server returned ' + characterRes.status);
      }

      const savedCharacter = await characterRes.json();
      selectedCharacterId = savedCharacter.id;

      if (showStatus) {
        statusDiv.textContent = successMessage;
      } else {
        statusDiv.textContent = '';
      }
      isCreatingCharacter = false;
      updateConditionsAvailability();

      lastStateJson = null;
      await refreshCharacterState(safeOwnerName);
      await loadState();
      return savedCharacter;
    } catch (err) {
      statusDiv.textContent = 'Error: ' + err.message;
      return null;
    }
  }

  async function saveCharacterDetails({ showStatus = true } = {}) {
    const ownerName = getOwnerName();
    const name = nameInput.value.trim();
    if (!ownerName || !name || !selectedCharacterId) {
      statusDiv.textContent = 'Player and character are required.';
      return;
    }
    const selectedCharacter = myCharacters.find((character) => character.id === selectedCharacterId);
    let stats;
    try {
      stats = collectStatPayloadFromInputs(statInputs, selectedCharacter?.stats, {
        allowNegativeHealth
      });
    } catch (err) {
      statusDiv.textContent = err.message;
      return;
    }
    const initiative = selectedCharacter ? selectedCharacter.initiative : null;
    const initiativeBonusRaw = initiativeBonusInput ? initiativeBonusInput.value.trim() : '0';
    const initiativeBonus = initiativeBonusRaw === '' ? 0 : Number(initiativeBonusRaw);
    if (!Number.isFinite(initiativeBonus)) {
      statusDiv.textContent = 'Initiative bonus must be a valid number.';
      return;
    }
    const payload = {
      id: selectedCharacterId,
      ownerId: currentPlayerSessionId,
      ownerName,
      name,
      initiative,
      stats,
      revealStats: revealStatsInput ? revealStatsInput.checked : null,
      autoSkipTurn: autoSkipTurnInput ? autoSkipTurnInput.checked : null,
      useAppInitiativeRoll: useAppInitiativeRollInput ? useAppInitiativeRollInput.checked : true,
      initiativeBonus,
      conditions: Array.isArray(selectedCharacter?.conditions) ? selectedCharacter.conditions : []
    };
    const savedCharacter = await persistCharacterPayload(payload, {
      showStatus,
      successMessage: `Saved ${name}.`
    });
    if (!savedCharacter) return;
    formDirty = false;
    updateDraftFromForm();
  }

  async function saveCharacterConditions({ showStatus = true } = {}) {
    const ownerName = getOwnerName();
    const selectedCharacter = myCharacters.find((character) => character.id === selectedCharacterId);
    if (!ownerName || !selectedCharacter || !selectedCharacterId) {
      statusDiv.textContent = 'Player and character are required.';
      return;
    }
    const conditionList = Array.from(selectedConditions);
    const payload = {
      id: selectedCharacterId,
      ownerId: currentPlayerSessionId,
      ownerName,
      name: selectedCharacter.name,
      initiative: selectedCharacter.initiative,
      stats: Array.isArray(selectedCharacter.stats) ? selectedCharacter.stats : [],
      revealStats: selectedCharacter.revealStats,
      autoSkipTurn: selectedCharacter.autoSkipTurn,
      useAppInitiativeRoll: selectedCharacter.useAppInitiativeRoll,
      initiativeBonus: selectedCharacter.initiativeBonus,
      conditions: conditionList
    };
    const savedCharacter = await persistCharacterPayload(payload, {
      showStatus,
      successMessage: `Saved ${selectedCharacter.name} — ${conditionList.length} condition${conditionList.length === 1 ? '' : 's'}.`
    });
    if (!savedCharacter) return;
    conditionsDirty = false;
    lastConditionsSignatureFromState = conditionsSignature(conditionList);
  }

  // --- Clear all players (admin-only) --------------------------------------

  async function handleClear() {
    if (!displayOnly) {
      statusDiv.textContent = 'Clear is only available on localhost.';
      return;
    }

    const sure = confirm('Really clear the entire player list?');
    if (!sure) return;

    try {
      const res = await fetch('/users', { method: 'DELETE' });
      if (!res.ok) throw new Error('Server returned ' + res.status);

      statusDiv.textContent = 'All players cleared.';
      lastStateJson = null;
      await loadState();
    } catch (err) {
      statusDiv.textContent = 'Error clearing players: ' + err.message;
    }
  }

  // --- Turn complete (advance to next player) ------------------------------

  async function handleTurnComplete() {
    try {
      const res = await fetch('/turn-complete', { method: 'POST' });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          if (preferPlayerView) {
            return;
          }
          window.location.replace('/index.html');
          return;
        }
        throw new Error('Server returned ' + res.status);
      }

      lastStateJson = null;
      await loadState();
    } catch (err) {
      statusDiv.textContent = 'Error advancing turn: ' + err.message;
    }
  }

  // --- Wire up events + timers ---------------------------------------------

  if (!displayOnly) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
    });
  }
  if (detailsSaveBtn) {
    detailsSaveBtn.addEventListener('click', () => {
      saveCharacterDetails({ showStatus: true });
    });
  }
  if (detailsCancelBtn) {
    detailsCancelBtn.addEventListener('click', () => {
      if (!confirmDiscardDetailsChanges()) return;
      detailsPanel.classList.remove('details-panel-open');
      detailsPanel.classList.add('details-panel-collapsed');
      detailsPanel.classList.add('hidden');
      detailsToggle?.setAttribute('aria-expanded', 'false');
      detailsPanel.setAttribute('aria-hidden', 'true');
    });
  }
  if (conditionsSaveBtn) {
    conditionsSaveBtn.addEventListener('click', async () => {
      await saveCharacterConditions({ showStatus: true });
      if (!conditionsDirty) {
        setConditionsPanelOpen(false);
      }
    });
  }
  if (conditionsCancelBtn) {
    conditionsCancelBtn.addEventListener('click', () => {
      if (!confirmDiscardConditionChanges()) return;
      setConditionsPanelOpen(false);
    });
  }

  if (initiativeSaveBtn) {
    initiativeSaveBtn.addEventListener('click', async () => {
      await saveInitiativeFromEditor(false);
    });
  }

  if (initiativeClearBtn) {
    initiativeClearBtn.addEventListener('click', async () => {
      await saveInitiativeFromEditor(true);
    });
  }

  if (initiativeCancelBtn) {
    initiativeCancelBtn.addEventListener('click', () => {
      closeInitiativeEditor();
    });
  }

  if (initiativeEditorInput) {
    initiativeEditorInput.addEventListener('keydown', async (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        await saveInitiativeFromEditor(false);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        closeInitiativeEditor();
      }
    });
  }

  if (initiativePanel) {
    initiativePanel.addEventListener('click', (event) => {
      if (event.target !== initiativePanel) return;
      closeInitiativeEditor();
    });
  }
  if (addSaveBtn) {
    addSaveBtn.addEventListener('click', () => {
      handleAddCharacterSubmit();
    });
  }
  if (addNameInput) {
    addNameInput.addEventListener('input', () => {
      if (conditionsCharacter && isCreatingCharacter) {
        conditionsCharacter.textContent = addNameInput.value.trim() || 'this character';
      }
    });
  }
  if (addCancelBtn) {
    addCancelBtn.addEventListener('click', () => {
      const hasAddDraft =
        Boolean(addNameInput?.value.trim()) ||
        Array.from(addStatInputs.values()).some((entry) =>
          Boolean(entry.currentInput?.value.trim()) || Boolean(entry.maxInput?.value.trim())
        ) ||
        Boolean(addInitiativeBonusInput?.value.trim()) ||
        Boolean(addRevealStatsInput?.checked) ||
        Boolean(addAutoSkipTurnInput?.checked) ||
        (addUseAppInitiativeRollInput ? addUseAppInitiativeRollInput.checked === false : false);
      if (hasAddDraft && !confirm('Discard new character changes?')) return;
      hideAddForm();
    });
  }

  function setInitiativePanelOpen(open) {
    if (!initiativePanel) return;
    initiativePanel.classList.toggle('hidden', !open);
    initiativePanel.setAttribute('aria-hidden', (!open).toString());
  }

  function openInitiativeEditor(character) {
    if (!character || !initiativePanel || !initiativeEditorInput) return;
    initiativeEditorCharacterId = character.id;
    if (initiativeDialogTitle) {
      initiativeDialogTitle.textContent = `Set Initiative for ${character.name}`;
    }
    initiativeEditorInput.value = Number.isFinite(character.initiative) ? String(character.initiative) : '';
    setInitiativePanelOpen(true);
    window.requestAnimationFrame(() => {
      initiativeEditorInput.focus();
      initiativeEditorInput.select();
    });
  }

  function closeInitiativeEditor() {
    initiativeEditorCharacterId = null;
    if (initiativeEditorInput) {
      initiativeEditorInput.value = '';
    }
    setInitiativePanelOpen(false);
  }

  async function saveInitiativeFromEditor(clearValue = false) {
    if (!initiativeEditorCharacterId) return;
    const character = myCharacters.find((entry) => entry.id === initiativeEditorCharacterId);
    if (!character) {
      closeInitiativeEditor();
      return;
    }

    const raw = clearValue || !initiativeEditorInput ? '' : initiativeEditorInput.value;
    const trimmed = raw.trim();
    if (!trimmed) {
      character.initiative = null;
      await saveCharacterEntry(character);
      closeInitiativeEditor();
      return;
    }

    const initiative = Number(trimmed);
    if (!Number.isFinite(initiative)) {
      statusDiv.textContent = 'Initiative must be a valid number.';
      if (initiativeEditorInput) {
        initiativeEditorInput.focus();
        initiativeEditorInput.select();
      }
      return;
    }

    character.initiative = initiative;
    await saveCharacterEntry(character);
    closeInitiativeEditor();
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', handleClear);
  }

  // Initial load + auto-refresh
  
});
