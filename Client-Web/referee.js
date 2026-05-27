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
  formatEncounterStateText,
  orderedEncounterStats,
  encounterStatusInfo,
  applyEncounterHealthClasses,
  formatEncounterStatsText,
  buildEncounterConditionsList,
  createEmptyEncounterRow,
  setEncounterHealthLabel
} = window.PlayerTrackerEncounter || {
  normalizeConditionEntry: () => null,
  formatEncounterStateText: () => 'Encounter: New',
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
  },
  setEncounterHealthLabel: () => {}
};
window.addEventListener('DOMContentLoaded', () => {
  const playersBody = document.getElementById('players-body');
  const turnCompleteBtn = document.getElementById('turn-complete');
  const statusDiv = document.getElementById('status');
  const encounterNewBtn = document.getElementById('encounter-new');
  const encounterStartBtn = document.getElementById('encounter-start');
  const encounterSuspendBtn = document.getElementById('encounter-suspend');

  const refereeCampaignName = document.getElementById('ref-campaign-name');
  const refereeEncounterState = document.getElementById('ref-encounter-state');
  const refereeRulesetLink = document.getElementById('ref-ruleset-link');
  const refereeRulesetLicense = document.getElementById('ref-ruleset-license');
  const refereeRulesetLicenseWrap = document.getElementById('ref-ruleset-license-wrap');
  const refereeRulesetIcon = document.getElementById('ref-ruleset-icon');
  const invitePlayerBtn = document.getElementById('ref-invite-player');
  const campaignSettingsBtn = document.getElementById('ref-campaign-settings');

  const form = document.getElementById('ref-add-panel');
  const nameInput = document.getElementById('ref-name');
  const quantityInput = document.getElementById('ref-quantity');
  const initiativeInput = document.getElementById('ref-initiative');
  const useAppInitiativeRollInput = document.getElementById('ref-use-app-initiative-roll');
  const initiativeBonusInput = document.getElementById('ref-initiative-bonus');
  const initiativeBonusWrap = document.getElementById('ref-initiative-bonus-wrap');
  const statsFields = document.getElementById('ref-stats-fields');
  const characterList = document.getElementById('referee-character-list');
  const addManualTabBtn = document.getElementById('ref-add-tab-manual');
  const addLibraryTabBtn = document.getElementById('ref-add-tab-library');
  const addManualPanel = document.getElementById('ref-add-manual-panel');
  const addStatBlockWrap = document.getElementById('ref-stat-block-wrap');
  const addStatBlockSelect = document.getElementById('ref-stat-block');
  const librarySummary = document.getElementById('ref-library-summary');
  const libraryImportStatus = document.getElementById('ref-library-import-status');
  const libraryPanel = document.getElementById('ref-library-panel');
  const libraryQueryInput = document.getElementById('ref-library-query');
  const libraryList = document.getElementById('ref-library-list');
  const libraryDetails = document.getElementById('ref-library-details');
  const libraryImportButton = document.getElementById('ref-library-import');
  const libraryImportInput = document.getElementById('ref-library-import-input');
  const userdataSummary = document.getElementById('ref-userdata-summary');
  const userdataStatus = document.getElementById('ref-userdata-status');
  const userdataList = document.getElementById('ref-userdata-list');
  const userdataRefreshButton = document.getElementById('ref-userdata-refresh');
  const userdataSaveButton = document.getElementById('ref-userdata-save');
  const healthHeading = document.getElementById('health-heading');
  const visibleToggle = document.getElementById('ref-visible');
  const addCurrentStats = document.getElementById('ref-add-current-stats');
  const addButton = document.getElementById('ref-add-button');
  const addCancelBtn = document.getElementById('ref-add-cancel');
  const editorEmpty = document.getElementById('ref-editor-empty');
  const editorForm = document.getElementById('ref-editor');
  const editorNameInput = document.getElementById('ref-edit-name');
  const editorInitiativeBonusInput = document.getElementById('ref-edit-initiative-bonus');
  const editorInitiativeBonusWrap = document.getElementById('ref-edit-initiative-bonus-wrap');
  const editorStatsFields = document.getElementById('ref-edit-stats');
  const editorCurrentStats = document.getElementById('ref-edit-current-stats');
  const editorConditionFilter = document.getElementById('ref-condition-filter');
  const editorConditionsGrid = document.getElementById('ref-conditions-grid');
  const editorSelectedConditions = document.getElementById('ref-selected-conditions');
  const selectionToolbarAnchor = document.getElementById('ref-selection-toolbar-anchor');
  const detailsToggle = document.getElementById('ref-details-toggle');
  const detailsPanel = document.getElementById('ref-details-panel');
  const conditionsToggle = document.getElementById('ref-conditions-toggle');
  const conditionsPanel = document.getElementById('ref-conditions-panel');
  const detailsCancelBtn = document.getElementById('ref-details-cancel');
  const detailsSaveBtn = document.getElementById('ref-details-save');
  const conditionsCancelBtn = document.getElementById('ref-conditions-cancel');
  const conditionsSaveBtn = document.getElementById('ref-conditions-save');
  const revealNowBtn = document.getElementById('ref-reveal-now');
  const revealTurnBtn = document.getElementById('ref-reveal-turn');
  const hideBtn = document.getElementById('ref-hide-character');
  const overflowToggle = document.getElementById('ref-overflow-toggle');
  const overflowMenu = document.getElementById('ref-overflow-menu');
  const openReferenceBtn = document.getElementById('ref-open-reference');
  const claimCharacterBtn = document.getElementById('ref-claim-character');
  const releaseCharacterBtn = document.getElementById('ref-release-character');
  const deleteCharacterBtn = document.getElementById('ref-delete-character');
  const hidePcsToggle = document.getElementById('ref-hide-pcs');

  let currentCampaignName = '';
  let currentRulesetId = '';
  let currentHealthLabel = 'HP';
  let statKeys = ['HP'];
  let statAliases = new Map();
  let campaignUserdataFiles = [];
  let campaignUserdataSelection = [];
  let campaignUserdataDirty = false;
  let campaignUserdataLoading = false;
  let statBlockDefinitions = [];
  let statBlockLookup = new Map();
  let addStatBlockDefinitions = [];
  let addStatBlockLookup = new Map();
  let selectedAddStatBlockId = null;
  let addStatKeys = ['HP'];
  let editorStatKeys = [];
  let statInputs = new Map();
  let editorStatInputs = new Map();
  let conditionLookup = new Map();
  let conditionLibrary = [];
  let creatureLibraryQuery = '';
  let addDialogTab = 'manual';
  let creatureLibraryOpen = false;
  let creatureLibraryLoading = false;
  let creatureLibraryResults = [];
  let selectedCreatureLibraryId = null;
  let selectedCreatureLibrary = null;
  let creatureLibraryRequestController = null;
  let creatureLibrarySearchTimer = null;
  let selectedConditions = new Set();
  let selectedCharacterId = null;
  let currentPlayers = [];
  let conditionsPanelOpen = false;
  let currentTurnId = null;
  let encounterState = 'new';
  let skipRefresh = false;
  let loadStateInFlight = false;
  let loadStateRefreshQueued = false;
  let allowNegativeHealth = false;
  let supportsTempHp = false;
  let currentStandardDie = null;
  let hidePlayers = true;
  let detailsDirty = false;
  let conditionsDirty = false;
  const refereeHeaderNameTargets = [refereeCampaignName];
  const refereeHeaderIconTargets = [refereeRulesetIcon];
  const refereeHeaderLinkTargets = [refereeRulesetLink];
  const refereeHeaderLicenseTargets = [
    { linkEl: refereeRulesetLicense, wrapEl: refereeRulesetLicenseWrap }
  ];

  if (campaignSettingsBtn && !isAdminHost()) {
    campaignSettingsBtn.style.display = 'none';
  }
  if (invitePlayerBtn) {
    invitePlayerBtn.addEventListener('click', invitePlayer);
  }
  if (libraryImportButton && libraryImportInput) {
    libraryImportButton.addEventListener('click', () => {
      libraryImportInput.click();
    });
    libraryImportInput.addEventListener('change', () => {
      void importCreatureLibraryFiles(Array.from(libraryImportInput.files || []));
    });
  }
  if (userdataRefreshButton) {
    userdataRefreshButton.addEventListener('click', () => {
      void loadCampaignUserData();
    });
  }
  if (userdataSaveButton) {
    userdataSaveButton.addEventListener('click', () => {
      void saveCampaignUserDataSelection();
    });
  }

  let activeCampaignId = null;
  const campaignLiveStream = window.PlayerTrackerLiveStream?.createCampaignLiveStream?.({
    getCampaignId: () => activeCampaignId,
    refresh: async () => {
      const hasActiveCampaign = await loadCampaign();
      if (hasActiveCampaign) {
        await loadCampaignUserData();
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
  function setCampaignSummary() {}

  function updateEncounterStateDisplay(round = 1, currentTurnPlayer = null, isRefTurn = false) {
    if (!refereeEncounterState) return;
    refereeEncounterState.classList.toggle('player-encounter-state-mine', Boolean(isRefTurn));
    refereeEncounterState.textContent = formatEncounterStateText(encounterState, round, currentTurnPlayer);
  }

  function updateAddInitiativeBonusAvailability() {
    if (!initiativeBonusInput || !initiativeBonusWrap) return;
    const enabled = !useAppInitiativeRollInput || useAppInitiativeRollInput.checked;
    initiativeBonusInput.disabled = !enabled;
    initiativeBonusWrap.classList.toggle('disabled', !enabled);
  }

  function updateEditorInitiativeBonusAvailability() {
    if (!editorInitiativeBonusInput || !editorInitiativeBonusWrap) return;
    editorInitiativeBonusInput.disabled = false;
    editorInitiativeBonusWrap.classList.remove('disabled');
  }

  function normalizeStatBlockDefinition(entry) {
    if (!entry || typeof entry.id !== 'string' || typeof entry.label !== 'string') {
      return null;
    }
    const id = entry.id.trim();
    const label = entry.label.trim();
    const stats = Array.isArray(entry.stats)
      ? entry.stats
          .map((stat) => (typeof stat === 'string' ? stat.trim() : ''))
          .filter(Boolean)
      : [];
    if (!id || !label || stats.length === 0) {
      return null;
    }
    const appliesTo = Array.isArray(entry.appliesTo)
      ? entry.appliesTo
          .map((role) => (typeof role === 'string' ? role.trim() : ''))
          .filter(Boolean)
      : [];
    return {
      id,
      label,
      appliesTo,
      stats,
      defaultBlock: Boolean(entry.default ?? entry.defaultBlock)
    };
  }

  function normalizeStatToken(value) {
    if (typeof value !== 'string') {
      return '';
    }
    return value
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '');
  }

  function setStatAliases(aliases) {
    statAliases = new Map();
    if (!aliases || typeof aliases !== 'object') {
      return;
    }
    Object.entries(aliases).forEach(([alias, canonical]) => {
      const aliasToken = normalizeStatToken(alias);
      const canonicalToken = normalizeStatToken(canonical);
      if (!aliasToken || !canonicalToken) {
        return;
      }
      statAliases.set(aliasToken, canonicalToken === 'TEMPHP' ? 'TempHP' : canonicalToken);
    });
  }

  function normalizeStatKey(value) {
    const token = normalizeStatToken(value);
    if (!token) {
      return '';
    }
    if (token === 'TEMPHP') {
      return 'TempHP';
    }
    return statAliases.get(token) || token;
  }

  function normalizeStatEntries(stats) {
    const normalized = [];
    const seen = new Map();
    (Array.isArray(stats) ? stats : []).forEach((stat) => {
      const key = normalizeStatKey(stat?.key);
      if (!key) {
        return;
      }
      const current = Number.isFinite(stat?.current) ? stat.current : 0;
      const max = Number.isFinite(stat?.max) ? stat.max : current;
      seen.set(key, { key, current, max });
    });
    seen.forEach((value) => normalized.push(value));
    return normalized;
  }

  function snapshotStatFieldValues(map) {
    const snapshot = new Map();
    map.forEach((entry, key) => {
      snapshot.set(key, {
        current: entry?.currentInput ? entry.currentInput.value : '',
        max: entry?.maxInput ? entry.maxInput.value : ''
      });
    });
    return snapshot;
  }

  function restoreStatFieldValues(map, snapshot) {
    if (!(snapshot instanceof Map)) return;
    map.forEach((entry, key) => {
      const values = snapshot.get(key);
      if (!values) return;
      if (entry?.maxInput) {
        entry.maxInput.value = values.max;
      }
      if (entry?.currentInput) {
        entry.currentInput.value = values.current;
      }
    });
  }

  function getSelectedAddStatBlock() {
    return addStatBlockLookup.get(selectedAddStatBlockId) || null;
  }

  function getAddStatKeys() {
    const selected = getSelectedAddStatBlock();
    const keys = Array.isArray(selected?.stats) && selected.stats.length > 0
      ? selected.stats.slice()
      : statKeys.slice();
    if (supportsTempHp && keys.includes('HP') && !keys.includes('TempHP')) {
      keys.push('TempHP');
    }
    return keys;
  }

  function getDefaultAddStatBlockId() {
    return addStatBlockDefinitions.find((block) => block.defaultBlock)?.id
      || addStatBlockDefinitions[0]?.id
      || null;
  }

  function inferStatBlockIdFromStats(stats) {
    const sourceKeys = normalizeStatEntries(stats)
      .map((stat) => stat.key)
      .filter((key) => typeof key === 'string' && key !== 'TempHP');
    if (sourceKeys.length === 0) {
      return null;
    }
    const normalizedSource = sourceKeys.slice().sort().join('|');
    const exactMatch = statBlockDefinitions.find((block) => {
      const blockKeys = normalizeStatEntries(
        (Array.isArray(block.stats) ? block.stats : []).map((key) => ({ key, current: 0, max: 0 }))
      ).map((stat) => stat.key)
        .filter((key) => key !== 'TempHP')
        .slice()
        .sort()
        .join('|');
      return blockKeys === normalizedSource;
    });
    return exactMatch?.id || null;
  }

  function getCharacterStatKeys(player) {
    const blockId = typeof player?.statBlockId === 'string' ? player.statBlockId : '';
    const block = blockId ? statBlockLookup.get(blockId) : null;
    const keys = Array.isArray(block?.stats) && block.stats.length > 0
      ? block.stats.slice()
      : (Array.isArray(player?.stats) ? normalizeStatEntries(player.stats).map((stat) => stat.key) : statKeys.slice());
    const extras = Array.isArray(player?.stats)
      ? normalizeStatEntries(player.stats)
          .map((stat) => stat?.key)
          .filter((key) => typeof key === 'string' && key === 'TempHP' && !keys.includes(key))
      : [];
    return keys.concat(extras);
  }

  function buildStatFields({
    keys,
    inputsMap,
    fieldsContainer,
    currentStatsContainer,
    headingEl,
    prefix,
    preserveValues = null,
    onInput
  }) {
    inputsMap.clear();
    if (fieldsContainer) fieldsContainer.innerHTML = '';
    if (currentStatsContainer) currentStatsContainer.innerHTML = '';
    if (headingEl) {
      headingEl.textContent =
        keys.length === 1 && keys[0] === 'HP' ? creatureLibraryHealthLabel() : keys.length === 1 ? keys[0] : 'Stats';
    }

    keys.forEach((key) => {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const maxId = `${prefix}max-stat-${normalizedKey}`;
      const currentId = `${prefix}current-stat-${normalizedKey}`;
      const isTempHp = key === 'TempHP';
      const currentInput = document.createElement('input');
      currentInput.type = 'number';
      currentInput.id = currentId;
      if (key === 'TempHP' || !allowNegativeHealth) {
        currentInput.min = '0';
      }
      if (typeof onInput === 'function') {
        currentInput.addEventListener('input', onInput);
      }

      let maxInput = null;
      if (!isTempHp) {
        maxInput = document.createElement('input');
        maxInput.type = 'number';
        maxInput.id = maxId;
        maxInput.min = '0';
        if (typeof onInput === 'function') {
          maxInput.addEventListener('input', onInput);
        }
      }

      if (fieldsContainer) {
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

        fieldsContainer.appendChild(row);
      }

      inputsMap.set(key, { maxInput, currentInput });
    });

    restoreStatFieldValues(inputsMap, preserveValues);
  }

  function syncAddStatBlockSelector() {
    if (!addStatBlockSelect || !addStatBlockWrap) return;
    const hasMultipleBlocks = addStatBlockDefinitions.length > 1;
    addStatBlockWrap.classList.toggle('hidden', !hasMultipleBlocks);
    if (!hasMultipleBlocks) {
      addStatBlockSelect.innerHTML = '';
      return;
    }

    const currentValue = selectedAddStatBlockId || getDefaultAddStatBlockId() || '';
    addStatBlockSelect.innerHTML = '';
    addStatBlockDefinitions.forEach((block) => {
      const option = document.createElement('option');
      option.value = block.id;
      option.textContent = block.label;
      option.selected = block.id === currentValue;
      addStatBlockSelect.appendChild(option);
    });
    if (currentValue && addStatBlockSelect.value !== currentValue) {
      addStatBlockSelect.value = currentValue;
    }
  }

  function setAddStatBlockId(statBlockId, { preserveValues = true } = {}) {
    const resolved = addStatBlockLookup.has(statBlockId)
      ? statBlockId
      : getDefaultAddStatBlockId();
    if (!resolved) {
      selectedAddStatBlockId = null;
      addStatKeys = statKeys.slice();
      buildStatFields({
        keys: addStatKeys,
        inputsMap: statInputs,
        fieldsContainer: statsFields,
        currentStatsContainer: addCurrentStats,
        headingEl: healthHeading,
        prefix: 'ref-',
        preserveValues: preserveValues ? snapshotStatFieldValues(statInputs) : null
      });
      return;
    }

    const changed = selectedAddStatBlockId !== resolved;
    selectedAddStatBlockId = resolved;
    addStatKeys = getAddStatKeys();
    if (addStatBlockSelect && addStatBlockSelect.value !== resolved) {
      addStatBlockSelect.value = resolved;
    }
    buildStatFields({
      keys: addStatKeys,
      inputsMap: statInputs,
      fieldsContainer: statsFields,
      currentStatsContainer: addCurrentStats,
      headingEl: healthHeading,
      prefix: 'ref-',
      preserveValues: preserveValues && changed ? snapshotStatFieldValues(statInputs) : null
    });
  }

  function updateInvitePlayerButtonState() {
    if (!invitePlayerBtn) return;
    invitePlayerBtn.disabled = !activeCampaignId;
  }

  async function invitePlayer() {
    if (!activeCampaignId) {
      if (statusDiv) statusDiv.textContent = 'No active campaign selected.';
      return;
    }

    const playerName = window.prompt('Player name to add:');
    if (playerName === null) return;

    const trimmed = playerName.trim();
    if (!trimmed) {
      if (statusDiv) statusDiv.textContent = 'Enter a player name first.';
      return;
    }

    if (statusDiv) statusDiv.textContent = 'Adding player...';
    try {
      const res = await fetch(`/campaigns/${encodeURIComponent(activeCampaignId)}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerName: trimmed })
      });
      if (!res.ok) {
        const message = await res.text().catch(() => '');
        throw new Error(message || `Server returned ${res.status}`);
      }
      const member = await res.json();
      const target = member.playerName || trimmed;
      if (statusDiv) statusDiv.textContent = `Added ${target} to the campaign.`;
    } catch (err) {
      if (statusDiv) statusDiv.textContent = `Failed to add player: ${err.message}`;
    }
  }

  function closeOverflowMenu() {
    if (!overflowMenu || !overflowToggle) return;
    overflowMenu.classList.add('hidden');
    overflowMenu.setAttribute('aria-hidden', 'true');
    overflowToggle.setAttribute('aria-expanded', 'false');
  }

  function openOverflowMenu() {
    if (!overflowMenu || !overflowToggle) return;
    overflowMenu.classList.remove('hidden');
    overflowMenu.setAttribute('aria-hidden', 'false');
    overflowToggle.setAttribute('aria-expanded', 'true');
  }

  function toggleOverflowMenu() {
    if (!overflowMenu || !overflowToggle) return;
    if (overflowMenu.classList.contains('hidden')) {
      openOverflowMenu();
    } else {
      closeOverflowMenu();
    }
  }

  function buildStatsFields() {
    buildStatFields({
      keys: addStatKeys,
      inputsMap: statInputs,
      fieldsContainer: statsFields,
      currentStatsContainer: addCurrentStats,
      headingEl: healthHeading,
      prefix: 'ref-'
    });
  }

  function setConditionsPanelOpen(open) {
    if (!conditionsToggle || !conditionsPanel) return;
    if (open && detailsDirty) {
      const discard = confirm('Discard unsaved detail changes?');
      if (!discard) return;
      const current = currentPlayers.find((player) => player.id === selectedCharacterId);
      if (current) {
        setSelectedCharacter(current);
      }
    }
    conditionsPanelOpen = open;
    if (open && detailsToggle && detailsPanel) {
      detailsPanel.classList.remove('details-panel-open');
      detailsPanel.classList.add('details-panel-collapsed');
      detailsPanel.classList.add('hidden');
      detailsToggle.setAttribute('aria-expanded', 'false');
      detailsPanel.setAttribute('aria-hidden', 'true');
    }
    conditionsPanel.classList.toggle('hidden', !open);
    conditionsPanel.classList.toggle('conditions-panel-open', open);
    conditionsPanel.classList.toggle('conditions-panel-collapsed', !open);
    conditionsToggle.setAttribute('aria-expanded', open.toString());
    conditionsPanel.setAttribute('aria-hidden', (!open).toString());
  }

  function setDetailsPanelOpen(open) {
    if (!detailsToggle || !detailsPanel) return;
    if (open && conditionsDirty) {
      const discard = confirm('Discard unsaved condition changes?');
      if (!discard) return;
      const current = currentPlayers.find((player) => player.id === selectedCharacterId);
      if (current) {
        setSelectedCharacter(current);
      }
    }
    if (open && conditionsToggle && conditionsPanel) {
      setConditionsPanelOpen(false);
    }
    detailsPanel.classList.toggle('hidden', !open);
    detailsPanel.classList.toggle('details-panel-open', open);
    detailsPanel.classList.toggle('details-panel-collapsed', !open);
    detailsToggle.setAttribute('aria-expanded', open.toString());
    detailsPanel.setAttribute('aria-hidden', (!open).toString());
  }

  function buildEditorStatsFields() {
    buildStatFields({
      keys: editorStatKeys,
      inputsMap: editorStatInputs,
      fieldsContainer: editorStatsFields,
      currentStatsContainer: editorCurrentStats,
      prefix: 'ref-edit-',
      onInput: () => {
        detailsDirty = true;
      }
    });
  }

  function setCreatureLibrarySummary(text) {
    if (!librarySummary) return;
    librarySummary.textContent = text || '';
  }

  function setCreatureLibraryImportStatus(text) {
    if (!libraryImportStatus) return;
    libraryImportStatus.textContent = text || '';
  }

  function setCampaignUserDataStatus(text) {
    if (!userdataStatus) return;
    userdataStatus.textContent = text || '';
  }

  function resetCampaignUserDataState() {
    campaignUserdataFiles = [];
    campaignUserdataSelection = [];
    campaignUserdataDirty = false;
    campaignUserdataLoading = false;
    if (userdataList) {
      userdataList.innerHTML = '';
    }
    setCampaignUserDataStatus('');
    updateCampaignUserDataSaveState();
  }

  function updateCampaignUserDataSaveState() {
    if (!userdataSaveButton) return;
    userdataSaveButton.disabled = !campaignUserdataDirty || campaignUserdataLoading;
    userdataSaveButton.setAttribute('aria-disabled', userdataSaveButton.disabled.toString());
  }

  function normalizeUserdataFileName(name) {
    if (typeof name !== 'string') return '';
    return name.trim();
  }

  function currentUserdataSelectionSet() {
    return new Set(campaignUserdataSelection.map((name) => normalizeUserdataFileName(name)).filter(Boolean));
  }

  function renderCampaignUserDataFiles(files = campaignUserdataFiles) {
    if (!userdataList) return;
    const selected = currentUserdataSelectionSet();
    userdataList.innerHTML = '';
    const normalizedFiles = Array.isArray(files)
      ? files
          .map((entry) => {
            if (typeof entry === 'string') {
              return { name: normalizeUserdataFileName(entry), selected: selected.has(normalizeUserdataFileName(entry)), missing: false };
            }
            if (!entry || typeof entry.name !== 'string') {
              return null;
            }
            return {
              name: normalizeUserdataFileName(entry.name),
              selected: Boolean(entry.selected ?? selected.has(normalizeUserdataFileName(entry.name))),
              missing: Boolean(entry.missing)
            };
          })
          .filter((entry) => entry && entry.name)
      : [];

    if (normalizedFiles.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'creature-library-empty userdata-empty';
      empty.textContent = 'No userdata files available.';
      userdataList.appendChild(empty);
      return;
    }

    normalizedFiles.forEach((entry) => {
      const row = document.createElement('label');
      row.className = 'userdata-file-row';
      if (entry.missing) {
        row.classList.add('userdata-file-missing');
      }

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = Boolean(entry.selected);
      checkbox.disabled = Boolean(entry.missing);
      checkbox.addEventListener('change', () => {
        const nextSelection = new Set(campaignUserdataSelection.map((value) => normalizeUserdataFileName(value)).filter(Boolean));
        if (checkbox.checked) {
          nextSelection.add(entry.name);
        } else {
          nextSelection.delete(entry.name);
        }
        campaignUserdataSelection = Array.from(nextSelection).sort((lhs, rhs) => lhs.localeCompare(rhs));
        campaignUserdataDirty = true;
        updateCampaignUserDataSaveState();
      });

      const text = document.createElement('span');
      text.className = 'userdata-file-name';
      text.textContent = entry.missing ? `${entry.name} (missing)` : entry.name;

      row.appendChild(checkbox);
      row.appendChild(text);
      userdataList.appendChild(row);
    });
  }

  function updateCampaignUserDataSummary() {
    if (!userdataSummary) return;
    const selectedCount = campaignUserdataSelection.length;
    const availableCount = campaignUserdataFiles.filter((entry) => !entry.missing).length;
    userdataSummary.textContent = availableCount > 0
      ? `Userdata: ${selectedCount} selected from ${availableCount} file(s)`
      : 'Userdata: no files available';
  }

  function setCampaignUserDataSelection(selection) {
    const normalized = Array.from(new Set((Array.isArray(selection) ? selection : [])
      .map((name) => normalizeUserdataFileName(name))
      .filter(Boolean)))
      .sort((lhs, rhs) => lhs.localeCompare(rhs));
    const changed = normalized.join('|') !== campaignUserdataSelection.join('|');
    campaignUserdataSelection = normalized;
    campaignUserdataDirty = campaignUserdataDirty || changed;
    renderCampaignUserDataFiles();
    updateCampaignUserDataSummary();
    updateCampaignUserDataSaveState();
  }

  async function loadCampaignUserData() {
    if (!activeCampaignId) {
      resetCampaignUserDataState();
      return false;
    }
    if (campaignUserdataLoading) {
      return false;
    }
    campaignUserdataLoading = true;
    updateCampaignUserDataSaveState();
    try {
      const res = await fetch('/campaign/userdata');
      if (!res.ok) {
        if (res.status === 409 || res.status === 403 || res.status === 401) {
          resetCampaignUserDataState();
          return false;
        }
        throw new Error(`Server returned ${res.status}`);
      }
      const json = await res.json();
      const files = Array.isArray(json?.files) ? json.files : [];
      campaignUserdataFiles = files.map((entry) => ({
        name: normalizeUserdataFileName(entry?.name),
        selected: Boolean(entry?.selected),
        missing: Boolean(entry?.missing)
      })).filter((entry) => entry.name);
      campaignUserdataSelection = campaignUserdataFiles
        .filter((entry) => entry.selected)
        .map((entry) => entry.name)
        .sort((lhs, rhs) => lhs.localeCompare(rhs));
      campaignUserdataDirty = false;
      setCampaignUserDataStatus('');
      renderCampaignUserDataFiles(campaignUserdataFiles);
      updateCampaignUserDataSummary();
      updateCampaignUserDataSaveState();
      return true;
    } catch (err) {
      setCampaignUserDataStatus(`Unable to load userdata: ${err.message}`);
      return false;
    } finally {
      campaignUserdataLoading = false;
      updateCampaignUserDataSaveState();
    }
  }

  async function saveCampaignUserDataSelection() {
    if (!activeCampaignId) {
      setCampaignUserDataStatus('No active campaign selected.');
      return false;
    }
    if (!campaignUserdataDirty) {
      setCampaignUserDataStatus('No userdata changes to save.');
      return true;
    }
    const selectedFiles = campaignUserdataSelection.slice();
    setCampaignUserDataStatus('Saving userdata selection...');
    try {
      const res = await fetch('/campaign/userdata', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ files: selectedFiles })
      });
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }
      campaignUserdataDirty = false;
      await loadCampaignUserData();
      await loadCreatureLibrary(creatureLibraryQuery || '');
      setCampaignUserDataStatus('Saved userdata selection.');
      return true;
    } catch (err) {
      setCampaignUserDataStatus(`Unable to save userdata: ${err.message}`);
      return false;
    }
  }

  function updateAddDialogTabs() {
    const libraryOpen = addDialogTab === 'library';
    creatureLibraryOpen = libraryOpen;

    if (addManualTabBtn) {
      addManualTabBtn.setAttribute('aria-selected', (!libraryOpen).toString());
      addManualTabBtn.tabIndex = libraryOpen ? -1 : 0;
    }
    if (addLibraryTabBtn) {
      addLibraryTabBtn.setAttribute('aria-selected', libraryOpen.toString());
      addLibraryTabBtn.tabIndex = libraryOpen ? 0 : -1;
    }
    if (addManualPanel) {
      addManualPanel.classList.toggle('hidden', libraryOpen);
      addManualPanel.setAttribute('aria-hidden', libraryOpen.toString());
    }
    if (libraryPanel) {
      libraryPanel.classList.toggle('hidden', !libraryOpen);
      libraryPanel.setAttribute('aria-hidden', (!libraryOpen).toString());
    }
  }

  function setAddDialogTab(tab, options = {}) {
    const nextTab = tab === 'library' ? 'library' : 'manual';
    const previousTab = addDialogTab;
    addDialogTab = nextTab;
    updateAddDialogTabs();

    if (nextTab === 'library') {
      const query = libraryQueryInput ? libraryQueryInput.value : creatureLibraryQuery;
      if ((previousTab !== 'library' || !creatureLibraryResults.length) && !creatureLibraryLoading) {
        loadCreatureLibrary(query || '');
      }
      if (options.focus && libraryQueryInput) {
        libraryQueryInput.focus();
      }
      return;
    }

    if (options.focus && nameInput) {
      nameInput.focus();
    }
  }

  function clearCreatureLibrarySelection() {
    selectedCreatureLibraryId = null;
    selectedCreatureLibrary = null;
  }

  function resetCreatureLibraryState() {
    if (creatureLibraryRequestController) {
      creatureLibraryRequestController.abort();
      creatureLibraryRequestController = null;
    }
    if (creatureLibrarySearchTimer) {
      clearTimeout(creatureLibrarySearchTimer);
      creatureLibrarySearchTimer = null;
    }
    creatureLibraryQuery = '';
    creatureLibraryOpen = false;
    creatureLibraryLoading = false;
    creatureLibraryResults = [];
    clearCreatureLibrarySelection();
    if (libraryQueryInput) libraryQueryInput.value = '';
    if (libraryImportInput) libraryImportInput.value = '';
    addDialogTab = 'manual';
    updateAddDialogTabs();
    renderCreatureLibraryList();
    renderCreatureLibraryDetails();
    setCreatureLibrarySummary('');
    setCreatureLibraryImportStatus('');
  }

  function setCreatureLibraryOpen(open) {
    setAddDialogTab(open ? 'library' : 'manual', { focus: open });
  }

  function scheduleCreatureLibrarySearch(query) {
    creatureLibraryQuery = query;
    if (creatureLibrarySearchTimer) {
      clearTimeout(creatureLibrarySearchTimer);
    }
    creatureLibrarySearchTimer = setTimeout(() => {
      creatureLibrarySearchTimer = null;
      if (!creatureLibraryOpen) {
        return;
      }
      loadCreatureLibrary(query);
    }, 200);
  }

  function creatureLibraryStats(creature) {
    if (!creature) return [];
    if (Array.isArray(creature.stats) && creature.stats.length > 0) {
      return normalizeStatEntries(creature.stats);
    }
    if (Number.isFinite(creature.hp)) {
      return [{ key: 'HP', current: creature.hp, max: creature.hp }];
    }
    return [];
  }

  function creatureLibraryFormStats(creature) {
    return creatureLibraryStats(creature);
  }

  function creatureLibraryHealthLabel() {
    return currentHealthLabel || 'HP';
  }

  function creatureLibraryStatLabel(key) {
    if (key === 'HP') {
      return creatureLibraryHealthLabel();
    }
    return key;
  }

  function selectAddStatBlockForCreature(creature) {
    const inferredStatBlockId = inferStatBlockIdFromStats(creatureLibraryFormStats(creature));
    const nextStatBlockId = inferredStatBlockId || getDefaultAddStatBlockId();
    setAddStatBlockId(nextStatBlockId, { preserveValues: false });
  }

  function applyCreatureLibraryCreature(creature) {
    if (!creature) return;
    clearCreatureLibrarySelection();
    selectedCreatureLibraryId = creature.id;
    selectedCreatureLibrary = creature;
    selectAddStatBlockForCreature(creature);
    if (nameInput) nameInput.value = creature.name || '';
    if (quantityInput) quantityInput.value = '1';
    if (initiativeBonusInput) {
      initiativeBonusInput.value = Number.isFinite(creature.initiativeBonus) ? creature.initiativeBonus : '';
    }
    const statsByKey = new Map(creatureLibraryFormStats(creature).map((stat) => [stat.key, stat]));
    statInputs.forEach((entry, key) => {
      const stat = statsByKey.get(key);
      if (entry.maxInput) {
        entry.maxInput.value = Number.isFinite(stat?.max) ? stat.max : '';
      }
      if (entry.currentInput) {
        entry.currentInput.value = Number.isFinite(stat?.current) ? stat.current : '';
      }
    });
    setCreatureLibrarySummary(`Using ${creature.name}.`);
    renderCreatureLibraryList();
    renderCreatureLibraryDetails();
  }

  function renderCreatureLibraryList() {
    if (!libraryList) return;
    libraryList.innerHTML = '';

    if (creatureLibraryLoading) {
      const loading = document.createElement('div');
      loading.className = 'creature-library-empty';
      loading.textContent = 'Loading creatures...';
      libraryList.appendChild(loading);
      return;
    }

    if (creatureLibraryResults.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'creature-library-empty';
      empty.textContent = creatureLibraryQuery
        ? 'No matching creatures.'
        : 'Open the library to browse default creatures for this ruleset.';
      libraryList.appendChild(empty);
      return;
    }

    creatureLibraryResults.forEach((creature) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'creature-library-item';
      if (creature.id === selectedCreatureLibraryId) {
        button.classList.add('active');
      }

      const name = document.createElement('div');
      name.className = 'creature-library-item-name';
      name.textContent = creature.name;
      button.appendChild(name);

      const meta = document.createElement('div');
      meta.className = 'creature-library-item-meta';
      const metaParts = [];
      if (creature.type) metaParts.push(creature.type);
      if (creature.baseCreatureName) metaParts.push(`Derived from ${creature.baseCreatureName}`);
      if (Number.isFinite(creature.hp)) metaParts.push(`${creatureLibraryHealthLabel()} ${creature.hp}`);
      meta.textContent = metaParts.join(' • ');
      button.appendChild(meta);

      const source = document.createElement('span');
      source.className = 'creature-library-source';
      source.textContent = creature.source || 'Default';
      button.appendChild(source);

      button.addEventListener('click', () => {
        applyCreatureLibraryCreature(creature);
      });

      libraryList.appendChild(button);
    });
  }

  function renderCreatureLibraryDetails() {
    if (!libraryDetails) return;
    libraryDetails.innerHTML = '';

    const creature = selectedCreatureLibrary;
    if (!creature) {
      const empty = document.createElement('div');
      empty.className = 'creature-library-empty';
      empty.textContent = creatureLibraryResults.length > 0
        ? 'Select a creature to preview its reference details.'
        : 'Search the library to find a creature to use.';
      libraryDetails.appendChild(empty);
      return;
    }

    const title = document.createElement('div');
    title.className = 'creature-library-detail-title';
    title.textContent = creature.name;
    libraryDetails.appendChild(title);

    const subtitle = document.createElement('div');
    subtitle.className = 'creature-library-detail-subtitle';
    const subtitleParts = [];
    if (creature.type) subtitleParts.push(creature.type);
    subtitle.textContent = subtitleParts.join(' • ');
    libraryDetails.appendChild(subtitle);

    const fields = document.createElement('div');
    fields.className = 'creature-library-detail-fields';

    const addField = (label, value) => {
      if (!value && value !== 0) return;
      const labelNode = document.createElement('div');
      labelNode.className = 'creature-library-detail-label';
      labelNode.textContent = label;
      const valueNode = document.createElement('div');
      valueNode.textContent = String(value);
      fields.appendChild(labelNode);
      fields.appendChild(valueNode);
    };

    const addReferenceField = (label, url) => {
      if (!url) return;
      const labelNode = document.createElement('div');
      labelNode.className = 'creature-library-detail-label';
      labelNode.textContent = label;
      const valueNode = document.createElement('div');
      const referenceLink = document.createElement('a');
      referenceLink.href = url;
      referenceLink.target = '_blank';
      referenceLink.rel = 'noopener';
      referenceLink.textContent = 'Reference';
      valueNode.appendChild(referenceLink);
      fields.appendChild(labelNode);
      fields.appendChild(valueNode);
    };

    addField('Derived from', creature.baseCreatureName);
    addField('Source', creature.source || 'Default');
    addField('Size', creature.size);
    addField(creatureLibraryHealthLabel(), Number.isFinite(creature.hp) ? creature.hp : null);
    addReferenceField('Reference', creature.referenceUrl);
    if (creature.notes) {
      addField('Notes', creature.notes);
    }
    if (Array.isArray(creature.tags) && creature.tags.length > 0) {
      addField('Tags', creature.tags.join(', '));
    }
    const stats = creatureLibraryStats(creature);
    if (stats.length > 0) {
      const statSummary = stats
        .map((stat) => {
          const keyLabel = creatureLibraryStatLabel(stat.key);
          return keyLabel === 'TempHP'
            ? `${keyLabel} ${stat.current}`
            : `${keyLabel} ${stat.current}/${stat.max}`;
        })
        .join(' • ');
      addField('Play Stats', statSummary);
    }

    libraryDetails.appendChild(fields);

  }

  async function loadCreatureLibrary(query = '') {
    const trimmedQuery = query.trim();
    creatureLibraryQuery = trimmedQuery;
    if (libraryQueryInput && libraryQueryInput.value !== trimmedQuery) {
      libraryQueryInput.value = trimmedQuery;
    }
    if (creatureLibraryRequestController) {
      creatureLibraryRequestController.abort();
    }
    const requestController = new AbortController();
    creatureLibraryRequestController = requestController;
    creatureLibraryLoading = true;
    renderCreatureLibraryList();
    setCreatureLibrarySummary(trimmedQuery ? `Searching for "${trimmedQuery}"...` : 'Loading creatures...');
    const searchParams = new URLSearchParams();
    if (trimmedQuery) {
      searchParams.set('query', trimmedQuery);
    }
    searchParams.set('limit', '50');

    try {
      const res = await fetch(`/creature-library?${searchParams.toString()}`, {
        signal: requestController.signal
      });
      if (!res.ok) {
        throw new Error('Server returned ' + res.status);
      }
      const json = await res.json();
      if (currentRulesetId && json?.rulesetId && json.rulesetId !== currentRulesetId) {
        creatureLibraryLoading = false;
        return;
      }
      creatureLibraryResults = Array.isArray(json?.creatures) ? json.creatures : [];
      creatureLibraryLoading = false;
      renderCreatureLibraryList();
      renderCreatureLibraryDetails();
      const totalMatches = Number.isFinite(json?.totalMatches) ? json.totalMatches : creatureLibraryResults.length;
      const shownCount = creatureLibraryResults.length;
      const baseLabel = json?.rulesetLabel || currentRulesetId || 'Creature library';
      const countText = `${shownCount} of ${totalMatches} creatures`;
      const queryText = trimmedQuery ? ` for "${trimmedQuery}"` : '';
      setCreatureLibrarySummary(`${baseLabel}: ${countText}${queryText}${json?.hasMore ? ' (showing first page)' : ''}`);
    } catch (err) {
      if (err?.name === 'AbortError') {
        return;
      }
      creatureLibraryLoading = false;
      creatureLibraryResults = [];
      renderCreatureLibraryList();
      renderCreatureLibraryDetails();
      setCreatureLibrarySummary(`Unable to load creature library: ${err.message}`);
    } finally {
      if (creatureLibraryRequestController === requestController) {
        creatureLibraryRequestController = null;
      }
    }
  }

  async function importCreatureLibraryFiles(files) {
    if (!files || files.length === 0) {
      setCreatureLibraryImportStatus('');
      return;
    }
    const selectedFiles = files.filter((file) => file && typeof file.name === 'string' && file.name.toLowerCase().endsWith('.json'));
    if (selectedFiles.length === 0) {
      setCreatureLibraryImportStatus('Select one or more JSON files.');
      if (libraryImportInput) libraryImportInput.value = '';
      return;
    }

    try {
      setCreatureLibraryImportStatus(`Importing ${selectedFiles.length} file(s)...`);
      const payloadFiles = await Promise.all(selectedFiles.map(async (file) => ({
        filename: file.name,
        contents: await file.text()
      })));
      const res = await fetch('/creature-library/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          files: payloadFiles,
          overwrite: true
        })
      });
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }
      const json = await res.json();
      setCreatureLibraryImportStatus(
        `Imported ${json.imported || 0} file(s)${json.skipped ? `, skipped ${json.skipped}` : ''}.`
      );
      await loadCampaignUserData();
      await loadCreatureLibrary(creatureLibraryQuery || '');
    } catch (err) {
      setCreatureLibraryImportStatus(`Unable to import fixtures: ${err.message}`);
    } finally {
      if (libraryImportInput) {
        libraryImportInput.value = '';
      }
    }
  }

  async function loadCampaign() {
    try {
      const res = await fetch('/campaign');
      if (!res.ok) {
        if (res.status === 409) {
          if (activeCampaignId) {
            window.location.replace('/index.html');
            return false;
          }
          currentCampaignName = '';
          activeCampaignId = null;
          currentRulesetId = '';
          resetCampaignUserDataState();
          resetCreatureLibraryState();
          updateCampaignHeader(
            {
              nameTargets: refereeHeaderNameTargets,
              iconTargets: refereeHeaderIconTargets,
              linkTargets: refereeHeaderLinkTargets,
              licenseTargets: refereeHeaderLicenseTargets
            },
            {
              campaignName: null,
              rulesetLabel: '',
              rulesBaseUrl: null,
              licenseUrl: null,
              iconUrl: APP_ICON_URL
            }
          );
          if (refereeEncounterState) {
            refereeEncounterState.textContent = 'No campaign selected';
          }
          setCampaignSummary(null);
          updateInvitePlayerButtonState();
          campaignLiveStream.close();
          document.title = APP_NAME;
          return false;
        }
        throw new Error('Server returned ' + res.status);
      }
      const campaign = await res.json();
      const previousCampaignId = activeCampaignId || null;
      currentCampaignName = campaign.name || '';
      activeCampaignId = campaign.id || null;
      currentRulesetId = campaign.rulesetId || '';
      campaignUserdataSelection = Array.isArray(campaign?.userdataFiles)
        ? campaign.userdataFiles.map((name) => normalizeUserdataFileName(name)).filter(Boolean).sort((lhs, rhs) => lhs.localeCompare(rhs))
        : [];
      campaignUserdataDirty = false;
      updateCampaignHeader(
        {
          nameTargets: refereeHeaderNameTargets,
          linkTargets: refereeHeaderLinkTargets,
          licenseTargets: refereeHeaderLicenseTargets
        },
        {
          campaignName: currentCampaignName || null,
          rulesetLabel: campaign.rulesetLabel || '',
          rulesBaseUrl: null,
          licenseUrl: null
        }
      );
      setCampaignSummary(campaign);
      updateInvitePlayerButtonState();
      if (previousCampaignId && previousCampaignId !== activeCampaignId) {
        campaignLiveStream.close();
        window.location.replace('/index.html');
        return false;
      }
      if (currentCampaignName) {
        document.title = `${currentCampaignName} - Referee`;
      } else {
        document.title = APP_NAME;
      }
      return true;
    } catch (err) {
      console.error('Failed to load campaign:', err);
      updateCampaignHeader(
        {
          nameTargets: refereeHeaderNameTargets,
          iconTargets: currentCampaignName ? undefined : refereeHeaderIconTargets,
          linkTargets: refereeHeaderLinkTargets,
          licenseTargets: refereeHeaderLicenseTargets
        },
        {
          campaignName: currentCampaignName || null,
          rulesetLabel: '',
          rulesBaseUrl: null,
          licenseUrl: null,
          iconUrl: currentCampaignName ? undefined : APP_ICON_URL
        }
      );
      if (!activeCampaignId) {
        resetCampaignUserDataState();
      }
      campaignLiveStream.close();
      document.title = currentCampaignName ? `${currentCampaignName} - Referee` : APP_NAME;
      return false;
    }
  }

  async function loadConditionLibrary() {
    try {
      const res = await fetch('/conditions-library');
      if (!res.ok) throw new Error('Server returned ' + res.status);
      const json = await res.json();
      if (Array.isArray(json?.stats) && json.stats.length > 0) {
        statKeys = json.stats;
      } else {
        statKeys = ['HP'];
      }
      currentHealthLabel =
        typeof json?.healthLabel === 'string' && json.healthLabel.trim()
          ? json.healthLabel.trim()
          : 'HP';
      supportsTempHp = Boolean(json?.supportsTempHp);
      if (supportsTempHp && !statKeys.includes('TempHP')) {
        statKeys = [...statKeys, 'TempHP'];
      }
      allowNegativeHealth = Boolean(json?.allowNegativeHealth);
      setStatAliases(json?.statAliases);
      setEncounterHealthLabel(currentHealthLabel);
      currentStandardDie =
        typeof json?.standardDie === 'string' && json.standardDie.trim()
          ? json.standardDie.trim()
          : null;
      statBlockDefinitions = Array.isArray(json?.statBlocks)
        ? json.statBlocks.map((entry) => normalizeStatBlockDefinition(entry)).filter(Boolean)
        : [];
      statBlockLookup = new Map(statBlockDefinitions.map((block) => [block.id, block]));
      addStatBlockDefinitions = statBlockDefinitions.filter(
        (block) => !Array.isArray(block.appliesTo) || block.appliesTo.length === 0 || block.appliesTo.includes('referee')
      );
      if (addStatBlockDefinitions.length === 0) {
        addStatBlockDefinitions = [{
          id: 'default',
          label: statKeys.length === 1 ? statKeys[0] : 'Stats',
          appliesTo: ['referee'],
          stats: statKeys.slice(),
          defaultBlock: true
        }];
      }
      addStatBlockLookup = new Map(addStatBlockDefinitions.map((block) => [block.id, block]));
      selectedAddStatBlockId = getDefaultAddStatBlockId();
      syncAddStatBlockSelector();
      setAddStatBlockId(selectedAddStatBlockId, { preserveValues: false });

      const baseUrl =
        typeof json?.rulesBaseUrl === 'string' && json.rulesBaseUrl.trim()
          ? json.rulesBaseUrl.trim()
          : null;
      const rulesetLabel = json?.label || '';
      if (currentCampaignName) {
        updateCampaignHeader(
          {
            nameTargets: refereeHeaderNameTargets,
            iconTargets: refereeHeaderIconTargets,
            linkTargets: refereeHeaderLinkTargets,
            licenseTargets: refereeHeaderLicenseTargets
          },
          {
            campaignName: currentCampaignName,
            rulesetLabel,
            rulesBaseUrl: baseUrl,
            licenseUrl: json?.license || null,
            iconUrl: json?.icon || null
          }
        );
      } else {
        updateCampaignHeader(
          {
            nameTargets: refereeHeaderNameTargets,
            iconTargets: refereeHeaderIconTargets,
            linkTargets: refereeHeaderLinkTargets,
            licenseTargets: refereeHeaderLicenseTargets
          },
          {
            campaignName: null,
            rulesetLabel: '',
            rulesBaseUrl: null,
            licenseUrl: null,
            iconUrl: APP_ICON_URL
          }
        );
      }
      const normalized = (json?.conditions ?? []).map((entry) => normalizeConditionEntry(entry)).filter(Boolean);
      conditionLibrary = normalized;
      conditionLookup = new Map(normalized.map((entry) => [entry.name, entry]));
      renderEditorConditions(editorConditionFilter ? editorConditionFilter.value : '');
    } catch (err) {
      console.warn('Unable to load condition library:', err);
      updateCampaignHeader(
        {
          nameTargets: refereeHeaderNameTargets,
          iconTargets: refereeHeaderIconTargets,
          linkTargets: refereeHeaderLinkTargets,
          licenseTargets: refereeHeaderLicenseTargets
        },
        {
          campaignName: currentCampaignName || null,
          rulesetLabel: '',
          rulesBaseUrl: null,
          licenseUrl: null,
          iconUrl: currentCampaignName ? null : APP_ICON_URL
        }
      );
      allowNegativeHealth = false;
      supportsTempHp = false;
      currentStandardDie = null;
      statKeys = ['HP'];
      setStatAliases(null);
      statBlockDefinitions = [];
      statBlockLookup = new Map();
      addStatBlockDefinitions = [{
        id: 'default',
        label: statKeys.length === 1 ? statKeys[0] : 'Stats',
        appliesTo: ['referee'],
        stats: statKeys.slice(),
        defaultBlock: true
      }];
      addStatBlockLookup = new Map(addStatBlockDefinitions.map((block) => [block.id, block]));
      selectedAddStatBlockId = getDefaultAddStatBlockId();
      syncAddStatBlockSelector();
      setAddStatBlockId(selectedAddStatBlockId, { preserveValues: false });
    }
  }

  function applyState(state) {
    const players = state.players || [];
    currentPlayers = players;
    currentTurnId = state.currentTurnId || null;
    encounterState = state.encounterState || 'new';
    const round = state.round || 1;
    const currentTurnPlayer = currentTurnId ? players.find((player) => player.id === currentTurnId) : null;
    const isRefTurn = Boolean(currentTurnPlayer?.isReferee);
    updateEncounterStateDisplay(round, currentTurnPlayer || null, isRefTurn);
    renderTurnTable(players, state.currentTurnId);
    renderCharacterList(players, state.currentTurnId);
    if (selectedCharacterId) {
      const updated = currentPlayers.find((p) => p.id === selectedCharacterId);
      if (updated) {
        if (!detailsDirty && !conditionsDirty) {
          setSelectedCharacter(updated);
        } else {
          updateActionButtons(updated);
          updateSelectionControls();
          renderCharacterList(currentPlayers, currentTurnId);
        }
      } else {
        clearSelectedCharacter();
      }
    } else {
      updateSelectionControls();
    }
    if (statusDiv) {
      statusDiv.textContent = '';
    }
    updateTurnControls();
  }

  if (useAppInitiativeRollInput) {
    useAppInitiativeRollInput.addEventListener('change', () => {
      updateAddInitiativeBonusAvailability();
    });
  }

  if (editorInitiativeBonusInput) {
    editorInitiativeBonusInput.addEventListener('input', () => {
      detailsDirty = true;
    });
  }

  async function loadState() {
    if (loadStateInFlight) {
      loadStateRefreshQueued = true;
      return;
    }
    loadStateInFlight = true;
    try {
      const res = await fetch('/state?view=referee');
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          window.location.replace('/index.html');
          return;
        }
        throw new Error('Server returned ' + res.status);
      }
      const state = await res.json();
      applyState(state);
    } catch (err) {
      if (statusDiv) statusDiv.textContent = `Error loading state: ${err.message}`;
    } finally {
      loadStateInFlight = false;
      if (loadStateRefreshQueued) {
        loadStateRefreshQueued = false;
        loadState();
      }
    }
  }

  function updateTurnControls() {
    if (!turnCompleteBtn) return;
    const enabled = encounterState === 'active';
    turnCompleteBtn.disabled = !enabled;
    turnCompleteBtn.setAttribute('aria-disabled', (!enabled).toString());
    if (encounterNewBtn) {
      const isNew = encounterState === 'new';
      encounterNewBtn.disabled = isNew;
      encounterNewBtn.setAttribute('aria-disabled', isNew.toString());
    }
    if (encounterStartBtn) {
      const isActive = encounterState === 'active';
      encounterStartBtn.disabled = isActive;
      encounterStartBtn.setAttribute('aria-disabled', isActive.toString());
    }
    if (encounterSuspendBtn) {
      const isSuspended = encounterState === 'suspended';
      encounterSuspendBtn.disabled = isSuspended;
      encounterSuspendBtn.setAttribute('aria-disabled', isSuspended.toString());
    }
  }

  async function handleEncounterAction(path) {
    try {
      const res = await fetch(path, { method: 'POST' });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          window.location.replace('/index.html');
          return;
        }
        throw new Error('Server returned ' + res.status);
      }
      const state = await res.json();
      applyState(state);
    } catch (err) {
      if (statusDiv) statusDiv.textContent = `Error updating encounter: ${err.message}`;
    }
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

  function renderTurnTable(players, currentTurnId) {
    if (!playersBody) return;
    playersBody.innerHTML = '';
    if (players.length === 0) {
      playersBody.appendChild(createEmptyEncounterRow(5));
      return;
    }

    players.forEach((p) => {
      const tr = document.createElement('tr');
      tr.classList.add('player-row');
      if (p.isHidden) {
        tr.classList.add('hidden-character');
      }
      if (currentTurnId && p.id === currentTurnId) {
        tr.classList.add('current-turn');
      }

      const initTd = document.createElement('td');
      initTd.textContent = formatInitiative(p.initiative);

      const nameTd = document.createElement('td');
      const nameLine = document.createElement('span');
      nameLine.textContent = p.name;
      nameTd.appendChild(nameLine);
      const controllerName = getCharacterControllerName(p);
      if (controllerName) {
        const ownerLine = document.createElement('span');
        ownerLine.classList.add('player-owner');
        ownerLine.textContent = ` (${controllerName})`;
        nameTd.appendChild(ownerLine);
      }

      const hpTd = document.createElement('td');
      const stats = Array.isArray(p.stats) ? p.stats : [];
      const orderedStats = orderedEncounterStats(stats, statKeys);
      const statusInfo = encounterStatusInfo(stats, statKeys);
      if (statusInfo) {
        applyEncounterHealthClasses(hpTd, statusInfo);
        const valueLine = document.createElement('div');
        valueLine.textContent = formatEncounterStatsText(orderedStats, statKeys);
        hpTd.appendChild(valueLine);
      } else {
        hpTd.textContent = '—';
      }

      const conditionsTd = document.createElement('td');
      conditionsTd.classList.add('conditions-cell');
      const list = buildEncounterConditionsList(p.conditions, conditionLookup);
      if (list) {
        conditionsTd.appendChild(list);
      } else {
        conditionsTd.textContent = '—';
      }

      tr.appendChild(initTd);
      tr.appendChild(nameTd);
      tr.appendChild(hpTd);
      tr.appendChild(conditionsTd);
      const actTd = document.createElement('td');
      const actButton = document.createElement('button');
      actButton.type = 'button';
      actButton.textContent = 'Act Now';
      actButton.disabled = encounterState !== 'active' || currentTurnId === p.id;
      actButton.addEventListener('click', () => {
        setTurnNow(p.id);
      });
      actTd.appendChild(actButton);
      tr.appendChild(actTd);
      playersBody.appendChild(tr);
    });
  }

  function renderCharacterList(players, activeTurnId) {
    if (!characterList) return;
    characterList.innerHTML = '';
    if (selectionToolbarAnchor) {
      selectionToolbarAnchor.classList.add('hidden');
    }
    const filteredPlayers = hidePlayers
      ? players.filter((player) => Boolean(player.isReferee))
      : players;
    if (filteredPlayers.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'subtitle';
      empty.textContent = 'No characters yet.';
      characterList.appendChild(empty);
      return;
    }

    filteredPlayers.forEach((player) => {
      const item = document.createElement('div');
      item.className = 'character-item';
      if (player.id === selectedCharacterId) {
        item.classList.add('active');
      }
      if (player.isHidden) {
        item.classList.add('hidden-character');
      }
      if (player.id === activeTurnId) {
        item.classList.add('current-turn');
      }

      const row = document.createElement('div');
      row.className = 'character-row';

      const nameWrap = document.createElement('div');
      const name = document.createElement('div');
      name.className = 'character-name';
      name.textContent = player.name;
      const meta = document.createElement('div');
      meta.className = 'character-meta';
      const initiativeButton = document.createElement('button');
      initiativeButton.type = 'button';
      initiativeButton.className = 'initiative-inline-button';
      initiativeButton.textContent = `Init ${formatInitiative(player.initiative)}`;
      initiativeButton.addEventListener('click', (event) => {
        event.stopPropagation();
        editCharacterInitiative(player);
      });
      meta.appendChild(initiativeButton);
      if (player.isReferee && player.isHidden) {
        const hiddenState = document.createElement('span');
        hiddenState.className = 'character-hidden-state';
        hiddenState.textContent = player.revealOnTurn ? 'Hidden (Reveal on Turn)' : 'Hidden';
        meta.appendChild(hiddenState);
      }
      nameWrap.appendChild(name);
      nameWrap.appendChild(meta);
      row.appendChild(nameWrap);

      const statsWrap = document.createElement('div');
      statsWrap.className = 'character-stats';
      const stats = Array.isArray(player.stats) ? player.stats : [];
      const statsByKey = new Map(stats.map((stat) => [stat.key, stat]));
      const displayStatKeys = getCharacterStatKeys(player);

      displayStatKeys.forEach((key) => {
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
          adjustCharacterStat(player, key, -1);
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
          adjustCharacterStat(player, key, 1);
        });

        line.appendChild(label);
        line.appendChild(minus);
        line.appendChild(value);
        line.appendChild(plus);
        statsWrap.appendChild(line);
      });

      row.appendChild(statsWrap);
      item.appendChild(row);

      const conditionsList = buildEncounterConditionsList(player.conditions, conditionLookup);
      if (conditionsList) {
        conditionsList.classList.add('character-card-conditions');
        item.appendChild(conditionsList);
      }

      const isReferee = Boolean(player?.isReferee);

      const needsInitiativeAction =
        encounterState === 'active' &&
        isReferee &&
        (player.initiative === null || player.initiative === undefined);

      const showTurnCompleteAction =
        encounterState === 'active' &&
        Boolean(activeTurnId) &&
        player.id === activeTurnId &&
        isReferee;

      if (needsInitiativeAction || showTurnCompleteAction) {
        const actions = document.createElement('div');
        actions.className = 'character-actions';
        if (needsInitiativeAction) {
          const rollButton = document.createElement('button');
          rollButton.type = 'button';
          rollButton.textContent = 'Roll for Initiative!';
          rollButton.addEventListener('click', async (event) => {
            event.stopPropagation();
            await handleInitiativeAction(player);
          });
          actions.appendChild(rollButton);
        }
        const turnButton = document.createElement('button');
        if (showTurnCompleteAction) {
          turnButton.type = 'button';
          turnButton.textContent = 'Turn Complete';
          turnButton.className = 'character-turn-complete';
          turnButton.addEventListener('click', async (event) => {
            event.stopPropagation();
            await handleTurnComplete();
          });
          actions.appendChild(turnButton);
        }
        item.appendChild(actions);
      }

      if (player.id === selectedCharacterId && selectionToolbarAnchor) {
        selectionToolbarAnchor.classList.remove('hidden');
        item.appendChild(selectionToolbarAnchor);
      }

      item.addEventListener('click', () => {
        setSelectedCharacter(player);
      });

      characterList.appendChild(item);
    });
  }

  function clampCurrentStat(value, maxValue) {
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
    return clampCurrentStat(value, maxValue);
  }

  function adjustCharacterStat(player, statKey, delta) {
    if (!player) return;
    const stats = Array.isArray(player.stats) ? player.stats : [];
    const existing = stats.find((stat) => stat.key === statKey) || {
      key: statKey,
      current: 0,
      max: 0
    };
    const nextStats = stats.map((stat) => ({ ...stat }));
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

    player.stats = nextStats;
    if (selectedCharacterId === player.id) {
      const entry = editorStatInputs.get(statKey);
      const updated = player.stats.find((stat) => stat.key === statKey);
      if (entry?.currentInput && updated) {
        entry.currentInput.value = updated.current;
      }
      if (supportsTempHp && statKey === 'HP') {
        const tempEntry = editorStatInputs.get('TempHP');
        const updatedTemp = player.stats.find((stat) => stat.key === 'TempHP');
        if (tempEntry?.currentInput && updatedTemp) {
          tempEntry.currentInput.value = updatedTemp.current;
        }
      }
    }
    saveCharacterEntry(player);
    renderCharacterList(currentPlayers, currentTurnId);
    skipRefresh = true;
  }

  function setSelectedCharacter(player) {
    if (!player) return;
    const selectionChanged = selectedCharacterId !== player.id;
    selectedCharacterId = player.id;
    detailsDirty = false;
    conditionsDirty = false;
    if (selectionChanged) {
      closeOverflowMenu();
    }
    if (editorEmpty) editorEmpty.classList.add('hidden');
    if (editorForm) editorForm.classList.remove('hidden');
    if (editorNameInput) editorNameInput.value = player.name || '';
    if (editorInitiativeBonusInput) {
      editorInitiativeBonusInput.value = Number.isFinite(player.initiativeBonus) ? player.initiativeBonus : '';
    }
    updateEditorInitiativeBonusAvailability();
      const stats = Array.isArray(player.stats) ? player.stats : [];
      if (!player.statBlockId) {
        const inferredStatBlockId = inferStatBlockIdFromStats(stats);
        if (inferredStatBlockId) {
          player.statBlockId = inferredStatBlockId;
      }
    }
    editorStatKeys = getCharacterStatKeys(player);
    buildEditorStatsFields();
    const statsByKey = new Map(stats.map((stat) => [stat.key, stat]));
    editorStatInputs.forEach((entry, key) => {
      const stat = statsByKey.get(key);
      if (entry.maxInput) {
        entry.maxInput.value = Number.isFinite(stat?.max) ? stat.max : '';
      }
      if (entry.currentInput) {
        entry.currentInput.value = Number.isFinite(stat?.current) ? stat.current : '';
      }
    });
    selectedConditions = new Set(player.conditions || []);
    renderEditorConditions(editorConditionFilter ? editorConditionFilter.value : '');
    updateSelectedConditionsDisplay();
    updateActionButtons(player);
    updateSelectionControls();
    renderCharacterList(currentPlayers, currentTurnId);
  }

  async function editCharacterInitiative(player) {
    if (!player) return;
    const entered = prompt(
      `Set initiative for ${player.name} (leave blank to clear)`,
      Number.isFinite(player.initiative) ? String(player.initiative) : ''
    );
    if (entered === null) return;
    const trimmed = entered.trim();
    if (!trimmed) {
      player.initiative = null;
      await saveCharacterEntry(player);
      return;
    }
    const initiative = Number(trimmed);
    if (!Number.isFinite(initiative)) {
      if (statusDiv) statusDiv.textContent = 'Initiative must be a valid number.';
      return;
    }
    player.initiative = initiative;
    await saveCharacterEntry(player);
  }

  async function handleInitiativeAction(player) {
    if (!player) return;
    if (player.useAppInitiativeRoll !== false) {
      const rolled = rollStandardDie(currentStandardDie, player.initiativeBonus);
      if (Number.isFinite(rolled)) {
        player.initiative = rolled;
        renderCharacterList(currentPlayers, currentTurnId);
        skipRefresh = true;
        await saveCharacterEntry(player);
        return;
      }
    }

    const entered = prompt(`Enter initiative for ${player.name}`, '');
    if (entered === null) return;
    const trimmed = entered.trim();
    if (!trimmed) return;
    const initiative = Number(trimmed);
    if (!Number.isFinite(initiative)) {
      if (statusDiv) statusDiv.textContent = 'Initiative must be a valid number.';
      return;
    }
    player.initiative = initiative;
    renderCharacterList(currentPlayers, currentTurnId);
    skipRefresh = true;
    await saveCharacterEntry(player);
  }

  function updateActionButtons(player) {
    const isReferee = Boolean(player?.isReferee);
    const isHidden = Boolean(player?.isHidden);
    const canClaim = Boolean(player && !isReferee && !player.claimedSessionId);
    const canRelease = Boolean(player && (player.claimedSessionId || isReferee));
    const canDelete = Boolean(player);
    const hasReference = Boolean(player?.referenceUrl);
    if (revealNowBtn) {
      revealNowBtn.classList.toggle('hidden', !isHidden || !isReferee);
      revealNowBtn.disabled = !isHidden || !isReferee;
    }
    if (revealTurnBtn) {
      revealTurnBtn.classList.toggle('hidden', !isHidden || !isReferee);
      revealTurnBtn.disabled = !isHidden || !isReferee;
    }
    if (hideBtn) {
      hideBtn.classList.toggle('hidden', !isReferee || isHidden);
      hideBtn.disabled = !isReferee || isHidden;
    }
    if (claimCharacterBtn) {
      claimCharacterBtn.classList.toggle('hidden', !canClaim);
      claimCharacterBtn.disabled = !canClaim;
      claimCharacterBtn.setAttribute('aria-disabled', (!canClaim).toString());
    }
    if (releaseCharacterBtn) {
      releaseCharacterBtn.classList.toggle('hidden', !canRelease);
      releaseCharacterBtn.disabled = !canRelease;
      releaseCharacterBtn.setAttribute('aria-disabled', (!canRelease).toString());
      releaseCharacterBtn.textContent = isReferee ? 'Release to Pool' : 'Release Character';
    }
    if (deleteCharacterBtn) {
      deleteCharacterBtn.disabled = !canDelete;
      deleteCharacterBtn.setAttribute('aria-disabled', (!canDelete).toString());
    }
    if (openReferenceBtn) {
      openReferenceBtn.classList.toggle('hidden', !hasReference);
      openReferenceBtn.disabled = !hasReference;
      openReferenceBtn.setAttribute('aria-disabled', (!hasReference).toString());
    }
    if (overflowToggle) {
      const hasAction = canClaim || canRelease || canDelete || hasReference;
      overflowToggle.classList.toggle('hidden', !hasAction);
      overflowToggle.disabled = !hasAction;
      overflowToggle.setAttribute('aria-disabled', (!hasAction).toString());
      if (!hasAction) {
        closeOverflowMenu();
      }
    }
  }

  function updateSelectionControls() {
    const hasSelection = Boolean(selectedCharacterId);
    const toggleButtons = [detailsToggle, conditionsToggle];
    toggleButtons.forEach((button) => {
      if (!button) return;
      button.disabled = !hasSelection;
      button.classList.toggle('hidden', !hasSelection);
    });
    [revealNowBtn, revealTurnBtn, hideBtn].forEach((button) => {
      if (!button) return;
      if (!hasSelection) {
        button.disabled = true;
        button.classList.add('hidden');
      }
    });
    if (!hasSelection) {
      closeOverflowMenu();
    }
  }

  function clearSelectedCharacter() {
    selectedCharacterId = null;
    detailsDirty = false;
    conditionsDirty = false;
    if (editorForm) editorForm.classList.add('hidden');
    if (editorEmpty) editorEmpty.classList.remove('hidden');
    closeOverflowMenu();
    setDetailsPanelOpen(false);
    setConditionsPanelOpen(false);
    updateSelectionControls();
    updateActionButtons(null);
    renderCharacterList(currentPlayers, currentTurnId);
  }

  function openSelectedCharacterReference() {
    const selected = selectedCharacterId
      ? currentPlayers.find((player) => player.id === selectedCharacterId)
      : null;
    const referenceUrl = selected?.referenceUrl?.trim();
    if (!referenceUrl) return;
    window.open(referenceUrl, '_blank', 'noopener');
  }

  function renderEditorConditions(filterText = '') {
    if (!editorConditionsGrid) return;
    const normalizedFilter = filterText.trim().toLowerCase();
    editorConditionsGrid.innerHTML = '';

    if (conditionLibrary.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.className = 'subtitle';
      emptyState.textContent = 'No conditions available.';
      editorConditionsGrid.appendChild(emptyState);
      return;
    }

    const filtered = conditionLibrary.filter((condition) =>
      condition.name.toLowerCase().includes(normalizedFilter)
    );

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'subtitle';
      empty.textContent = 'No matching conditions.';
      editorConditionsGrid.appendChild(empty);
      return;
    }

    filtered.forEach((condition) => {
      const checkboxId = `ref-cond-${condition.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      const wrapper = document.createElement('label');
      wrapper.setAttribute('for', checkboxId);
      wrapper.classList.add('condition-cell');

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = checkboxId;
      checkbox.value = condition.name;
      checkbox.checked = selectedConditions.has(condition.name);
      if (checkbox.checked) {
        wrapper.classList.add('selected');
      }

      checkbox.addEventListener('change', (event) => {
        if (event.target.checked) {
          selectedConditions.add(condition.name);
          wrapper.classList.add('selected');
        } else {
          selectedConditions.delete(condition.name);
          wrapper.classList.remove('selected');
        }
        updateSelectedConditionsDisplay();
        conditionsDirty = true;
      });

      const nameSpan = document.createElement('span');
      nameSpan.textContent = condition.name;
      wrapper.appendChild(checkbox);
      wrapper.appendChild(nameSpan);
      editorConditionsGrid.appendChild(wrapper);
    });
  }

  function updateSelectedConditionsDisplay() {
    if (!editorSelectedConditions) return;
    editorSelectedConditions.innerHTML = '';
    if (selectedConditions.size === 0) {
      const pill = document.createElement('span');
      pill.className = 'selected-pill';
      pill.textContent = 'No conditions';
      editorSelectedConditions.appendChild(pill);
      return;
    }
    Array.from(selectedConditions)
      .sort()
      .forEach((conditionName) => {
        const pill = document.createElement('span');
        pill.className = 'selected-pill';
        pill.textContent = conditionName;
        editorSelectedConditions.appendChild(pill);
      });
  }

  async function updateVisibility(id, isHidden, revealOnTurn) {
    try {
      const res = await fetch(`/characters/${id}/visibility`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isHidden, revealOnTurn })
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          window.location.replace('/index.html');
          return;
        }
        throw new Error('Server returned ' + res.status);
      }
      await loadState();
    } catch (err) {
      if (statusDiv) statusDiv.textContent = `Failed to update visibility: ${err.message}`;
    }
  }

  function buildEditorPayload() {
    if (!selectedCharacterId) return null;
    const name = editorNameInput ? editorNameInput.value.trim() : '';
    if (!name) {
      if (statusDiv) statusDiv.textContent = 'Character is required.';
      return null;
    }
    const initiativeBonusStr = editorInitiativeBonusInput ? editorInitiativeBonusInput.value.trim() : '';
    const initiativeBonus = initiativeBonusStr === '' ? 0 : Number(initiativeBonusStr);
    if (!Number.isFinite(initiativeBonus)) {
      if (statusDiv) statusDiv.textContent = 'Initiative bonus must be a valid number.';
      return null;
    }

    const statsPayload = [];
    for (const key of editorStatKeys) {
      const entry = editorStatInputs.get(key);
      const maxStr = entry?.maxInput ? entry.maxInput.value.trim() : '';
      const currentStr = entry?.currentInput ? entry.currentInput.value.trim() : '';
      const isTempHp = key === 'TempHP';
      if (!isTempHp && maxStr === '') {
        if (statusDiv) statusDiv.textContent = `Max ${key} is required.`;
        return null;
      }
      const maxVal = isTempHp ? 0 : Number(maxStr);
      const requiresPositiveMax = !isTempHp;
      if (!isTempHp && (!Number.isFinite(maxVal) || (requiresPositiveMax ? maxVal <= 0 : maxVal < 0))) {
        if (statusDiv) {
          statusDiv.textContent = requiresPositiveMax
            ? `Max ${key} must be greater than 0.`
            : `Max ${key} must be 0 or greater.`;
        }
        return null;
      }
      const currentVal = currentStr === '' ? (isTempHp ? 0 : maxVal) : Number(currentStr);
      if (!Number.isFinite(currentVal)) {
        if (statusDiv) statusDiv.textContent = `${key} current value must be a valid number.`;
        return null;
      }
      const allowsNegative = key !== 'TempHP' && allowNegativeHealth;
      if ((!isTempHp && currentVal > maxVal) || (!allowsNegative && currentVal < 0)) {
        if (statusDiv) {
          statusDiv.textContent = allowsNegative
            ? `${key} current must be less than or equal to Max.`
            : `${key} current must be between 0 and Max.`;
        }
        return null;
      }
      statsPayload.push({ key, current: currentVal, max: isTempHp ? 0 : maxVal });
    }

    const current = currentPlayers.find((player) => player.id === selectedCharacterId);
    if (current) {
      current.useAppInitiativeRoll = true;
      current.initiativeBonus = initiativeBonus;
    }
    const payload = {
      id: selectedCharacterId,
      ownerName: current?.ownerName || 'Referee',
      name,
      statBlockId: current?.statBlockId || inferStatBlockIdFromStats(current?.stats) || null,
      initiative: current?.initiative ?? null,
      useAppInitiativeRoll: true,
      initiativeBonus,
      stats: statsPayload,
      revealStats: current?.revealStats ?? false,
      isHidden: current?.isHidden,
      revealOnTurn: current?.revealOnTurn,
      conditions: Array.from(selectedConditions)
    };
    if (currentCampaignName) {
      payload.campaignName = currentCampaignName;
    }
    return payload;
  }

  async function saveEditorCharacter() {
    const payload = buildEditorPayload();
    if (!payload) return false;
    try {
      if (!activeCampaignId) {
        throw new Error('No active campaign selected.');
      }
      const res = await fetch(
        `/campaigns/${encodeURIComponent(activeCampaignId)}/me/characters`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }
      );
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          window.location.replace('/index.html');
          return false;
        }
        throw new Error('Server returned ' + res.status);
      }
      detailsDirty = false;
      conditionsDirty = false;
      if (statusDiv) statusDiv.textContent = 'Character updated.';
      await loadState();
      return true;
    } catch (err) {
      if (statusDiv) statusDiv.textContent = `Failed to update character: ${err.message}`;
      return false;
    }
  }

  async function setTurnNow(id) {
    try {
      const res = await fetch(`/turn-set/${id}`, { method: 'POST' });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          window.location.replace('/index.html');
          return;
        }
        throw new Error('Server returned ' + res.status);
      }
      await loadState();
    } catch (err) {
      if (statusDiv) statusDiv.textContent = `Failed to set turn: ${err.message}`;
    }
  }

  async function handleAddCharacter(event) {
    event.preventDefault();
    const name = nameInput.value.trim();
    const quantityStr = quantityInput ? quantityInput.value.trim() : '1';
    if (!name) {
      if (statusDiv) statusDiv.textContent = 'Character is required.';
      return;
    }
    const quantity = Math.max(1, Number(quantityStr));
    if (!Number.isFinite(quantity) || quantity <= 0) {
      if (statusDiv) statusDiv.textContent = 'Quantity must be at least 1.';
      return;
    }
    const initiativeBonusStr = initiativeBonusInput ? initiativeBonusInput.value.trim() : '';
    const initiativeBonus = initiativeBonusStr === '' ? 0 : Number(initiativeBonusStr);
    if (!Number.isFinite(initiativeBonus)) {
      if (statusDiv) statusDiv.textContent = 'Initiative bonus must be a valid number.';
      return;
    }

    const statsPayload = [];
    for (const key of addStatKeys) {
      const entry = statInputs.get(key);
      const maxStr = entry?.maxInput ? entry.maxInput.value.trim() : '';
      const currentStr = entry?.currentInput ? entry.currentInput.value.trim() : '';
      const isTempHp = key === 'TempHP';
      if (!isTempHp && maxStr === '') {
        if (statusDiv) statusDiv.textContent = `Max ${key} is required.`;
        return;
      }
      const maxVal = isTempHp ? 0 : Number(maxStr);
      const requiresPositiveMax = !isTempHp;
      if (!isTempHp && (!Number.isFinite(maxVal) || (requiresPositiveMax ? maxVal <= 0 : maxVal < 0))) {
        if (statusDiv) {
          statusDiv.textContent = requiresPositiveMax
            ? `Max ${key} must be greater than 0.`
            : `Max ${key} must be 0 or greater.`;
        }
        return;
      }
      const currentVal = currentStr === '' ? (isTempHp ? 0 : maxVal) : Number(currentStr);
      if (!Number.isFinite(currentVal)) {
        if (statusDiv) statusDiv.textContent = `${key} current value must be a valid number.`;
        return;
      }
      const allowsNegative = key !== 'TempHP' && allowNegativeHealth;
      if ((!isTempHp && currentVal > maxVal) || (!allowsNegative && currentVal < 0)) {
        if (statusDiv) {
          statusDiv.textContent = allowsNegative
            ? `${key} current must be less than or equal to Max.`
            : `${key} current must be between 0 and Max.`;
        }
        return;
      }
      statsPayload.push({ key, current: currentVal, max: isTempHp ? 0 : maxVal });
    }

    try {
      const shouldReveal = Boolean(visibleToggle && visibleToggle.checked);
      const referenceUrl = selectedCreatureLibrary?.referenceUrl || null;
      const statBlockId = selectedAddStatBlockId || getDefaultAddStatBlockId() || null;
      for (let i = 1; i <= quantity; i += 1) {
        const suffix = quantity > 1 ? ` (${i})` : '';
        const payload = {
          ownerName: 'Referee',
          name: `${name}${suffix}`,
          referenceUrl,
          statBlockId,
          initiative: null,
          useAppInitiativeRoll: true,
          initiativeBonus,
          stats: statsPayload,
          revealStats: false,
          isHidden: !shouldReveal,
          revealOnTurn: false,
          conditions: []
        };
        if (currentCampaignName) {
          payload.campaignName = currentCampaignName;
        }
        if (!activeCampaignId) {
          throw new Error('No active campaign selected.');
        }
        const res = await fetch(
          `/campaigns/${encodeURIComponent(activeCampaignId)}/me/characters`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }
        );
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            window.location.replace('/index.html');
            return;
          }
          throw new Error('Server returned ' + res.status);
        }
      }
      if (statusDiv) {
        statusDiv.textContent = shouldReveal ? 'Added visible character.' : 'Added hidden character.';
      }
      hideAddForm();
      await loadState();
    } catch (err) {
      if (statusDiv) statusDiv.textContent = `Failed to add character: ${err.message}`;
    }
  }

  function showAddForm() {
    if (!form) return;
    clearAddForm();
    setAddDialogTab('manual');
    form.classList.remove('hidden');
    form.classList.remove('details-panel-collapsed');
    form.classList.add('details-panel-open');
    form.setAttribute('aria-hidden', 'false');
  }

  function hideAddForm() {
    if (!form) return;
    clearAddForm();
    form.classList.add('details-panel-collapsed');
    form.classList.remove('details-panel-open');
    form.classList.add('hidden');
    form.setAttribute('aria-hidden', 'true');
  }

  function clearAddForm() {
    resetCreatureLibraryState();
    setAddStatBlockId(getDefaultAddStatBlockId(), { preserveValues: false });
    if (nameInput) nameInput.value = '';
    if (quantityInput) quantityInput.value = '1';
    if (initiativeBonusInput) initiativeBonusInput.value = '';
    statInputs.forEach((entry) => {
      if (entry.maxInput) entry.maxInput.value = '';
      if (entry.currentInput) entry.currentInput.value = '';
    });
    if (visibleToggle) visibleToggle.checked = false;
  }

  async function saveCharacterEntry(player) {
    try {
      const payload = {
        id: player.id,
        ownerName: player.ownerName,
        name: player.name,
        statBlockId: player.statBlockId || inferStatBlockIdFromStats(player.stats) || null,
        initiative: player.initiative,
        useAppInitiativeRoll: player.useAppInitiativeRoll,
        initiativeBonus: player.initiativeBonus,
        stats: Array.isArray(player.stats) ? player.stats : [],
        revealStats: player.revealStats,
        isHidden: player.isHidden,
        revealOnTurn: player.revealOnTurn,
        conditions: Array.isArray(player.conditions) ? player.conditions : []
      };
      if (currentCampaignName) {
        payload.campaignName = currentCampaignName;
      }
      if (!activeCampaignId) {
        throw new Error('No active campaign selected.');
      }
      const res = await fetch(
        `/campaigns/${encodeURIComponent(activeCampaignId)}/me/characters`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }
      );
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          window.location.replace('/index.html');
          return;
        }
        throw new Error('Server returned ' + res.status);
      }
      await loadState();
    } catch (err) {
      if (statusDiv) statusDiv.textContent = `Failed to update character: ${err.message}`;
    }
  }

  async function deleteCharacter(id) {
    try {
      if (!activeCampaignId) {
        throw new Error('No active campaign selected.');
      }
      const res = await fetch(
        `/campaigns/${encodeURIComponent(activeCampaignId)}/me/characters/${encodeURIComponent(id)}`,
        { method: 'DELETE' }
      );
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          window.location.replace('/index.html');
          return;
        }
        throw new Error('Server returned ' + res.status);
      }
      clearSelectedCharacter();
      await loadState();
    } catch (err) {
      if (statusDiv) statusDiv.textContent = `Failed to remove character: ${err.message}`;
    }
  }

  function bindActionButtons() {
    if (revealNowBtn) {
      revealNowBtn.addEventListener('click', () => {
        if (!selectedCharacterId) return;
        updateVisibility(selectedCharacterId, false, false);
      });
    }
    if (revealTurnBtn) {
      revealTurnBtn.addEventListener('click', () => {
        if (!selectedCharacterId) return;
        updateVisibility(selectedCharacterId, true, true);
      });
    }
  if (hideBtn) {
    hideBtn.addEventListener('click', () => {
      if (!selectedCharacterId) return;
      updateVisibility(selectedCharacterId, true, false);
    });
  }

  if (overflowToggle) {
    overflowToggle.addEventListener('click', (event) => {
      event.stopPropagation();
      if (!selectedCharacterId) return;
      toggleOverflowMenu();
    });
  }

  if (overflowMenu) {
    overflowMenu.addEventListener('click', (event) => {
      event.stopPropagation();
    });
  }

  if (openReferenceBtn) {
    openReferenceBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      closeOverflowMenu();
      openSelectedCharacterReference();
    });
  }

  if (claimCharacterBtn) {
    claimCharacterBtn.addEventListener('click', async (event) => {
      event.stopPropagation();
      closeOverflowMenu();
      const selected = selectedCharacterId
        ? currentPlayers.find((player) => player.id === selectedCharacterId)
        : null;
      if (!selected || selected.isReferee || selected.claimedSessionId) return;
      await claimCharacter(selected);
    });
  }

  if (releaseCharacterBtn) {
      releaseCharacterBtn.addEventListener('click', async (event) => {
        event.stopPropagation();
        closeOverflowMenu();
      const selected = selectedCharacterId
        ? currentPlayers.find((player) => player.id === selectedCharacterId)
        : null;
      if (!selected) return;
      if (selected.isReferee) {
        await releaseCharacterToPool(selected);
        return;
      }
      if (!selected.claimedSessionId) return;
      await forceReleaseCharacter(selected);
    });
  }

  document.addEventListener('click', () => {
    closeOverflowMenu();
  });
  }

  async function forceReleaseCharacter(player) {
    if (!player || !activeCampaignId) return;
    try {
      statusDiv.textContent = 'Releasing character...';
      const res = await fetch(
        `/referee/campaigns/${encodeURIComponent(activeCampaignId)}/characters/${encodeURIComponent(player.id)}/release`,
        { method: 'POST' }
      );
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          window.location.replace('/index.html');
          return;
        }
        throw new Error('Server returned ' + res.status);
      }
      statusDiv.textContent = '';
      await loadState();
    } catch (err) {
      if (statusDiv) statusDiv.textContent = `Release failed: ${err.message}`;
    }
  }

  async function releaseCharacterToPool(player) {
    if (!player || !activeCampaignId) return;
    try {
      statusDiv.textContent = 'Releasing to pool...';
      const res = await fetch(
        `/referee/campaigns/${encodeURIComponent(activeCampaignId)}/characters/${encodeURIComponent(player.id)}/release-to-pool`,
        { method: 'POST' }
      );
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          window.location.replace('/index.html');
          return;
        }
        throw new Error('Server returned ' + res.status);
      }
      statusDiv.textContent = '';
      await loadState();
    } catch (err) {
      if (statusDiv) statusDiv.textContent = `Release failed: ${err.message}`;
    }
  }

  async function claimCharacter(player) {
    if (!player || !activeCampaignId) return;
    try {
      statusDiv.textContent = 'Claiming character...';
      const res = await fetch(
        `/referee/campaigns/${encodeURIComponent(activeCampaignId)}/characters/${encodeURIComponent(player.id)}/claim`,
        { method: 'POST' }
      );
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          window.location.replace('/index.html');
          return;
        }
        throw new Error('Server returned ' + res.status);
      }
      statusDiv.textContent = '';
      await loadState();
    } catch (err) {
      if (statusDiv) statusDiv.textContent = `Claim failed: ${err.message}`;
    }
  }


  async function handleTurnComplete() {
    try {
      const res = await fetch('/turn-complete', { method: 'POST' });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          window.location.replace('/index.html');
          return;
        }
        throw new Error('Server returned ' + res.status);
      }
      await loadState();
    } catch (err) {
      if (statusDiv) statusDiv.textContent = `Error advancing turn: ${err.message}`;
    }
  }

  async function init() {
    const hasActiveCampaign = await loadCampaign();
    await loadConditionLibrary();
    if (hasActiveCampaign) {
      await loadCampaignUserData();
      await loadState();
    }
    campaignLiveStream.start();
  }

  if (form) {
    form.addEventListener('submit', handleAddCharacter);
  }
  updateAddInitiativeBonusAvailability();
  updateEditorInitiativeBonusAvailability();
  if (editorForm) {
    editorForm.addEventListener('submit', (event) => {
      event.preventDefault();
      saveEditorCharacter();
    });
  }
  if (turnCompleteBtn) {
    turnCompleteBtn.addEventListener('click', handleTurnComplete);
  }
  if (encounterNewBtn) {
    encounterNewBtn.addEventListener('click', () => {
      handleEncounterAction('/encounter/new');
    });
  }
  if (encounterStartBtn) {
    encounterStartBtn.addEventListener('click', () => {
      handleEncounterAction('/encounter/start');
    });
  }
  if (encounterSuspendBtn) {
    encounterSuspendBtn.addEventListener('click', () => {
      handleEncounterAction('/encounter/suspend');
    });
  }
  if (editorConditionFilter) {
    editorConditionFilter.addEventListener('input', (event) => {
      renderEditorConditions(event.target.value || '');
    });
  }
  if (editorNameInput) {
    editorNameInput.addEventListener('input', () => {
      detailsDirty = true;
    });
  }
  if (detailsToggle && detailsPanel) {
    detailsToggle.addEventListener('click', () => {
      const isOpen = detailsPanel.classList.contains('details-panel-open');
      setDetailsPanelOpen(!isOpen);
    });
  }
  if (detailsCancelBtn) {
    detailsCancelBtn.addEventListener('click', () => {
      if (detailsDirty) {
        const discard = confirm('Discard unsaved detail changes?');
        if (!discard) return;
        const current = currentPlayers.find((player) => player.id === selectedCharacterId);
        if (current) {
          setSelectedCharacter(current);
        }
      }
      setDetailsPanelOpen(false);
    });
  }
  if (detailsSaveBtn) {
    detailsSaveBtn.addEventListener('click', async () => {
      const saved = await saveEditorCharacter();
      if (saved) {
        setDetailsPanelOpen(false);
      }
    });
  }
  if (detailsPanel) {
    detailsPanel.addEventListener('click', (event) => {
      if (event.target !== detailsPanel) return;
      if (detailsDirty) {
        const discard = confirm('Discard unsaved detail changes?');
        if (!discard) return;
        const current = currentPlayers.find((player) => player.id === selectedCharacterId);
        if (current) {
          setSelectedCharacter(current);
        }
      }
      setDetailsPanelOpen(false);
    });
  }
  if (conditionsToggle && conditionsPanel) {
    conditionsToggle.addEventListener('click', () => {
      const isOpen = conditionsPanel.classList.contains('conditions-panel-open');
      setConditionsPanelOpen(!isOpen);
    });
  }
  if (conditionsCancelBtn) {
    conditionsCancelBtn.addEventListener('click', () => {
      if (conditionsDirty) {
        const discard = confirm('Discard unsaved condition changes?');
        if (!discard) return;
        const current = currentPlayers.find((player) => player.id === selectedCharacterId);
        if (current) {
          setSelectedCharacter(current);
        }
      }
      setConditionsPanelOpen(false);
    });
  }
  if (conditionsSaveBtn) {
    conditionsSaveBtn.addEventListener('click', async () => {
      const saved = await saveEditorCharacter();
      if (saved) {
        setConditionsPanelOpen(false);
      }
    });
  }
  if (conditionsPanel) {
    conditionsPanel.addEventListener('click', (event) => {
      if (event.target !== conditionsPanel) return;
      if (conditionsDirty) {
        const discard = confirm('Discard unsaved condition changes?');
        if (!discard) return;
        const current = currentPlayers.find((player) => player.id === selectedCharacterId);
        if (current) {
          setSelectedCharacter(current);
        }
      }
      setConditionsPanelOpen(false);
    });
  }
  if (addButton) {
    addButton.addEventListener('click', () => {
      showAddForm();
    });
  }
  if (addManualTabBtn) {
    addManualTabBtn.addEventListener('click', () => {
      setAddDialogTab('manual');
    });
  }
  if (addLibraryTabBtn) {
    addLibraryTabBtn.addEventListener('click', () => {
      setAddDialogTab('library', { focus: true });
    });
  }
  if (addStatBlockSelect) {
    addStatBlockSelect.addEventListener('change', (event) => {
      setAddStatBlockId(event.target.value, { preserveValues: true });
    });
  }
  if (libraryQueryInput) {
    libraryQueryInput.addEventListener('input', (event) => {
      scheduleCreatureLibrarySearch(event.target.value || '');
    });
  }
  if (deleteCharacterBtn) {
    deleteCharacterBtn.addEventListener('click', () => {
      closeOverflowMenu();
      if (!selectedCharacterId) return;
      const current = currentPlayers.find((player) => player.id === selectedCharacterId);
      if (!current) return;
      const confirmDelete = confirm(`Remove ${current.name} from the tracker?`);
      if (!confirmDelete) return;
      deleteCharacter(current.id);
    });
  }
  if (addCancelBtn) {
    addCancelBtn.addEventListener('click', () => {
      hideAddForm();
    });
  }
  if (hidePcsToggle) {
    hidePcsToggle.addEventListener('change', () => {
      hidePlayers = hidePcsToggle.checked;
      renderCharacterList(currentPlayers, currentTurnId);
    });
  }
  bindActionButtons();
  updateSelectionControls();

  init();
});
