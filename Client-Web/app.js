// Shared state
let lastStateJson = null;
const REFRESH_INTERVAL_MS = 5000;
let skipRefresh = false;

const { QR_CODE_SIZE, rollStandardDie, formatInitiative } = window.PlayerTrackerShared || {
  QR_CODE_SIZE: 96,
  rollStandardDie: () => null,
  formatInitiative: () => 'X'
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
const { updateRulesetIcons, updateRulesetLinks, updateRulesetLicenses } = window.PlayerTrackerRuleset || {
  updateRulesetIcons: () => {},
  updateRulesetLinks: () => {},
  updateRulesetLicenses: () => {}
};
const AUTO_SAVE_DELAY_MS = 600;
const LOCAL_DRAFT_PREFIX = 'characterDrafts:';

const EMPTY_CONDITION_SET = {
  id: 'none',
  label: '',
  rulesBaseUrl: '',
  conditions: []
};

function normalizePlayerName(name) {
  return (name || '').trim().toLowerCase();
}

// Detect whether this client is "admin" (local machine)
function isAdminHost() {
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

function isDisplayPath() {
  const path = window.location.pathname || '';
  return path === '/display.html' || path.endsWith('/display.html');
}

const shouldRedirectToDisplay =
  isAdminHost() &&
  !isDisplayPath() &&
  (window.location.pathname === '/' || window.location.pathname.endsWith('/index.html'));

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

// Fetch the server IP and show "Connect to http://IP:8080" + QR
async function showServerIP(ipDisplayElement) {
  if (!ipDisplayElement) return;

  try {
    const res = await fetch('/server-ip');
    if (!res.ok) return;

    const json = await res.json();
    const ip = json.ip;

    if (ip && ip !== 'unknown') {
      const url = `http://${ip}:8080`;
      ipDisplayElement.textContent = url;
      renderQrCode(url);
    }
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

  const ipDisplay = document.getElementById('ip-display');
  const qrContainer = document.getElementById('qr-container'); // if you have it

  const ownerInput = document.getElementById('owner-name');
  const playerNameEdit = document.getElementById('player-name-edit');
  const playerNameInput = document.getElementById('player-name-input');
  const playerNameEditBtn = document.getElementById('edit-player-name');
  const playerNameSaveBtn = document.getElementById('player-name-save');
  const playerNameCancelBtn = document.getElementById('player-name-cancel');
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
  const conditionsSaveBtn = document.getElementById('conditions-save');
  const conditionsCancelBtn = document.getElementById('conditions-cancel');
  const detailsSaveBtn = document.getElementById('details-save');
  const detailsCancelBtn = document.getElementById('details-cancel');
  const playerListSection = document.querySelector('.player-list');
  const playerTable = playerListSection ? playerListSection.querySelector('table') : null;
  const characterListActions = document.querySelector('.character-list-actions');
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
  let allowNegativeHealth = false;
  let supportsTempHp = false;
  let currentStandardDie = null;
  let ownerId = localStorage.getItem('playerId') || '';
  let statInputs = new Map();
  let addStatInputs = new Map();
  const perCharacterSaveTimers = new Map();
  let isCreatingCharacter = false;
  let conditionsPanelOpen = false;

  function updateRulesetLink(labelText, baseUrl) {
    updateRulesetLinks([rulesetLink, playerRulesetLink, displayRulesetLink], labelText, baseUrl);
  }

  function updateRulesetLicense(licenseUrl) {
    updateRulesetLicenses(
      [
        { linkEl: rulesetLicense, wrapEl: rulesetLicenseWrap },
        { linkEl: playerRulesetLicense, wrapEl: playerRulesetLicenseWrap },
        { linkEl: displayRulesetLicense, wrapEl: displayRulesetLicenseWrap }
      ],
      licenseUrl
    );
  }

  function setRulesetIcon(iconUrl, labelText) {
    updateRulesetIcons([rulesetIcon, playerRulesetIcon, displayRulesetIcon], iconUrl, labelText);
  }

  const displayOnly = isDisplayPath();
  const viewMode = new URLSearchParams(window.location.search).get('view');
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

  function updatePlayerNameDisplay() {
    if (!playerNameInput) return;
    const ownerName = getOwnerName();
    playerNameInput.value = ownerName ? ownerName : 'Player';
    playerNameInput.classList.toggle('player-name-placeholder', !ownerName);
    document.body.classList.toggle('no-player-name', !ownerName);
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
      document.title = 'Turn Track';
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
    showServerIP(ipDisplay);
  } else {
    if (adminToolbar) adminToolbar.style.display = 'none';
    if (ipDisplay) ipDisplay.textContent = '';
    if (qrContainer) qrContainer.innerHTML = '';
  }

  // Restore last-used owner name
  const savedOwner =
    localStorage.getItem('ownerName') || localStorage.getItem('playerName');
  if (savedOwner && ownerInput) {
    ownerInput.value = savedOwner;
    localStorage.setItem('ownerName', savedOwner);
  }
  updatePlayerNameDisplay();
  updateInitiativeBonusAvailability();
  updateAddInitiativeBonusAvailability();
  if (playerNameInput && savedOwner) {
    playerNameInput.value = savedOwner;
  }

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
      await ensureOwnerId();
      const payload = {
        id: character.id,
        ownerId,
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
      const characterRes = await fetch('/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!characterRes.ok) {
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
    const entered = prompt(
      `Set initiative for ${character.name} (leave blank to clear)`,
      Number.isFinite(character.initiative) ? String(character.initiative) : ''
    );
    if (entered === null) return;
    const trimmed = entered.trim();
    if (!trimmed) {
      character.initiative = null;
      await saveCharacterEntry(character);
      return;
    }
    const initiative = Number(trimmed);
    if (!Number.isFinite(initiative)) {
      statusDiv.textContent = 'Initiative must be a valid number.';
      return;
    }
    character.initiative = initiative;
    await saveCharacterEntry(character);
  }

  async function deleteMyCharacter(character) {
    if (!character?.id) return;
    try {
      const res = await fetch(`/characters/${character.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Server returned ' + res.status);
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
      updateRulesetLink('', null);
      setRulesetIcon(null, '');
      updateRulesetLicense(null);
      document.body.classList.add('no-conditions');
      renderConditionGrid(conditionFilterInput ? conditionFilterInput.value : '');
      return;
    }

    conditionLibrary = normalizedEntries;
    conditionLookup = new Map(normalizedEntries.map((entry) => [entry.name, entry]));
    conditionLibraryLabel = conditionSet?.label || '';

    updateRulesetLink(conditionLibraryLabel, baseUrl);
    setRulesetIcon(conditionSet?.icon || null, conditionLibraryLabel);
    updateRulesetLicense(conditionSet?.license || null);

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

  async function ensureOwnerId() {
    const hadStoredId = Boolean(localStorage.getItem('playerId'));
    if (!ownerId || !isValidUuid(ownerId)) {
      ownerId = generateUuid();
    }
    let attempts = 0;
    while (attempts < 5) {
      try {
        const campaignQuery = currentCampaignName
          ? `?campaign=${encodeURIComponent(currentCampaignName)}`
          : '';
        const res = await fetch(
          `/players/${encodeURIComponent(ownerId)}/characters${campaignQuery}`
        );
        if (!res.ok) break;
        const existing = await res.json();
        const savedName = localStorage.getItem('ownerName') || '';
        if (Array.isArray(existing) && existing.length > 0 && !savedName && !hadStoredId) {
          ownerId = generateUuid();
          attempts += 1;
          continue;
        }
      } catch {
        break;
      }
      break;
    }
    localStorage.setItem('playerId', ownerId);
    return ownerId;
  }

  function renderCharacterList() {
    if (!characterList) return;
    characterList.innerHTML = '';
    if (selectionToolbarAnchor && detailsToggles) {
      selectionToolbarAnchor.appendChild(detailsToggles);
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

      if (character.id === selectedCharacterId && detailsToggles) {
        item.appendChild(detailsToggles);
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
  }

  function clearPendingCharacterSaveTimers() {
    perCharacterSaveTimers.forEach((timer) => clearTimeout(timer));
    perCharacterSaveTimers.clear();
  }

  function syncMyCharacterStatsFromState(players) {
    if (displayOnly) return;
    if (typeof ownerId === 'undefined' || !ownerId || !Array.isArray(players)) return;
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
        .filter((player) => player.ownerId && player.ownerId === ownerId)
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
    localStorage.setItem('selectedCharacterId', selectedCharacterId);
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
    localStorage.removeItem('selectedCharacterId');
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

    try {
      await ensureOwnerId();
      const campaignQuery = currentCampaignName
        ? `?campaign=${encodeURIComponent(currentCampaignName)}`
        : '';
      const res = await fetch(
        `/players/${encodeURIComponent(ownerId)}/characters${campaignQuery}`
      );
      if (!res.ok) throw new Error('Server returned ' + res.status);
      myCharacters = await res.json();
      applyDraftsToCharacters(ownerName, myCharacters);
      const savedCharacterId = localStorage.getItem('selectedCharacterId');
      if (savedCharacterId && myCharacters.some((c) => c.id === savedCharacterId)) {
        selectedCharacterId = savedCharacterId;
        selectCharacter(savedCharacterId);
      } else if (myCharacters.length > 0) {
        selectCharacter(myCharacters[0].id);
      } else {
        clearCharacterSelection();
      }
    } catch (err) {
      console.error('Failed to load characters:', err);
    }
  }

  async function loadCampaign() {
    try {
      const res = await fetch('/campaign');
      if (!res.ok) throw new Error('Server returned ' + res.status);
      const campaign = await res.json();
      currentCampaignName = campaign.name || '';
      currentRulesetId = campaign.rulesetId || '';
      localStorage.setItem('campaignName', currentCampaignName);
      if (campaignNameLabel) {
        campaignNameLabel.textContent = currentCampaignName || 'Campaign';
      }
      if (playerCampaignName) {
        playerCampaignName.textContent = currentCampaignName || 'Campaign';
      }
      if (displayCampaignName) {
        displayCampaignName.textContent = currentCampaignName || 'Campaign';
      }
      updateRulesetLink(campaign.rulesetLabel || '', null);
      updateWindowTitle();
    } catch (err) {
      console.error('Failed to load campaign:', err);
      currentCampaignName = localStorage.getItem('campaignName') || '';
      if (campaignNameLabel) {
        campaignNameLabel.textContent = currentCampaignName || 'Campaign';
      }
      if (playerCampaignName) {
        playerCampaignName.textContent = currentCampaignName || 'Campaign';
      }
      if (displayCampaignName) {
        displayCampaignName.textContent = currentCampaignName || 'Campaign';
      }
      updateWindowTitle();
    }

    await loadConditionLibraryFromServer();
    await loadCharactersForOwner(getOwnerName());
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
      localStorage.setItem('ownerName', ownerName);
      updatePlayerNameDisplay();
      if (playerNameInput) playerNameInput.value = ownerName;
      await loadCharactersForOwner(ownerName);
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
      await ensureOwnerId();
      try {
        const res = await fetch(`/players/${encodeURIComponent(ownerId)}/rename`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newName })
        });
        if (!res.ok) {
          throw new Error('Server returned ' + res.status);
        }
      } catch (err) {
        console.error('Failed to rename player:', err);
      }
      ownerInput.value = newName;
      localStorage.setItem('ownerName', newName);
      updatePlayerNameDisplay();
      showPlayerNameEdit(false);
      await loadCharactersForOwner(newName);
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
      await ensureOwnerId();
      const conditionList = [];
      const initiativeBonusRaw = addInitiativeBonusInput ? addInitiativeBonusInput.value.trim() : '0';
      const initiativeBonus = initiativeBonusRaw === '' ? 0 : Number(initiativeBonusRaw);
      if (!Number.isFinite(initiativeBonus)) {
        statusDiv.textContent = 'Initiative bonus must be a valid number.';
        return;
      }
      const payload = {
        ownerId,
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
      const characterRes = await fetch('/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!characterRes.ok) {
        throw new Error('Server returned ' + characterRes.status);
      }

      const savedCharacter = await characterRes.json();
      selectedCharacterId = savedCharacter.id;
      localStorage.setItem('selectedCharacterId', selectedCharacterId);
      hideAddForm();
      await loadCharactersForOwner(ownerName);
      await loadState();
    } catch (err) {
      statusDiv.textContent = 'Error: ' + err.message;
    }
  }

  async function initApp() {
    await ensureOwnerId();
    if (ownerInput && !ownerInput.value.trim()) {
      ownerInput.value = ownerId;
      localStorage.setItem('ownerName', ownerId);
    }
    updatePlayerNameDisplay();
    await loadCampaign();
    await loadState();
    setInterval(loadStateTimer, REFRESH_INTERVAL_MS);
  }

  initApp();

  // --- Load state (round + current turn + players) -------------------------

  function loadStateTimer() {
    if (skipRefresh) {
      skipRefresh = false;
      return;
    }
    loadState();
  }

  async function loadState() {
    try {
      const res = await fetch('/state');
      if (!res.ok) throw new Error('Server returned ' + res.status);

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
            if (p.ownerName && p.ownerName.toLowerCase() === 'referee') {
              initTd.classList.add('init-referee');
            }
            nameTd.innerHTML = '';
            const nameLine = document.createElement('div');
            nameLine.textContent = p.name;
            nameTd.appendChild(nameLine);
            if (p.ownerName) {
              const ownerLine = document.createElement('div');
              ownerLine.classList.add('player-owner');
              ownerLine.textContent = `(${p.ownerName})`;
              nameTd.appendChild(ownerLine);
            }

            const isMine =
              Boolean(ownerId) &&
              ((p.ownerId && p.ownerId === ownerId) ||
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
    }
  }

  // --- Save player (add/update this client's entry) ------------------------

  async function persistCharacterPayload(payload, { showStatus = true, successMessage = '' } = {}) {
    const ownerName = payload.ownerName || getOwnerName();
    if (showStatus) {
      statusDiv.textContent = 'Saving...';
    }

    localStorage.setItem('ownerName', ownerName);

    try {
      await ensureOwnerId();
      if (!payload.ownerId) {
        payload.ownerId = ownerId;
      }
      if (currentCampaignName) {
        payload.campaignName = currentCampaignName;
      }
      const characterRes = await fetch('/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!characterRes.ok) {
        throw new Error('Server returned ' + characterRes.status);
      }

      const savedCharacter = await characterRes.json();
      selectedCharacterId = savedCharacter.id;
      localStorage.setItem('selectedCharacterId', selectedCharacterId);

      if (showStatus) {
        statusDiv.textContent = successMessage;
      } else {
        statusDiv.textContent = '';
      }
      isCreatingCharacter = false;
      updateConditionsAvailability();

      lastStateJson = null;
      await loadCharactersForOwner(ownerName);
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
    const initiative = selectedCharacter ? selectedCharacter.initiative : null;
    const initiativeBonusRaw = initiativeBonusInput ? initiativeBonusInput.value.trim() : '0';
    const initiativeBonus = initiativeBonusRaw === '' ? 0 : Number(initiativeBonusRaw);
    if (!Number.isFinite(initiativeBonus)) {
      statusDiv.textContent = 'Initiative bonus must be a valid number.';
      return;
    }
    const payload = {
      id: selectedCharacterId,
      ownerId,
      ownerName,
      name,
      initiative,
      stats: Array.isArray(selectedCharacter?.stats) ? selectedCharacter.stats : [],
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
      ownerId,
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
      if (!res.ok) throw new Error('Server returned ' + res.status);

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

  if (clearBtn) {
    clearBtn.addEventListener('click', handleClear);
  }

  // Initial load + auto-refresh
  
});
