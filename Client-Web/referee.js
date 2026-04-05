const REFRESH_INTERVAL_MS = 5000;
const { QR_CODE_SIZE, rollStandardDie, formatInitiative } = window.PlayerTrackerShared || {
  QR_CODE_SIZE: 96,
  rollStandardDie: () => null,
  formatInitiative: () => 'X'
};
const {
  normalizeConditionEntry,
  formatEncounterStateText,
  orderedEncounterStats,
  encounterStatusInfo,
  applyEncounterHealthClasses,
  formatEncounterStatsText,
  buildEncounterConditionsList,
  createEmptyEncounterRow
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
  }
};
const { updateRulesetIcons, updateRulesetLinks, updateRulesetLicenses } = window.PlayerTrackerRuleset || {
  updateRulesetIcons: () => {},
  updateRulesetLinks: () => {},
  updateRulesetLicenses: () => {}
};

window.addEventListener('DOMContentLoaded', () => {
  const playersBody = document.getElementById('players-body');
  const turnCompleteBtn = document.getElementById('turn-complete');
  const statusDiv = document.getElementById('status');
  const encounterNewBtn = document.getElementById('encounter-new');
  const encounterStartBtn = document.getElementById('encounter-start');
  const encounterSuspendBtn = document.getElementById('encounter-suspend');

  const campaignNameLabel = document.getElementById('campaign-name');
  const refereeCampaignName = document.getElementById('ref-campaign-name');
  const refereeEncounterState = document.getElementById('ref-encounter-state');
  const refereeRulesetLink = document.getElementById('ref-ruleset-link');
  const refereeRulesetLicense = document.getElementById('ref-ruleset-license');
  const refereeRulesetLicenseWrap = document.getElementById('ref-ruleset-license-wrap');
  const rulesetLink = document.getElementById('ruleset-link');
  const rulesetLicense = document.getElementById('ruleset-license');
  const rulesetLicenseWrap = document.getElementById('ruleset-license-wrap');
  const rulesetIcon = document.getElementById('ruleset-icon');
  const refereeRulesetIcon = document.getElementById('ref-ruleset-icon');

  const form = document.getElementById('ref-add-panel');
  const nameInput = document.getElementById('ref-name');
  const quantityInput = document.getElementById('ref-quantity');
  const initiativeInput = document.getElementById('ref-initiative');
  const useAppInitiativeRollInput = document.getElementById('ref-use-app-initiative-roll');
  const initiativeBonusInput = document.getElementById('ref-initiative-bonus');
  const initiativeBonusWrap = document.getElementById('ref-initiative-bonus-wrap');
  const statsFields = document.getElementById('ref-stats-fields');
  const characterList = document.getElementById('referee-character-list');
  const healthHeading = document.getElementById('health-heading');
  const visibleToggle = document.getElementById('ref-visible');
  const addCurrentStats = document.getElementById('ref-add-current-stats');
  const addButton = document.getElementById('ref-add-button');
  const removeButton = document.getElementById('ref-remove-button');
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
  const hidePcsToggle = document.getElementById('ref-hide-pcs');

  let currentCampaignName = '';
  let statKeys = ['HP'];
  let statInputs = new Map();
  let editorStatInputs = new Map();
  let conditionLookup = new Map();
  let conditionLibrary = [];
  let selectedConditions = new Set();
  let selectedCharacterId = null;
  let currentPlayers = [];
  let conditionsPanelOpen = false;
  let currentTurnId = null;
  let encounterState = 'new';
  let skipRefresh = false;
  let allowNegativeHealth = false;
  let supportsTempHp = false;
  let currentStandardDie = null;
  let hidePlayers = true;
  let detailsDirty = false;
  let conditionsDirty = false;

  function updateRulesetLink(labelText, baseUrl) {
    updateRulesetLinks([rulesetLink, refereeRulesetLink], labelText, baseUrl);
  }

  function updateRulesetLicense(licenseUrl) {
    updateRulesetLicenses(
      [
        { linkEl: rulesetLicense, wrapEl: rulesetLicenseWrap },
        { linkEl: refereeRulesetLicense, wrapEl: refereeRulesetLicenseWrap }
      ],
      licenseUrl
    );
  }

  function setRulesetIcon(iconUrl, labelText) {
    updateRulesetIcons([rulesetIcon, refereeRulesetIcon], iconUrl, labelText);
  }

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

  function buildStatsFields() {
    statInputs.clear();
    if (statsFields) statsFields.innerHTML = '';
    if (addCurrentStats) addCurrentStats.innerHTML = '';
    if (healthHeading) {
      healthHeading.textContent = statKeys.length === 1 ? statKeys[0] : 'Stats';
    }

    statKeys.forEach((key) => {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const maxId = `ref-max-stat-${normalizedKey}`;
      const currentId = `ref-current-stat-${normalizedKey}`;
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
    editorStatInputs.clear();
    if (editorStatsFields) editorStatsFields.innerHTML = '';
    if (editorCurrentStats) editorCurrentStats.innerHTML = '';

    statKeys.forEach((key) => {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const maxId = `ref-edit-max-stat-${normalizedKey}`;
      const currentId = `ref-edit-current-stat-${normalizedKey}`;
      const isTempHp = key === 'TempHP';
      const currentInput = document.createElement('input');
      currentInput.type = 'number';
      currentInput.id = currentId;
      if (key === 'TempHP' || !allowNegativeHealth) {
        currentInput.min = '0';
      }
      currentInput.addEventListener('input', () => {
        detailsDirty = true;
      });

      let maxInput = null;
      if (!isTempHp) {
        maxInput = document.createElement('input');
        maxInput.type = 'number';
        maxInput.id = maxId;
        maxInput.min = '0';
        maxInput.addEventListener('input', () => {
          detailsDirty = true;
        });
      }

      if (editorStatsFields) {
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

        editorStatsFields.appendChild(row);
      }

      editorStatInputs.set(key, { maxInput, currentInput });
    });
  }

  async function loadCampaign() {
    try {
      const res = await fetch('/campaign');
      if (!res.ok) throw new Error('Server returned ' + res.status);
      const campaign = await res.json();
      currentCampaignName = campaign.name || '';
      if (campaignNameLabel) {
        campaignNameLabel.textContent = currentCampaignName || 'Campaign';
      }
      if (refereeCampaignName) {
        refereeCampaignName.textContent = currentCampaignName || 'Campaign';
      }
      updateRulesetLink(campaign.rulesetLabel || '', null);
      if (currentCampaignName) {
        document.title = `${currentCampaignName} - Referee`;
      } else {
        document.title = 'Turn Track';
      }
    } catch (err) {
      console.error('Failed to load campaign:', err);
      if (refereeCampaignName) {
        refereeCampaignName.textContent = currentCampaignName || 'Campaign';
      }
      document.title = 'Turn Track';
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
      supportsTempHp = Boolean(json?.supportsTempHp);
      if (supportsTempHp && !statKeys.includes('TempHP')) {
        statKeys = [...statKeys, 'TempHP'];
      }
      allowNegativeHealth = Boolean(json?.allowNegativeHealth);
      currentStandardDie =
        typeof json?.standardDie === 'string' && json.standardDie.trim()
          ? json.standardDie.trim()
          : null;
      buildStatsFields();
      buildEditorStatsFields();

      const baseUrl =
        typeof json?.rulesBaseUrl === 'string' && json.rulesBaseUrl.trim()
          ? json.rulesBaseUrl.trim()
          : null;
      const rulesetLabel = json?.label || '';
      updateRulesetLink(rulesetLabel, baseUrl);
      setRulesetIcon(json?.icon || null, rulesetLabel);
      updateRulesetLicense(json?.license || null);
      const normalized = (json?.conditions ?? []).map((entry) => normalizeConditionEntry(entry)).filter(Boolean);
      conditionLibrary = normalized;
      conditionLookup = new Map(normalized.map((entry) => [entry.name, entry]));
      renderEditorConditions(editorConditionFilter ? editorConditionFilter.value : '');
    } catch (err) {
      console.warn('Unable to load condition library:', err);
      updateRulesetLink('', null);
      setRulesetIcon(null, '');
      updateRulesetLicense(null);
      allowNegativeHealth = false;
      supportsTempHp = false;
      currentStandardDie = null;
      statKeys = ['HP'];
      buildStatsFields();
      buildEditorStatsFields();
    }
  }

  function applyState(state) {
    const players = state.players || [];
    currentPlayers = players;
    currentTurnId = state.currentTurnId || null;
    encounterState = state.encounterState || 'new';
    const round = state.round || 1;
    const currentTurnPlayer = currentTurnId ? players.find((player) => player.id === currentTurnId) : null;
    const isRefTurn = (currentTurnPlayer?.ownerName || '').toLowerCase() === 'referee';
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
      if (encounterState === 'active') {
        statusDiv.textContent = 'Encounter active.';
      } else if (encounterState === 'suspended') {
        statusDiv.textContent = 'Encounter suspended.';
      } else {
        statusDiv.textContent = 'New encounter.';
      }
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
    try {
      const res = await fetch('/state?view=referee');
      if (!res.ok) throw new Error('Server returned ' + res.status);
      const state = await res.json();
      applyState(state);
    } catch (err) {
      if (statusDiv) statusDiv.textContent = `Error loading state: ${err.message}`;
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
        throw new Error('Server returned ' + res.status);
      }
      const state = await res.json();
      applyState(state);
    } catch (err) {
      if (statusDiv) statusDiv.textContent = `Error updating encounter: ${err.message}`;
    }
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
      if (p.ownerName) {
        const ownerLine = document.createElement('span');
        ownerLine.classList.add('player-owner');
        ownerLine.textContent = ` (${p.ownerName})`;
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
    if (selectionToolbarAnchor && detailsToggle?.parentElement) {
      selectionToolbarAnchor.appendChild(detailsToggle.parentElement);
    }
    const filteredPlayers = hidePlayers
      ? players.filter((player) => (player.ownerName || '').toLowerCase() === 'referee')
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
      const isReferee = (player.ownerName || '').toLowerCase() === 'referee';
      let statusLabel = '';
      if (isReferee) {
        statusLabel = player.isHidden
          ? player.revealOnTurn
            ? 'Hidden (Reveal on Turn)'
            : 'Hidden'
          : 'Visible';
      } else {
        statusLabel = player.ownerName || 'Player';
      }
      const initiativeButton = document.createElement('button');
      initiativeButton.type = 'button';
      initiativeButton.className = 'initiative-inline-button';
      initiativeButton.textContent = `Init ${formatInitiative(player.initiative)} • ${statusLabel}`;
      initiativeButton.addEventListener('click', (event) => {
        event.stopPropagation();
        editCharacterInitiative(player);
      });
      meta.appendChild(initiativeButton);
      nameWrap.appendChild(name);
      nameWrap.appendChild(meta);
      row.appendChild(nameWrap);

      const statsWrap = document.createElement('div');
      statsWrap.className = 'character-stats';
      const stats = Array.isArray(player.stats) ? player.stats : [];
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

      if (player.id === selectedCharacterId && detailsToggle?.parentElement) {
        item.appendChild(detailsToggle.parentElement);
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
    selectedCharacterId = player.id;
    detailsDirty = false;
    conditionsDirty = false;
    if (editorEmpty) editorEmpty.classList.add('hidden');
    if (editorForm) editorForm.classList.remove('hidden');
    if (editorNameInput) editorNameInput.value = player.name || '';
    if (editorInitiativeBonusInput) {
      editorInitiativeBonusInput.value = Number.isFinite(player.initiativeBonus) ? player.initiativeBonus : '';
    }
    updateEditorInitiativeBonusAvailability();
    const stats = Array.isArray(player.stats) ? player.stats : [];
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
    const isReferee = (player?.ownerName || '').toLowerCase() === 'referee';
    const isHidden = Boolean(player?.isHidden);
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
    if (removeButton) {
      removeButton.disabled = !hasSelection;
      removeButton.setAttribute('aria-disabled', (!hasSelection).toString());
    }
  }

  function clearSelectedCharacter() {
    selectedCharacterId = null;
    detailsDirty = false;
    conditionsDirty = false;
    if (editorForm) editorForm.classList.add('hidden');
    if (editorEmpty) editorEmpty.classList.remove('hidden');
    setDetailsPanelOpen(false);
    setConditionsPanelOpen(false);
    updateSelectionControls();
    renderCharacterList(currentPlayers, currentTurnId);
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
      if (!res.ok) throw new Error('Server returned ' + res.status);
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
    for (const key of statKeys) {
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
      const res = await fetch('/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Server returned ' + res.status);
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
      if (!res.ok) throw new Error('Server returned ' + res.status);
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
    for (const key of statKeys) {
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
      for (let i = 1; i <= quantity; i += 1) {
        const suffix = quantity > 1 ? ` (${i})` : '';
        const payload = {
          ownerName: 'Referee',
          name: `${name}${suffix}`,
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
        const res = await fetch('/characters', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('Server returned ' + res.status);
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
      const res = await fetch('/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Server returned ' + res.status);
      await loadState();
    } catch (err) {
      if (statusDiv) statusDiv.textContent = `Failed to update character: ${err.message}`;
    }
  }

  async function deleteCharacter(id) {
    try {
      const res = await fetch(`/characters/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Server returned ' + res.status);
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
  }


  async function handleTurnComplete() {
    try {
      const res = await fetch('/turn-complete', { method: 'POST' });
      if (!res.ok) throw new Error('Server returned ' + res.status);
      await loadState();
    } catch (err) {
      if (statusDiv) statusDiv.textContent = `Error advancing turn: ${err.message}`;
    }
  }

  async function init() {
    await loadCampaign();
    await loadConditionLibrary();
    await loadState();
    setInterval(loadStateTimer, REFRESH_INTERVAL_MS);
  }

  function loadStateTimer() {
    if (skipRefresh) {
      skipRefresh = false;
      return;
    }
    loadState();
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
  if (removeButton) {
    removeButton.addEventListener('click', () => {
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
