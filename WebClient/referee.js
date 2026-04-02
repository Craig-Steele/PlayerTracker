const REFRESH_INTERVAL_MS = 5000;
const { QR_CODE_SIZE, updateRulesetIcon } = window.PlayerTrackerShared || {
  QR_CODE_SIZE: 96,
  updateRulesetIcon: () => {}
};

window.addEventListener('DOMContentLoaded', () => {
  const roundInfo = document.getElementById('round-info');
  const playersBody = document.getElementById('players-body');
  const turnCompleteBtn = document.getElementById('turn-complete');
  const statusDiv = document.getElementById('status');
  const encounterNewBtn = document.getElementById('encounter-new');
  const encounterStartBtn = document.getElementById('encounter-start');
  const encounterSuspendBtn = document.getElementById('encounter-suspend');

  const campaignNameLabel = document.getElementById('campaign-name');
  const rulesetLink = document.getElementById('ruleset-link');
  const rulesetLicense = document.getElementById('ruleset-license');
  const rulesetLicenseWrap = document.getElementById('ruleset-license-wrap');
  const rulesetIcon = document.getElementById('ruleset-icon');

  const form = document.getElementById('referee-form');
  const nameInput = document.getElementById('ref-name');
  const quantityInput = document.getElementById('ref-quantity');
  const initiativeInput = document.getElementById('ref-initiative');
  const statsFields = document.getElementById('ref-stats-fields');
  const characterList = document.getElementById('referee-character-list');
  const healthHeading = document.getElementById('health-heading');
  const visibleToggle = document.getElementById('ref-visible');
  const addCurrentStats = document.getElementById('ref-add-current-stats');
  const addButton = document.getElementById('ref-add-button');
  const addCancelBtn = document.getElementById('ref-add-cancel');
  const editorEmpty = document.getElementById('ref-editor-empty');
  const editorForm = document.getElementById('ref-editor');
  const editorNameInput = document.getElementById('ref-edit-name');
  const editorInitiativeInput = document.getElementById('ref-edit-initiative');
  const editorStatsFields = document.getElementById('ref-edit-stats');
  const editorCurrentStats = document.getElementById('ref-edit-current-stats');
  const editorConditionFilter = document.getElementById('ref-condition-filter');
  const editorConditionsGrid = document.getElementById('ref-conditions-grid');
  const editorSelectedConditions = document.getElementById('ref-selected-conditions');
  const detailsToggle = document.getElementById('ref-details-toggle');
  const detailsPanel = document.getElementById('ref-details-panel');
  const conditionsToggle = document.getElementById('ref-conditions-toggle');
  const conditionsPanel = document.getElementById('ref-conditions-panel');
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
  let hidePlayers = true;
  let autoSaveTimer = null;
  const AUTO_SAVE_DELAY_MS = 600;

  function updateRulesetLink(labelText, baseUrl) {
    if (!rulesetLink) return;
    rulesetLink.textContent = labelText || '';
    if (baseUrl) {
      rulesetLink.href = baseUrl;
      rulesetLink.removeAttribute('aria-disabled');
    } else {
      rulesetLink.removeAttribute('href');
      rulesetLink.setAttribute('aria-disabled', 'true');
    }
  }

  function updateRulesetLicense(licenseUrl) {
    if (!rulesetLicense || !rulesetLicenseWrap) return;
    if (licenseUrl) {
      rulesetLicense.href = licenseUrl;
      rulesetLicenseWrap.style.display = 'inline';
    } else {
      rulesetLicense.removeAttribute('href');
      rulesetLicenseWrap.style.display = 'none';
    }
  }

  function setRulesetIcon(iconUrl, labelText) {
    updateRulesetIcon(rulesetIcon, iconUrl, labelText);
  }

  function computeAbbreviationFromName(name) {
    const trimmed = (name || '').trim();
    if (!trimmed) return '';
    if (trimmed.length <= 4) return trimmed.toUpperCase();
    return trimmed.slice(0, 4).toUpperCase();
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
      if (!isTempHp) {
        const label = document.createElement('label');
        label.textContent = `Max ${key}`;
        const input = document.createElement('input');
        input.type = 'number';
        input.id = maxId;
        input.min = '0';
        label.appendChild(input);
        statsFields.appendChild(label);
        statInputs.set(key, { maxInput: input, currentInput: null });
      } else {
        statInputs.set(key, { maxInput: null, currentInput: null });
      }

      if (addCurrentStats) {
        const currentLabel = document.createElement('label');
        currentLabel.textContent = `Current ${key}`;
        const currentInput = document.createElement('input');
        currentInput.type = 'number';
        currentInput.id = currentId;
        if (key === 'TempHP' || !allowNegativeHealth) {
          currentInput.min = '0';
        }
        currentLabel.appendChild(currentInput);
        addCurrentStats.appendChild(currentLabel);
        const entry = statInputs.get(key) || {};
        entry.currentInput = currentInput;
        statInputs.set(key, entry);
      }
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
    conditionsPanel.classList.toggle('conditions-panel-open', open);
    conditionsPanel.classList.toggle('conditions-panel-collapsed', !open);
    conditionsToggle.setAttribute('aria-expanded', open.toString());
    conditionsPanel.setAttribute('aria-hidden', (!open).toString());
  }

  function setDetailsPanelOpen(open) {
    if (!detailsToggle || !detailsPanel) return;
    if (open && conditionsToggle && conditionsPanel) {
      setConditionsPanelOpen(false);
    }
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

      if (editorStatsFields && !isTempHp) {
        const label = document.createElement('label');
        label.textContent = `Max ${key}`;
        const input = document.createElement('input');
        input.type = 'number';
        input.id = maxId;
        input.min = '0';
        input.addEventListener('input', () => {
          scheduleEditorSave();
        });
        label.appendChild(input);
        editorStatsFields.appendChild(label);
        editorStatInputs.set(key, { maxInput: input, currentInput: null });
      }

      if (editorCurrentStats) {
        const label = document.createElement('label');
        label.textContent = `Current ${key}`;
        const input = document.createElement('input');
        input.type = 'number';
        input.id = currentId;
        if (key === 'TempHP' || !allowNegativeHealth) {
          input.min = '0';
        }
        input.addEventListener('input', () => {
          scheduleEditorSave();
        });
        label.appendChild(input);
        editorCurrentStats.appendChild(label);
        const entry = editorStatInputs.get(key) || {};
        entry.currentInput = input;
        editorStatInputs.set(key, entry);
      }
    });
  }

  function healthStatusLabel(ratio, isDead) {
    if (isDead) {
      return 'Dead';
    }
    if (ratio === 1) {
      return 'Full';
    } else if (ratio > 0.75) {
      return 'Slight Damage';
    } else if (ratio > 0.5) {
      return 'Some Damage';
    } else if (ratio > 0.25) {
      return 'Bloodied';
    }
    return 'Heavily Blooded';
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
      updateRulesetLink(campaign.rulesetLabel || '', null);
      if (currentCampaignName) {
        document.title = `${currentCampaignName} - Referee`;
      } else {
        document.title = 'Turn Track';
      }
    } catch (err) {
      console.error('Failed to load campaign:', err);
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
        statKeys = ['TempHP', ...statKeys];
      }
      allowNegativeHealth = Boolean(json?.allowNegativeHealth);
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
      const normalized = (json?.conditions ?? [])
        .map((entry) => {
          if (!entry || typeof entry.name !== 'string') return null;
          const trimmedName = entry.name.trim();
          if (!trimmedName) return null;
          const abbreviation =
            (typeof entry.abbreviation === 'string' && entry.abbreviation.trim()) ||
            computeAbbreviationFromName(trimmedName);
          const explicitLink =
            typeof entry.description === 'string' && entry.description.trim()
              ? entry.description.trim()
              : null;
          const fallbackLink = baseUrl ? `${baseUrl}#TOC-${trimmedName}` : null;
          return {
            name: trimmedName,
            abbreviation,
            link: explicitLink || fallbackLink
          };
        })
        .filter(Boolean);
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
    if (roundInfo) {
      roundInfo.textContent = `Round ${state.round || 1}`;
    }
    renderTurnTable(players, state.currentTurnId);
    renderCharacterList(players, state.currentTurnId);
    if (selectedCharacterId) {
      const updated = currentPlayers.find((p) => p.id === selectedCharacterId);
      if (updated) {
        setSelectedCharacter(updated);
      }
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
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 5;
      td.textContent = '(no players yet)';
      tr.appendChild(td);
      playersBody.appendChild(tr);
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
      initTd.textContent = p.initiative ?? '';

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
      const orderedStats = statKeys
        .map((key) => stats.find((stat) => stat.key === key))
        .filter(Boolean);
      const statusInfo = (() => {
        const source = (orderedStats.length > 0 ? orderedStats : stats)
          .filter((stat) => stat.key !== 'TempHP');
        if (source.length === 0) return null;
        const totals = source.reduce(
          (acc, stat) => {
            if (Number.isFinite(stat.current)) acc.current += stat.current;
            if (Number.isFinite(stat.max)) acc.max += stat.max;
            return acc;
          },
          { current: 0, max: 0 }
        );
        if (totals.max <= 0) return null;
        return {
          ratio: totals.current / totals.max,
          isDead: totals.current <= 0
        };
      })();
      if (statusInfo) {
        hpTd.classList.add('hp-cell');
        if (statusInfo.isDead) {
          hpTd.classList.add('hp-dead');
        } else if (statusInfo.ratio === 1) {
          hpTd.classList.add('hp-blue');
        } else if (statusInfo.ratio > 0.75) {
          hpTd.classList.add('hp-green');
        } else if (statusInfo.ratio > 0.5) {
          hpTd.classList.add('hp-yellow');
        } else if (statusInfo.ratio > 0.25) {
          hpTd.classList.add('hp-orange');
        } else {
          hpTd.classList.add('hp-red');
        }
        const valueLine = document.createElement('div');
        const displayStats = orderedStats.length > 0 ? orderedStats : stats;
        const visibleStats = displayStats.filter(
          (stat) => stat.key !== 'TempHP' || Number(stat.current) > 0
        );
        valueLine.textContent = (visibleStats.length > 0 ? visibleStats : displayStats)
          .map((stat) =>
            stat.key === 'TempHP'
              ? `${stat.key} ${stat.current}`
              : `${stat.key} ${stat.current}/${stat.max}`
          )
          .join(' • ');
        hpTd.appendChild(valueLine);
      } else {
        hpTd.textContent = '—';
      }

      const conditionsTd = document.createElement('td');
      conditionsTd.classList.add('conditions-cell');
      if (Array.isArray(p.conditions) && p.conditions.length > 0) {
        const list = document.createElement('div');
        list.classList.add('player-conditions');
        p.conditions.forEach((conditionName) => {
          const entry = conditionLookup.get(conditionName);
          const badge = document.createElement(entry && entry.link ? 'a' : 'span');
          badge.classList.add('condition-badge');
          badge.textContent = entry?.abbreviation || computeAbbreviationFromName(conditionName);
          badge.title = conditionName;
          if (entry && entry.link) {
            badge.href = entry.link;
            badge.target = '_blank';
            badge.rel = 'noopener';
          }
          list.appendChild(badge);
        });
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
      meta.textContent = `Init ${player.initiative} • ${statusLabel}`;
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
      const actions = document.createElement('div');
      actions.className = 'character-actions';
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'icon-button danger character-remove';
      removeBtn.textContent = '✕';
      removeBtn.setAttribute('aria-label', `Remove ${player.name}`);
      removeBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        const confirmDelete = confirm(`Remove ${player.name} from the tracker?`);
        if (!confirmDelete) return;
        deleteCharacter(player.id);
      });
      actions.appendChild(removeBtn);
      row.appendChild(actions);
      item.appendChild(row);

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
    if (editorEmpty) editorEmpty.classList.add('hidden');
    if (editorForm) editorForm.classList.remove('hidden');
    if (editorNameInput) editorNameInput.value = player.name || '';
    if (editorInitiativeInput) editorInitiativeInput.value = player.initiative ?? '';
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
    renderCharacterList(currentPlayers, currentTurnId);
  }

  function scheduleEditorSave() {
    if (!selectedCharacterId) return;
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
      saveEditorCharacter();
    }, AUTO_SAVE_DELAY_MS);
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
    if (deleteBtn) {
      deleteBtn.disabled = !player;
    }
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
        scheduleEditorSave();
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

  async function saveEditorCharacter() {
    if (!selectedCharacterId) return;
    const name = editorNameInput ? editorNameInput.value.trim() : '';
    const initiativeStr = editorInitiativeInput ? editorInitiativeInput.value.trim() : '';
    if (!name || initiativeStr === '') {
      if (statusDiv) statusDiv.textContent = 'Character and initiative are required.';
      return;
    }
    const initiative = Number(initiativeStr);
    if (!Number.isFinite(initiative)) {
      if (statusDiv) statusDiv.textContent = 'Initiative must be a valid number.';
      return;
    }

    const statsPayload = [];
    for (const key of statKeys) {
      const entry = editorStatInputs.get(key);
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

    const current = currentPlayers.find((player) => player.id === selectedCharacterId);
    const payload = {
      id: selectedCharacterId,
      ownerName: current?.ownerName || 'Referee',
      name,
      initiative,
      stats: statsPayload,
      revealStats: current?.revealStats ?? false,
      isHidden: current?.isHidden,
      revealOnTurn: current?.revealOnTurn,
      conditions: Array.from(selectedConditions)
    };
    if (currentCampaignName) {
      payload.campaignName = currentCampaignName;
    }

    try {
      const res = await fetch('/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Server returned ' + res.status);
      if (statusDiv) statusDiv.textContent = 'Character updated.';
      await loadState();
    } catch (err) {
      if (statusDiv) statusDiv.textContent = `Failed to update character: ${err.message}`;
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
    const initiativeStr = initiativeInput.value.trim();
    if (!name || initiativeStr === '') {
      if (statusDiv) statusDiv.textContent = 'Character and initiative are required.';
      return;
    }
    const quantity = Math.max(1, Number(quantityStr));
    if (!Number.isFinite(quantity) || quantity <= 0) {
      if (statusDiv) statusDiv.textContent = 'Quantity must be at least 1.';
      return;
    }
    const initiative = Number(initiativeStr);
    if (!Number.isFinite(initiative)) {
      if (statusDiv) statusDiv.textContent = 'Initiative must be a valid number.';
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
          initiative,
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
    form.classList.remove('details-panel-collapsed');
    form.classList.add('details-panel-open');
    form.setAttribute('aria-hidden', 'false');
  }

  function hideAddForm() {
    if (!form) return;
    clearAddForm();
    form.classList.add('details-panel-collapsed');
    form.classList.remove('details-panel-open');
    form.setAttribute('aria-hidden', 'true');
  }

  function clearAddForm() {
    if (nameInput) nameInput.value = '';
    if (quantityInput) quantityInput.value = '1';
    if (initiativeInput) initiativeInput.value = '0';
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
      selectedCharacterId = null;
      if (editorForm) editorForm.classList.add('hidden');
      if (editorEmpty) editorEmpty.classList.remove('hidden');
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
      scheduleEditorSave();
    });
  }
  if (editorInitiativeInput) {
    editorInitiativeInput.addEventListener('input', () => {
      scheduleEditorSave();
    });
  }
  if (detailsToggle && detailsPanel) {
    detailsToggle.addEventListener('click', () => {
      const isOpen = detailsPanel.classList.contains('details-panel-open');
      setDetailsPanelOpen(!isOpen);
    });
  }
  if (conditionsToggle && conditionsPanel) {
    conditionsToggle.addEventListener('click', () => {
      const isOpen = conditionsPanel.classList.contains('conditions-panel-open');
      setConditionsPanelOpen(!isOpen);
    });
  }
  if (addButton) {
    addButton.addEventListener('click', () => {
      showAddForm();
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

  init();
});
