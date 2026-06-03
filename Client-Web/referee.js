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
  const campaignSettingsModal = document.getElementById('ref-campaign-settings-modal');
  const campaignSettingsModalSummary = document.getElementById('ref-campaign-settings-modal-summary');
  const campaignSettingsModalStatus = document.getElementById('ref-campaign-settings-modal-status');
  const campaignSettingsTitle = document.getElementById('ref-campaign-settings-dialog-title');
  const campaignSettingsCancelBtn = document.getElementById('ref-campaign-settings-cancel');
  const campaignSettingsSaveBtn = document.getElementById('ref-campaign-settings-save');
  const campaignNameInput = document.getElementById('ref-campaign-name-input');
  const campaignRulesetSelect = document.getElementById('ref-ruleset-select');
  const campaignClaimTimeoutManualInput = document.getElementById('ref-campaign-claim-timeout-manual');
  const campaignClaimTimeoutTimedInput = document.getElementById('ref-campaign-claim-timeout-timed');
  const campaignClaimTimeoutInput = document.getElementById('ref-campaign-claim-timeout-input');
  const campaignInviteOnlyInput = document.getElementById('ref-campaign-invite-only');
  const partyTreasureButton = document.getElementById('ref-party-treasure-button');
  const partyTreasurePanel = document.getElementById('ref-party-treasure-panel');
  const partyTreasureFields = document.getElementById('ref-party-treasure-fields');
  const partyTreasureSaveBtn = document.getElementById('ref-party-treasure-save');
  const partyTreasureCancelBtn = document.getElementById('ref-party-treasure-cancel');
  const partyTreasureAddBtn = document.getElementById('ref-party-treasure-add');
  const partyTreasureRemoveBtn = document.getElementById('ref-party-treasure-remove');
  const partyTreasureDialogTitle = document.getElementById('ref-party-treasure-dialog-title');
  const partyTreasureContext = document.getElementById('ref-party-treasure-context');
  const partyTreasureAddForm = document.getElementById('ref-party-treasure-add-form');
  const partyTreasureAddFormName = document.getElementById('ref-party-treasure-add-name');
  const partyTreasureAddFormQuantity = document.getElementById('ref-party-treasure-add-quantity');
  const partyTreasureAddFormValue = document.getElementById('ref-party-treasure-add-value');
  const partyTreasureAddFormWeight = document.getElementById('ref-party-treasure-add-weight');
  const partyTreasureAddFormUrl = document.getElementById('ref-party-treasure-add-url');
  const partyTreasureAddFormSaveBtn = document.getElementById('ref-party-treasure-add-form-save');
  const partyTreasureAddFormCancelBtn = document.getElementById('ref-party-treasure-add-form-cancel');
  const partyTreasureItemOptions = document.getElementById('ref-party-treasure-item-options');

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
  const libraryImportButton = document.getElementById('ref-campaign-library-import');
  const libraryImportInput = document.getElementById('ref-campaign-library-import-input');
  const userdataSummary = document.getElementById('ref-campaign-userdata-summary');
  const userdataStatus = document.getElementById('ref-campaign-userdata-status');
  const userdataList = document.getElementById('ref-campaign-userdata-list');
  const userdataRefreshButton = document.getElementById('ref-campaign-userdata-refresh');
  const userdataSaveButton = document.getElementById('ref-campaign-userdata-save');
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
  const initiativeModal = document.getElementById('ref-initiative-modal');
  const initiativeModalTitle = document.getElementById('ref-initiative-dialog-title');
  const initiativeModalCharacter = document.getElementById('ref-initiative-character');
  const initiativeModalInput = document.getElementById('ref-initiative-edit-input');
  const initiativeModalCancelBtn = document.getElementById('ref-initiative-cancel');
  const initiativeModalSaveBtn = document.getElementById('ref-initiative-save');
  const revealNowBtn = document.getElementById('ref-reveal-now');
  const revealTurnBtn = document.getElementById('ref-reveal-turn');
  const hideBtn = document.getElementById('ref-hide-character');
  const overflowToggle = document.getElementById('ref-overflow-toggle');
  const overflowMenu = document.getElementById('ref-overflow-menu');
  const openReferenceBtn = document.getElementById('ref-open-reference');
  const claimCharacterBtn = document.getElementById('ref-claim-character');
  const releaseCharacterBtn = document.getElementById('ref-release-character');
  const deleteCharacterBtn = document.getElementById('ref-delete-character');

  let currentCampaignName = '';
  let currentRulesetId = '';
  let currentCampaignClaimTimeoutMinutes = 5;
  let currentCampaignInviteOnly = false;
  let currentPartyTreasure = [];
  let availableRulesets = [];
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
  let expandedOrderStatsCharacterId = null;
  let initiativeEditorCharacterId = null;
  let currentTurnId = null;
  let encounterState = 'new';
  let skipRefresh = false;
  let activeCampaignId = null;
  let loadStateInFlight = false;
  let loadStateRefreshQueued = false;
  let allowNegativeHealth = false;
  let supportsTempHp = false;
  let currentStandardDie = null;
  let detailsDirty = false;
  let conditionsDirty = false;
  let partyTreasureEditorDirty = false;
  let partyTreasureSelectedRow = null;
  let equipmentLibraryItems = [];
  let equipmentLibraryLoaded = false;
  let equipmentLibraryLoading = false;
  const narrowPopupQuery = typeof window.matchMedia === 'function'
    ? window.matchMedia('(max-width: 760px)')
    : null;
  const partyTreasureHelpers = window.PlayerTrackerPartyTreasure || {
    createInventoryEntryId: () => {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
      }
      const bytes = new Uint8Array(16);
      if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        crypto.getRandomValues(bytes);
      } else {
        for (let index = 0; index < bytes.length; index += 1) {
          bytes[index] = Math.floor(Math.random() * 256);
        }
      }
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'));
      return [
        hex.slice(0, 4).join(''),
        hex.slice(4, 6).join(''),
        hex.slice(6, 8).join(''),
        hex.slice(8, 10).join(''),
        hex.slice(10, 16).join('')
      ].join('-');
    },
    normalizeInventoryEntry: (entry = {}, containerId = null, isContainer = false) => ({
      id: typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : `inventory-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
      name: typeof entry.name === 'string' ? entry.name : '',
      quantity: Number.isFinite(entry.quantity) ? entry.quantity : 1,
      value: Number.isFinite(entry.value) ? entry.value : 0,
      weight: Number.isFinite(entry.weight) ? entry.weight : 0,
      url: typeof entry.url === 'string' && entry.url.trim() ? entry.url.trim() : null,
      containerId: typeof entry.containerId === 'string' && entry.containerId.trim() ? entry.containerId.trim() : containerId,
      isContainer: typeof entry.isContainer === 'boolean' ? entry.isContainer : isContainer
    }),
    normalizeEquipmentItems: (items) =>
      Array.isArray(items)
        ? items.map((item) => ({
            id: typeof item?.id === 'string' && item.id.trim()
              ? item.id.trim()
              : (typeof item?.name === 'string'
                  ? item.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
                  : ''),
            name: typeof item?.name === 'string' ? item.name.trim() : '',
            value: Number.isFinite(item?.value) ? item.value : null,
            weight: Number.isFinite(item?.weight) ? item.weight : null,
            url: typeof item?.url === 'string' && item.url.trim() ? item.url.trim() : null,
            source: typeof item?.source === 'string' && item.source.trim() ? item.source.trim() : null
          })).filter((item) => Boolean(item.name))
        : [],
    getInventoryRowData: (row) => {
      if (!row) return null;
      return {
        id: typeof row.dataset.inventoryEntryId === 'string' ? row.dataset.inventoryEntryId : '',
        containerId: typeof row.dataset.inventoryContainerId === 'string' && row.dataset.inventoryContainerId.trim()
          ? row.dataset.inventoryContainerId.trim()
          : null,
        isContainer: row.dataset.inventoryIsContainer === 'true'
      };
    },
    focusInventoryRow: (row) => {
      if (!row) return;
      window.requestAnimationFrame(() => {
        const firstInput = row.querySelector('input');
        if (firstInput) {
          firstInput.focus();
          firstInput.select?.();
        }
      });
    },
    updateEquipmentItemOptions: (datalistEl, equipmentLibraryItems = []) => {
      if (!datalistEl) return;
      datalistEl.innerHTML = '';
      equipmentLibraryItems.forEach((item) => {
        const option = document.createElement('option');
        option.value = item.name;
        option.label = item.source ? `${item.name} - ${item.source}` : item.name;
        datalistEl.appendChild(option);
      });
    },
    applyPartyTreasurePresetToRow: (row, itemName, equipmentLibraryItems = []) => {
      if (!row || !itemName) return;
      const preset = equipmentLibraryItems.find(
        (item) => (item.name || '').trim().toLowerCase() === itemName.trim().toLowerCase()
      );
      if (!preset) return;
      const valueInput = row.querySelector('input[data-inventory-field="value"]');
      const weightInput = row.querySelector('input[data-inventory-field="weight"]');
      if (valueInput && Number.isFinite(preset.value)) {
        valueInput.value = String(preset.value);
      }
      if (weightInput && Number.isFinite(preset.weight)) {
        weightInput.value = String(preset.weight);
      }
      const urlInput = row.querySelector('input[data-inventory-field="url"]');
      if (urlInput && typeof preset.url === 'string' && preset.url.trim()) {
        urlInput.value = preset.url.trim();
      }
    },
    getPartyTreasureRows: (fieldsEl) => (fieldsEl ? Array.from(fieldsEl.querySelectorAll('tr.inventory-entry')) : []),
    createPartyTreasureRow: (options = {}) => {
      const {
        entry = {},
        itemOptionsId = 'ref-party-treasure-item-options',
        onDirty = null,
        onSelect = null,
        applyPreset = null,
        displayMode = false
      } = options;
      const normalized = (window.PlayerTrackerPartyTreasure?.normalizeInventoryEntry || partyTreasureHelpers.normalizeInventoryEntry)(entry, null, false);
      const row = document.createElement('tr');
      row.className = 'inventory-entry';
      if (displayMode) {
        row.classList.add('inventory-entry-display');
      }
      row.dataset.inventoryEntryId = normalized.id;
      row.dataset.inventoryContainerId = '';
      row.dataset.inventoryIsContainer = 'false';
      row.addEventListener('click', () => {
        if (typeof onSelect === 'function') onSelect(row);
      });
      const fields = [
        { key: 'name', type: 'text', value: normalized.name, placeholder: 'Item name', list: itemOptionsId },
        { key: 'quantity', type: 'number', value: String(normalized.quantity), step: '1' },
        { key: 'value', type: 'number', value: String(normalized.value), step: 'any' },
        { key: 'weight', type: 'number', value: String(normalized.weight), step: 'any' },
        { key: 'url', type: 'url', value: normalized.url || '' }
      ];
      fields.forEach((field) => {
        const cell = document.createElement('td');
        const input = document.createElement('input');
        input.type = displayMode ? 'hidden' : field.type;
        input.value = field.value;
        if (field.placeholder && !displayMode) input.placeholder = field.placeholder;
        if (field.list && !displayMode) input.setAttribute('list', field.list);
        if (field.step && !displayMode) input.step = field.step;
        input.dataset.inventoryField = field.key;
        if (displayMode) {
          const display = document.createElement(field.key === 'url' ? 'a' : 'div');
          display.className = `inventory-display-value inventory-display-${field.key}`;
          if (field.key === 'url') {
            if (field.value) {
              display.href = field.value;
              display.target = '_blank';
              display.rel = 'noopener';
              display.textContent = 'Open';
            } else {
              display.textContent = '—';
            }
          } else {
            display.textContent = field.key === 'name'
              ? (field.value || '—')
              : (field.value || (field.key === 'quantity' ? '1' : '0'));
          }
          cell.appendChild(display);
          cell.appendChild(input);
        } else {
          input.addEventListener('input', () => {
            if (typeof onDirty === 'function') onDirty();
            if (field.key === 'name' && typeof applyPreset === 'function') {
              applyPreset(row, input.value);
            }
          });
          input.addEventListener('change', () => {
            if (field.key === 'name' && typeof applyPreset === 'function') {
              applyPreset(row, input.value);
            }
          });
          input.addEventListener('focus', () => {
            if (typeof onSelect === 'function') onSelect(row);
          });
          cell.appendChild(input);
        }
        row.appendChild(cell);
      });
      return row;
    },
    buildPartyTreasureFields: (fieldsEl, items = [], options = {}) => {
      if (!fieldsEl) return null;
      const {
        itemOptionsId = 'ref-party-treasure-item-options',
        onDirty = null,
        onSelect = null,
        applyPreset = null,
        displayMode = false
      } = options;
      fieldsEl.innerHTML = '';
      const normalizedEntries = Array.isArray(items)
        ? items.map((entry) => (window.PlayerTrackerPartyTreasure?.normalizeInventoryEntry || partyTreasureHelpers.normalizeInventoryEntry)(entry))
        : [];
      const rows = normalizedEntries.length > 0
        ? normalizedEntries
        : (displayMode ? [] : [(window.PlayerTrackerPartyTreasure?.normalizeInventoryEntry || partyTreasureHelpers.normalizeInventoryEntry)({}, null, false)]);
      rows.forEach((entry) => {
        fieldsEl.appendChild((window.PlayerTrackerPartyTreasure?.createPartyTreasureRow || partyTreasureHelpers.createPartyTreasureRow)({
          entry,
          itemOptionsId,
          onDirty,
          onSelect,
          applyPreset,
          displayMode
        }));
      });
      const firstRow = fieldsEl.querySelector('tr.inventory-entry');
      if (typeof onSelect === 'function') {
        onSelect(firstRow);
      }
      return firstRow;
    },
    collectPartyTreasurePayloadFromEditor: (fieldsEl) => {
      if (!fieldsEl) return null;
      const payload = [];
      const rows = Array.from(fieldsEl.querySelectorAll('tr.inventory-entry'));
      for (const row of rows) {
        const rowData = (window.PlayerTrackerPartyTreasure?.getInventoryRowData || partyTreasureHelpers.getInventoryRowData)(row) || {};
        const nameInput = row.querySelector('input[data-inventory-field="name"]');
        const quantityInput = row.querySelector('input[data-inventory-field="quantity"]');
        const valueInput = row.querySelector('input[data-inventory-field="value"]');
        const weightInput = row.querySelector('input[data-inventory-field="weight"]');
        const urlInput = row.querySelector('input[data-inventory-field="url"]');
        const rawName = nameInput ? nameInput.value.trim() : '';
        const rawQuantity = quantityInput ? quantityInput.value.trim() : '';
        const rawValue = valueInput ? valueInput.value.trim() : '';
        const rawWeight = weightInput ? weightInput.value.trim() : '';
        const rawUrl = urlInput ? urlInput.value.trim() : '';
        const isUntouchedDefaultRow =
          !rawName &&
          (rawQuantity === '' || rawQuantity === '1') &&
          (rawValue === '' || rawValue === '0') &&
          (rawWeight === '' || rawWeight === '0') &&
          !rawUrl;
        if (isUntouchedDefaultRow) {
          continue;
        }
        if (!rawName) {
          throw new Error('Each party treasure row needs an item name.');
        }
        const quantity = rawQuantity === '' ? 1 : Number(rawQuantity);
        const value = rawValue === '' ? 0 : Number(rawValue);
        const weight = rawWeight === '' ? 0 : Number(rawWeight);
        if (!Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity < 1) {
          throw new Error(`Quantity for ${rawName} must be a whole number of at least 1.`);
        }
        if (!Number.isFinite(value)) {
          throw new Error(`Value for ${rawName} must be a valid number.`);
        }
        if (!Number.isFinite(weight)) {
          throw new Error(`Weight for ${rawName} must be a valid number.`);
        }
        payload.push({
          id: rowData.id || (window.PlayerTrackerPartyTreasure?.createInventoryEntryId || partyTreasureHelpers.createInventoryEntryId)(),
          name: rawName,
          quantity,
          value,
          weight,
          url: rawUrl || null,
          containerId: null,
          isContainer: false
        });
      }
      return payload.length > 0 ? payload : null;
    }
  };
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
  if (campaignSettingsBtn) {
    campaignSettingsBtn.addEventListener('click', () => {
      openCampaignSettingsModal();
    });
  }
  if (partyTreasureButton) {
    partyTreasureButton.addEventListener('click', () => {
      void openPartyTreasureEditor();
    });
  }
  if (campaignSettingsCancelBtn) {
    campaignSettingsCancelBtn.addEventListener('click', () => {
      closeCampaignSettingsModal();
    });
  }
  if (campaignSettingsSaveBtn) {
    campaignSettingsSaveBtn.addEventListener('click', () => {
      void saveCampaignSettings();
    });
  }
  if (campaignSettingsModal) {
    campaignSettingsModal.addEventListener('click', (event) => {
      if (event.target !== campaignSettingsModal) return;
      closeCampaignSettingsModal();
    });
  }
  if (campaignNameInput) {
    campaignNameInput.addEventListener('input', () => validateCampaignSettingsModal());
  }
  if (campaignRulesetSelect) {
    campaignRulesetSelect.addEventListener('change', () => validateCampaignSettingsModal());
  }
  if (campaignClaimTimeoutManualInput) {
    campaignClaimTimeoutManualInput.addEventListener('change', () => {
      syncCampaignClaimTimeoutUi();
      validateCampaignSettingsModal();
    });
  }
  if (campaignClaimTimeoutTimedInput) {
    campaignClaimTimeoutTimedInput.addEventListener('change', () => {
      syncCampaignClaimTimeoutUi();
      validateCampaignSettingsModal();
    });
  }
  if (campaignClaimTimeoutInput) {
    campaignClaimTimeoutInput.addEventListener('input', () => validateCampaignSettingsModal());
  }
  if (campaignInviteOnlyInput) {
    campaignInviteOnlyInput.addEventListener('change', () => validateCampaignSettingsModal());
  }
  if (partyTreasureAddBtn) {
    partyTreasureAddBtn.addEventListener('click', () => {
      addPartyTreasureItem();
    });
  }

  if (partyTreasureAddFormSaveBtn) {
    partyTreasureAddFormSaveBtn.addEventListener('click', () => {
      commitPartyTreasureAddFormItem();
    });
  }

  if (partyTreasureAddFormCancelBtn) {
    partyTreasureAddFormCancelBtn.addEventListener('click', () => {
      setPartyTreasureAddFormOpen(false);
    });
  }
  if (partyTreasureRemoveBtn) {
    partyTreasureRemoveBtn.addEventListener('click', () => {
      removeSelectedPartyTreasureItem();
    });
  }
  if (partyTreasureSaveBtn) {
    partyTreasureSaveBtn.addEventListener('click', async () => {
      try {
        await savePartyTreasureFromEditor();
        closePartyTreasureEditor();
      } catch (err) {
        if (statusDiv) {
          statusDiv.textContent = `Party treasure save failed: ${err instanceof Error ? err.message : String(err)}`;
        }
      }
    });
  }
  if (partyTreasureCancelBtn) {
    partyTreasureCancelBtn.addEventListener('click', () => {
      if (partyTreasureEditorDirty && !confirm('Discard party treasure changes?')) return;
      closePartyTreasureEditor();
    });
  }
  if (partyTreasurePanel) {
    partyTreasurePanel.addEventListener('click', (event) => {
      if (event.target !== partyTreasurePanel) return;
      if (partyTreasureEditorDirty && !confirm('Discard party treasure changes?')) return;
      closePartyTreasureEditor();
    });
  }
  updateInvitePlayerButtonState();
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
  function setCampaignSummary(campaign) {
    if (!campaignSettingsModalSummary) return;
    if (!campaign) {
      campaignSettingsModalSummary.textContent = 'No active campaign selected.';
      return;
    }
    const claimTimeoutLabel = campaign.claimTimeoutMinutes < 0
      ? 'explicit release only'
      : campaign.claimTimeoutMinutes === 0
        ? 'release immediately on disconnect'
        : `${campaign.claimTimeoutMinutes}m claim timeout`;
    const inviteLabel = campaign.isInviteOnly ? 'invite only' : 'open join';
    campaignSettingsModalSummary.textContent = `${campaign.name} · ${campaign.rulesetLabel || campaign.rulesetId || 'No Conditions'} · ${claimTimeoutLabel} · ${inviteLabel}`;
  }

  function setCampaignSettingsModalStatus(text = '', isError = false) {
    if (!campaignSettingsModalStatus) return;
    campaignSettingsModalStatus.textContent = text;
    campaignSettingsModalStatus.style.color = isError ? '#b00020' : '';
  }

  function populateCampaignRulesetSelect() {
    if (!campaignRulesetSelect) return;
    campaignRulesetSelect.innerHTML = '';
    if (availableRulesets.length === 0) {
      const option = document.createElement('option');
      option.value = currentRulesetId || 'none';
      option.textContent = currentRulesetId || 'No Conditions';
      campaignRulesetSelect.appendChild(option);
      return;
    }
    availableRulesets.forEach((ruleset) => {
      const option = document.createElement('option');
      option.value = ruleset.id;
      option.textContent = ruleset.label || ruleset.id;
      campaignRulesetSelect.appendChild(option);
    });
  }

  async function loadAvailableRulesets() {
    if (!campaignRulesetSelect) return;
    try {
      const res = await fetch('/rulesets');
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }
      const json = await res.json();
      availableRulesets = Array.isArray(json) ? json : [];
      populateCampaignRulesetSelect();
      if (currentRulesetId) {
        campaignRulesetSelect.value = currentRulesetId;
      }
    } catch (err) {
      availableRulesets = [];
      populateCampaignRulesetSelect();
      console.warn('Unable to load ruleset list:', err);
    }
  }

  async function recoverActiveCampaignIfNeeded() {
    try {
      const res = await fetch('/campaigns');
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }
      const campaigns = await res.json();
      if (!Array.isArray(campaigns) || campaigns.length === 0) {
        return false;
      }
      const selectedCampaign = campaigns.find((campaign) => Boolean(campaign?.isActive)) || (campaigns.length === 1 ? campaigns[0] : null);
      if (!selectedCampaign?.id) {
        return false;
      }
      const selectRes = await fetch(`/campaigns/${encodeURIComponent(selectedCampaign.id)}/select`, {
        method: 'POST'
      });
      if (!selectRes.ok) {
        throw new Error(`Server returned ${selectRes.status}`);
      }
      return true;
    } catch (err) {
      console.warn('Unable to recover active campaign selection:', err);
      return false;
    }
  }

  function isCampaignSettingsModalOpen() {
    return Boolean(campaignSettingsModal && !campaignSettingsModal.classList.contains('hidden'));
  }

  function normalizeClaimTimeoutMinutes(value) {
    const parsed = Number.parseInt(String(value || '').trim(), 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return null;
    }
    return parsed;
  }

  function getCampaignClaimTimeoutMode() {
    if (campaignClaimTimeoutManualInput?.checked) {
      return 'manual';
    }
    return 'timed';
  }

  function getCampaignClaimTimeoutMinutes() {
    return getCampaignClaimTimeoutMode() === 'manual'
      ? -1
      : normalizeClaimTimeoutMinutes(campaignClaimTimeoutInput?.value);
  }

  function syncCampaignClaimTimeoutUi() {
    const manual = getCampaignClaimTimeoutMode() === 'manual';
    if (campaignClaimTimeoutInput) {
      campaignClaimTimeoutInput.disabled = manual;
      campaignClaimTimeoutInput.classList.toggle('hidden', manual);
    }
  }

  function populateCampaignSettingsForm() {
    populateCampaignRulesetSelect();
    if (campaignNameInput) {
      campaignNameInput.value = currentCampaignName;
    }
    if (campaignRulesetSelect) {
      campaignRulesetSelect.value = currentRulesetId || campaignRulesetSelect.value || 'none';
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
          : 5
      );
    }
    if (campaignInviteOnlyInput) {
      campaignInviteOnlyInput.checked = currentCampaignInviteOnly;
    }
    syncCampaignClaimTimeoutUi();
    setCampaignSettingsModalStatus('');
  }

  function campaignSettingsHaveChanges() {
    const name = (campaignNameInput?.value || '').trim();
    const rulesetId = campaignRulesetSelect?.value || '';
    const claimTimeoutMinutes = getCampaignClaimTimeoutMinutes();
    const inviteOnly = Boolean(campaignInviteOnlyInput?.checked);
    return (
      name !== currentCampaignName ||
      rulesetId !== currentRulesetId ||
      claimTimeoutMinutes !== currentCampaignClaimTimeoutMinutes ||
      inviteOnly !== currentCampaignInviteOnly
    );
  }

  function campaignSettingsAreValid() {
    const name = (campaignNameInput?.value || '').trim();
    const rulesetId = campaignRulesetSelect?.value || '';
    if (!name || !rulesetId || rulesetId === 'none') return false;
    if (getCampaignClaimTimeoutMode() !== 'manual' && getCampaignClaimTimeoutMinutes() === null) return false;
    return true;
  }

  function validateCampaignSettingsModal() {
    if (!campaignSettingsSaveBtn) return;
    const valid = campaignSettingsAreValid();
    const changed = campaignSettingsHaveChanges();
    campaignSettingsSaveBtn.disabled = !(valid && changed && Boolean(activeCampaignId));
  }

  function openCampaignSettingsModal() {
    if (!campaignSettingsModal || !activeCampaignId) {
      return;
    }
    populateCampaignSettingsForm();
    renderCampaignUserDataFiles();
    updateCampaignUserDataSummary();
    updateCampaignUserDataSaveState();
    campaignSettingsModal.classList.remove('hidden');
    campaignSettingsModal.setAttribute('aria-hidden', 'false');
    validateCampaignSettingsModal();
    campaignNameInput?.focus();
  }

  function closeCampaignSettingsModal() {
    if (!campaignSettingsModal) return;
    campaignSettingsModal.classList.add('hidden');
    campaignSettingsModal.setAttribute('aria-hidden', 'true');
    setCampaignSettingsModalStatus('');
  }

  async function saveCampaignSettings() {
    if (!activeCampaignId) {
      setCampaignSettingsModalStatus('No active campaign selected.', true);
      return;
    }
    if (!campaignSettingsAreValid()) {
      setCampaignSettingsModalStatus('Fix the campaign settings before saving.', true);
      validateCampaignSettingsModal();
      return;
    }

    const name = (campaignNameInput?.value || '').trim();
    const rulesetId = campaignRulesetSelect?.value || '';
    const claimTimeoutMode = getCampaignClaimTimeoutMode();
    const claimTimeoutMinutes = claimTimeoutMode === 'manual'
      ? -1
      : getCampaignClaimTimeoutMinutes();
    const inviteOnly = Boolean(campaignInviteOnlyInput?.checked);

    setCampaignSettingsModalStatus('Saving campaign settings...');
    try {
      const res = await fetch(`/campaigns/${encodeURIComponent(activeCampaignId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          rulesetId,
          claimTimeoutMinutes,
          isInviteOnly: inviteOnly
        })
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          window.location.replace('/index.html');
          return;
        }
        throw new Error('Server returned ' + res.status);
      }
      const updated = await res.json();
      currentCampaignName = updated.name || currentCampaignName;
      currentRulesetId = updated.rulesetId || currentRulesetId;
      currentCampaignClaimTimeoutMinutes = Number.isInteger(updated.claimTimeoutMinutes)
        ? updated.claimTimeoutMinutes
        : claimTimeoutMinutes;
      currentCampaignInviteOnly = Boolean(updated.isInviteOnly);
      await loadCampaign();
      await loadConditionLibrary();
      await loadCampaignUserData();
      await loadState();
      setCampaignSettingsModalStatus('Campaign settings saved.');
      validateCampaignSettingsModal();
    } catch (err) {
      setCampaignSettingsModalStatus(`Unable to save campaign settings: ${err.message}`, true);
    }
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
          currentCampaignClaimTimeoutMinutes = 5;
          currentCampaignInviteOnly = false;
          resetCampaignUserDataState();
          resetCreatureLibraryState();
          closeCampaignSettingsModal();
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
      currentCampaignClaimTimeoutMinutes = Number.isInteger(campaign.claimTimeoutMinutes)
        ? campaign.claimTimeoutMinutes
        : 5;
      currentCampaignInviteOnly = Boolean(campaign.isInviteOnly);
      currentPartyTreasure = Array.isArray(campaign.partyTreasure) ? campaign.partyTreasure : [];
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
          licenseUrl: null,
          iconUrl: null
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
      closeCampaignSettingsModal();
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

  function setPartyTreasurePanelOpen(open) {
    if (!partyTreasurePanel) return;
    partyTreasurePanel.classList.toggle('hidden', !open);
    partyTreasurePanel.setAttribute('aria-hidden', (!open).toString());
    partyTreasurePanel.classList.toggle('party-treasure-compact', open && isCompactPartyTreasureLayout());
    if (!open) {
      setPartyTreasureAddFormOpen(false);
    }
  }

  function updatePartyTreasureItemOptions() {
    partyTreasureHelpers.updateEquipmentItemOptions(partyTreasureItemOptions, equipmentLibraryItems);
  }

  function isCompactPartyTreasureLayout() {
    return window.matchMedia('(max-width: 760px)').matches;
  }

  function setPartyTreasureAddFormOpen(open) {
    if (!partyTreasureAddForm) return;
    partyTreasureAddForm.classList.toggle('hidden', !open);
    partyTreasureAddForm.setAttribute('aria-hidden', (!open).toString());
    if (!open) {
      if (partyTreasureAddFormName) partyTreasureAddFormName.value = '';
      if (partyTreasureAddFormQuantity) partyTreasureAddFormQuantity.value = '1';
      if (partyTreasureAddFormValue) partyTreasureAddFormValue.value = '0';
      if (partyTreasureAddFormWeight) partyTreasureAddFormWeight.value = '0';
      if (partyTreasureAddFormUrl) partyTreasureAddFormUrl.value = '';
    }
  }

  function collectPartyTreasureDraftFromForm() {
    const name = (partyTreasureAddFormName?.value || '').trim();
    const quantityRaw = (partyTreasureAddFormQuantity?.value || '').trim();
    const valueRaw = (partyTreasureAddFormValue?.value || '').trim();
    const weightRaw = (partyTreasureAddFormWeight?.value || '').trim();
    const url = (partyTreasureAddFormUrl?.value || '').trim();
    if (!name) {
      throw new Error('Item name is required.');
    }
    const quantity = quantityRaw === '' ? 1 : Number(quantityRaw);
    const value = valueRaw === '' ? 0 : Math.round(Number(valueRaw) * 100) / 100;
    const weight = weightRaw === '' ? 0 : Number(weightRaw);
    if (!Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity < 1) {
      throw new Error(`Quantity for ${name} must be a whole number of at least 1.`);
    }
    if (!Number.isFinite(value)) {
      throw new Error(`Value for ${name} must be a valid number.`);
    }
    if (!Number.isFinite(weight)) {
      throw new Error(`Weight for ${name} must be a valid number.`);
    }
    return {
      id: (window.PlayerTrackerPartyTreasure?.createInventoryEntryId || partyTreasureHelpers.createInventoryEntryId)(),
      name,
      quantity,
      value,
      weight,
      url: url || null,
      containerId: null,
      isContainer: false
    };
  }

  function getPartyTreasureRows() {
    return partyTreasureHelpers.getPartyTreasureRows(partyTreasureFields);
  }

  function setSelectedPartyTreasureRow(row) {
    partyTreasureSelectedRow = row;
    if (!partyTreasureFields) return;
    getPartyTreasureRows().forEach((entryRow) => {
      entryRow.classList.toggle('selected', entryRow === row);
      entryRow.setAttribute('aria-selected', (entryRow === row).toString());
    });
    if (partyTreasureRemoveBtn) {
      const canRemove = Boolean(partyTreasureSelectedRow);
      partyTreasureRemoveBtn.disabled = !canRemove;
      partyTreasureRemoveBtn.setAttribute('aria-disabled', (!canRemove).toString());
    }
  }

  function focusPartyTreasureRow(row) {
    partyTreasureHelpers.focusInventoryRow(row);
  }

  function buildPartyTreasureFields(items = []) {
    if (!partyTreasureFields) return;
    partyTreasureHelpers.buildPartyTreasureFields(partyTreasureFields, items, {
      itemOptionsId: 'ref-party-treasure-item-options',
      onDirty: () => {
        partyTreasureEditorDirty = true;
      },
      onSelect: (row) => {
        setSelectedPartyTreasureRow(row);
      },
      applyPreset: (row, itemName) => {
        partyTreasureHelpers.applyPartyTreasurePresetToRow(row, itemName, equipmentLibraryItems);
      },
      displayMode: isCompactPartyTreasureLayout()
    });
  }

  function collectPartyTreasurePayloadFromEditor() {
    return partyTreasureHelpers.collectPartyTreasurePayloadFromEditor(partyTreasureFields);
  }

  function addPartyTreasureItem() {
    if (isCompactPartyTreasureLayout()) {
      setPartyTreasureAddFormOpen(true);
      window.requestAnimationFrame(() => {
        partyTreasureAddFormName?.focus();
        partyTreasureAddFormName?.select?.();
      });
      return;
    }
    const row = partyTreasureHelpers.createPartyTreasureRow({
      itemOptionsId: 'ref-party-treasure-item-options',
      onDirty: () => {
        partyTreasureEditorDirty = true;
      },
      onSelect: (selectedRow) => {
        setSelectedPartyTreasureRow(selectedRow);
      },
      applyPreset: (selectedRow, itemName) => {
        partyTreasureHelpers.applyPartyTreasurePresetToRow(selectedRow, itemName, equipmentLibraryItems);
      }
    });
    if (partyTreasureFields) {
      partyTreasureFields.appendChild(row);
      partyTreasureEditorDirty = true;
      setSelectedPartyTreasureRow(row);
      focusPartyTreasureRow(row);
    }
  }

  function removeSelectedPartyTreasureItem() {
    if (!partyTreasureSelectedRow) return;
    const rowName = (partyTreasureSelectedRow.querySelector('input[data-inventory-field="name"]')?.value || '').trim() || 'Item';
    if (!confirm(`Remove ${rowName} from party treasure?`)) {
      return;
    }
    const nextRow = partyTreasureSelectedRow.nextElementSibling || partyTreasureSelectedRow.previousElementSibling;
    partyTreasureSelectedRow.remove();
    partyTreasureEditorDirty = true;
    if (!isCompactPartyTreasureLayout() && !partyTreasureFields.querySelector('tr.inventory-entry')) {
      partyTreasureFields.appendChild(partyTreasureHelpers.createPartyTreasureRow({
        itemOptionsId: 'ref-party-treasure-item-options',
        onDirty: () => {
          partyTreasureEditorDirty = true;
        },
        onSelect: (selectedRow) => {
          setSelectedPartyTreasureRow(selectedRow);
        },
        applyPreset: (selectedRow, itemName) => {
          partyTreasureHelpers.applyPartyTreasurePresetToRow(selectedRow, itemName, equipmentLibraryItems);
        }
      }));
    }
    setSelectedPartyTreasureRow(nextRow || partyTreasureFields.querySelector('tr.inventory-entry'));
  }

  function commitPartyTreasureAddFormItem() {
    if (!partyTreasureFields) return;
    let entry;
    try {
      entry = collectPartyTreasureDraftFromForm();
    } catch (err) {
      if (statusDiv) statusDiv.textContent = err instanceof Error ? err.message : String(err);
      return;
    }
    const row = partyTreasureHelpers.createPartyTreasureRow({
      entry,
      itemOptionsId: 'ref-party-treasure-item-options',
      onDirty: () => {
        partyTreasureEditorDirty = true;
      },
      onSelect: (selectedRow) => {
        setSelectedPartyTreasureRow(selectedRow);
      },
      applyPreset: (selectedRow, itemName) => {
        partyTreasureHelpers.applyPartyTreasurePresetToRow(selectedRow, itemName, equipmentLibraryItems);
      },
      displayMode: isCompactPartyTreasureLayout()
    });
    partyTreasureFields.appendChild(row);
    partyTreasureEditorDirty = true;
    setSelectedPartyTreasureRow(row);
    if (!isCompactPartyTreasureLayout()) {
      focusPartyTreasureRow(row);
    }
    setPartyTreasureAddFormOpen(false);
  }

  async function savePartyTreasureFromEditor() {
    if (!activeCampaignId) return null;
    let items;
    try {
      items = collectPartyTreasurePayloadFromEditor();
    } catch (err) {
      if (statusDiv) statusDiv.textContent = err instanceof Error ? err.message : String(err);
      return null;
    }
    if (!items) {
      items = [];
    }
    const res = await fetch('/campaign/party-treasure', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items })
    });
    if (!res.ok) {
      throw new Error(await responseErrorMessage(res));
    }
    const updatedCampaign = await res.json();
    currentPartyTreasure = Array.isArray(updatedCampaign?.partyTreasure)
      ? updatedCampaign.partyTreasure
      : items;
    partyTreasureEditorDirty = false;
    return updatedCampaign;
  }

  async function openPartyTreasureEditor() {
    if (!partyTreasureFields) return;
    if (partyTreasureEditorDirty && !confirm('Discard party treasure changes?')) return;
    partyTreasureEditorDirty = false;
    if (partyTreasureDialogTitle) {
      partyTreasureDialogTitle.textContent = 'Party Treasure';
    }
    if (partyTreasureContext) {
      partyTreasureContext.classList.add('hidden');
      partyTreasureContext.setAttribute('aria-hidden', 'true');
    }
    await loadEquipmentLibrary();
    setPartyTreasureAddFormOpen(false);
    buildPartyTreasureFields(currentPartyTreasure);
    setPartyTreasurePanelOpen(true);
    window.requestAnimationFrame(() => {
      if (isCompactPartyTreasureLayout()) {
        partyTreasureAddBtn?.focus();
        return;
      }
      const firstInput = partyTreasureFields.querySelector('input');
      if (firstInput) {
        firstInput.focus();
        firstInput.select();
      }
    });
  }

  function closePartyTreasureEditor() {
    partyTreasureEditorDirty = false;
    partyTreasureSelectedRow = null;
    if (partyTreasureDialogTitle) {
      partyTreasureDialogTitle.textContent = 'Party Treasure';
    }
    if (partyTreasureContext) {
      partyTreasureContext.classList.add('hidden');
      partyTreasureContext.setAttribute('aria-hidden', 'true');
    }
    if (partyTreasureFields) {
      partyTreasureFields.innerHTML = '';
    }
    setPartyTreasureAddFormOpen(false);
    if (partyTreasureRemoveBtn) {
      partyTreasureRemoveBtn.disabled = true;
      partyTreasureRemoveBtn.setAttribute('aria-disabled', 'true');
    }
    setPartyTreasurePanelOpen(false);
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

  function normalizeEquipmentItems(items) {
    return partyTreasureHelpers.normalizeEquipmentItems(items);
  }

  async function loadEquipmentLibrary() {
    if (equipmentLibraryLoading) {
      return equipmentLibraryItems;
    }
    if (equipmentLibraryLoaded) {
      return equipmentLibraryItems;
    }
    equipmentLibraryLoading = true;
    try {
      const response = await fetch('/equipment-library?limit=500');
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }
      const json = await response.json();
      equipmentLibraryItems = partyTreasureHelpers.normalizeEquipmentItems(json?.items);
      equipmentLibraryLoaded = true;
      updatePartyTreasureItemOptions();
      return equipmentLibraryItems;
    } catch (err) {
      console.error('Failed to load equipment library:', err);
      equipmentLibraryItems = [];
      equipmentLibraryLoaded = true;
      updatePartyTreasureItemOptions();
      return equipmentLibraryItems;
    } finally {
      equipmentLibraryLoading = false;
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

  function isNarrowPopupViewport() {
    return Boolean(narrowPopupQuery && narrowPopupQuery.matches);
  }

  function closeRefereeRowOverflowMenus(exceptMenu = null) {
    document.querySelectorAll('.referee-row-menu').forEach((menu) => {
      if (menu === exceptMenu) return;
      menu.classList.add('hidden');
      menu.setAttribute('aria-hidden', 'true');
      const toggle = menu._overflowToggle;
      if (toggle) {
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  function closeExpandedOrderStats() {
    if (!expandedOrderStatsCharacterId) return;
    expandedOrderStatsCharacterId = null;
    if (currentPlayers.length > 0) {
      renderTurnTable(currentPlayers, currentTurnId);
    }
  }

  function closeInitiativeEditor() {
    initiativeEditorCharacterId = null;
    if (initiativeModal) {
      initiativeModal.classList.add('hidden');
      initiativeModal.setAttribute('aria-hidden', 'true');
      initiativeModal.classList.remove('popup-centered');
    }
  }

  function openInitiativeEditor(player) {
    if (!player || !initiativeModal || !initiativeModalInput) return;
    closeRefereeRowOverflowMenus();
    closeExpandedOrderStats();
    initiativeEditorCharacterId = player.id;
    if (initiativeModalTitle) {
      initiativeModalTitle.textContent = 'Edit Initiative';
    }
    if (initiativeModalCharacter) {
      initiativeModalCharacter.textContent = player.name || 'Character';
    }
    initiativeModalInput.value = Number.isFinite(player.initiative) ? String(player.initiative) : '';
    initiativeModal.classList.toggle('popup-centered', isNarrowPopupViewport());
    initiativeModal.classList.remove('hidden');
    initiativeModal.setAttribute('aria-hidden', 'false');
    window.requestAnimationFrame(() => {
      initiativeModalInput.focus();
      initiativeModalInput.select();
    });
  }

  async function saveInitiativeEditor() {
    const player = initiativeEditorCharacterId
      ? currentPlayers.find((entry) => entry.id === initiativeEditorCharacterId)
      : null;
    if (!player || !initiativeModalInput) return;
    const entered = initiativeModalInput.value.trim();
    if (!entered) {
      player.initiative = null;
      await saveCharacterEntry(player);
      closeInitiativeEditor();
      return;
    }
    const initiative = Number(entered);
    if (!Number.isFinite(initiative)) {
      if (statusDiv) statusDiv.textContent = 'Initiative must be a valid number.';
      return;
    }
    player.initiative = initiative;
    await saveCharacterEntry(player);
    closeInitiativeEditor();
  }

  function toggleExpandedOrderStats(characterId) {
    expandedOrderStatsCharacterId =
      expandedOrderStatsCharacterId === characterId ? null : characterId;
    if (currentPlayers.length > 0) {
      renderTurnTable(currentPlayers, currentTurnId);
    }
  }

  function buildOrderStatsPopover(character, displayStatKeys) {
    const stats = Array.isArray(character.stats) ? character.stats : [];
    const statsByKey = new Map(stats.map((stat) => [stat.key, stat]));
    const popover = document.createElement('div');
    popover.className = 'player-row-stats-popover character-stats';
    if (isNarrowPopupViewport()) {
      popover.classList.add('popup-centered');
    }
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-label', `${character.name || 'character'} stats controls`);
    popover.addEventListener('click', (event) => {
      event.stopPropagation();
    });

    const heading = document.createElement('div');
    heading.className = 'player-row-stats-heading';
    heading.textContent = character.name || 'Character';
    popover.appendChild(heading);

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
      popover.appendChild(line);
    });

    return popover;
  }

  function buildRefereeRowOverflowControls(player, options = {}) {
    const anchorEl = options.anchorEl || null;
    const overflow = document.createElement('div');
    overflow.className = 'character-overflow referee-row-overflow';
    const overflowToggle = document.createElement('button');
    overflowToggle.type = 'button';
    overflowToggle.className = 'character-overflow-toggle';
    overflowToggle.setAttribute('aria-label', `Manage ${player.name || 'character'}`);
    overflowToggle.setAttribute('aria-haspopup', 'menu');
    overflowToggle.setAttribute('aria-expanded', 'false');
    overflowToggle.classList.add('hidden');
    overflowToggle.setAttribute('aria-hidden', 'true');
    overflowToggle.tabIndex = -1;
    const overflowMenu = document.createElement('div');
    overflowMenu.className = 'character-overflow-menu referee-row-menu hidden';
    overflowMenu.setAttribute('role', 'menu');
    overflowMenu.setAttribute('aria-hidden', 'true');
    overflowMenu.style.position = 'fixed';
    overflowMenu.style.zIndex = '10000';
    overflowMenu._overflowToggle = overflowToggle;
    document.body.appendChild(overflowMenu);

    const overflowTitle = document.createElement('div');
    overflowTitle.className = 'character-overflow-title';
    overflowTitle.textContent = player.name || 'Character';
    overflowMenu.appendChild(overflowTitle);

    const openOverflowMenu = () => {
      closeExpandedOrderStats();
      closeRefereeRowOverflowMenus(overflowMenu);
      overflowMenu.classList.remove('hidden');
      overflowMenu.setAttribute('aria-hidden', 'false');
      overflowToggle.setAttribute('aria-expanded', 'true');
      const centered = isNarrowPopupViewport();
      overflowMenu.classList.toggle('popup-centered', centered);
      const toggleRect = anchorEl?.getBoundingClientRect() || overflowToggle.getBoundingClientRect();
      if (centered) {
        overflowMenu.style.top = '';
        overflowMenu.style.left = '';
        overflowMenu.style.right = '';
        overflowMenu.style.bottom = '';
        overflowMenu.style.transform = '';
      } else {
        overflowMenu.style.top = `${toggleRect.bottom + 6}px`;
        overflowMenu.style.left = `${toggleRect.left}px`;
        overflowMenu.style.right = 'auto';
        overflowMenu.style.bottom = '';
        overflowMenu.style.transform = '';
        window.requestAnimationFrame(() => {
          const menuRect = overflowMenu.getBoundingClientRect();
          const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
          const overflowRight = menuRect.right > viewportWidth - 8;
          const overflowLeft = menuRect.left < 8;
          if (overflowRight && !overflowLeft) {
            overflowMenu.style.left = `${Math.max(8, viewportWidth - menuRect.width - 8)}px`;
          }
        });
      }
    };

    const addMenuItem = (label, handler, options = {}) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = options.className || 'secondary';
      button.setAttribute('role', 'menuitem');
      button.textContent = label;
      button.disabled = Boolean(options.disabled);
      button.setAttribute('aria-disabled', Boolean(options.disabled).toString());
      if (options.hidden) {
        button.classList.add('hidden');
      }
      button.addEventListener('click', async (event) => {
        event.stopPropagation();
        closeRefereeRowOverflowMenus();
        await handler();
      });
      overflowMenu.appendChild(button);
      return button;
    };

    addMenuItem('Details', () => {
      setSelectedCharacter(player);
      setDetailsPanelOpen(true);
    });
    addMenuItem('Conditions', () => {
      setSelectedCharacter(player);
      setConditionsPanelOpen(true);
    });
    addMenuItem('Reveal Now', () => updateVisibility(player.id, false, false), {
      hidden: !player.isReferee || !player.isHidden
    });
    addMenuItem('Reveal on Turn', () => updateVisibility(player.id, true, true), {
      hidden: !player.isReferee || !player.isHidden
    });
    addMenuItem('Hide Character', () => updateVisibility(player.id, true, false), {
      hidden: !player.isReferee || player.isHidden
    });
    addMenuItem('Open Reference', () => openCharacterReference(player), {
      hidden: !player.referenceUrl
    });
    addMenuItem('Claim Character', async () => {
      await claimCharacter(player);
    }, {
      hidden: Boolean(player.isReferee) || Boolean(player.claimedSessionId)
    });
    addMenuItem(player.isReferee ? 'Release to Pool' : 'Release Character', async () => {
      if (player.isReferee) {
        await releaseCharacterToPool(player);
        return;
      }
      await forceReleaseCharacter(player);
    }, {
      hidden: !Boolean(player.claimedSessionId) && !player.isReferee
    });
    addMenuItem('Delete Character', async () => {
      const confirmed = confirm(`Remove ${player.name || 'this character'} from the tracker?`);
      if (!confirmed) return;
      await deleteCharacter(player.id);
    }, {
      className: 'secondary character-remove'
    });

    overflowToggle.addEventListener('click', (event) => {
      event.stopPropagation();
      const isOpen = !overflowMenu.classList.contains('hidden');
      if (isOpen) {
        closeRefereeRowOverflowMenus();
      } else {
        openOverflowMenu();
      }
    });
    overflowMenu.addEventListener('click', (event) => {
      event.stopPropagation();
    });

    overflow.appendChild(overflowToggle);
    overflow.appendChild(overflowMenu);
    return { overflow, openOverflowMenu };
  }

  function renderTurnTable(players, currentTurnId) {
    if (!playersBody) return;
    document.querySelectorAll('.referee-row-menu').forEach((menu) => menu.remove());
    playersBody.innerHTML = '';
    if (players.length === 0) {
      playersBody.appendChild(createEmptyEncounterRow(5));
      return;
    }

    players.forEach((p) => {
      const tr = document.createElement('tr');
      tr.classList.add('player-row');
      tr.classList.add('player-row-owned');
      if (p.isHidden) {
        tr.classList.add('hidden-character');
      }
      if (currentTurnId && p.id === currentTurnId) {
        tr.classList.add('current-turn');
      }

      const initTd = document.createElement('td');
      initTd.textContent = formatInitiative(p.initiative);

      const nameTd = document.createElement('td');
      nameTd.classList.add('referee-order-name-cell');
      const nameWrap = document.createElement('div');
      nameWrap.className = 'player-row-name-wrap';
      const { overflow, openOverflowMenu } = buildRefereeRowOverflowControls(p, { anchorEl: nameTd });
      const nameText = document.createElement('div');
      nameText.className = 'player-row-name-text';
      const nameLine = document.createElement('div');
      nameLine.textContent = p.name;
      nameText.appendChild(nameLine);
      const controllerName = getCharacterControllerName(p);
      if (controllerName) {
        const ownerLine = document.createElement('div');
        ownerLine.classList.add('player-owner');
        ownerLine.textContent = `(${controllerName})`;
        nameText.appendChild(ownerLine);
      }
      nameWrap.appendChild(nameText);
      const nameButton = document.createElement('button');
      nameButton.type = 'button';
      nameButton.className = 'player-row-name-button referee-order-name-button';
      nameButton.setAttribute('aria-label', `Manage ${p.name || 'character'}`);
      nameButton.appendChild(nameWrap);
      nameButton.addEventListener('click', (event) => {
        event.stopPropagation();
        openOverflowMenu();
      });
      nameTd.appendChild(nameButton);
      nameTd.appendChild(overflow);
      nameTd.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        openOverflowMenu();
      });

      const hpTd = document.createElement('td');
      const stats = Array.isArray(p.stats) ? p.stats : [];
      const orderedStats = orderedEncounterStats(stats, statKeys);
      const statusInfo = encounterStatusInfo(stats, statKeys);
      if (statusInfo) {
        applyEncounterHealthClasses(hpTd, statusInfo);
        hpTd.classList.add('player-row-stats-cell');
        const valueLine = document.createElement('div');
        valueLine.textContent = formatEncounterStatsText(orderedStats, statKeys);
        hpTd.appendChild(valueLine);
        if (p.id === expandedOrderStatsCharacterId) {
          const statsPopover = buildOrderStatsPopover(p, statKeys);
          hpTd.appendChild(statsPopover);
        }
      } else {
        hpTd.textContent = '—';
      }
      if (statusInfo) {
        hpTd.style.cursor = 'pointer';
        hpTd.addEventListener('click', (event) => {
          event.stopPropagation();
          closeRefereeRowOverflowMenus();
          toggleExpandedOrderStats(p.id);
        });
      }
      initTd.style.cursor = 'pointer';
      initTd.addEventListener('click', (event) => {
        event.stopPropagation();
        openInitiativeEditor(p);
      });

      const conditionsTd = document.createElement('td');
      conditionsTd.classList.add('conditions-cell');
      const list = buildEncounterConditionsList(p.conditions, conditionLookup);
      if (list) {
        conditionsTd.appendChild(list);
      } else {
        conditionsTd.textContent = '—';
      }

      const actTd = document.createElement('td');
      const actStatus = p.isHidden
        ? (p.revealOnTurn ? 'Hidden/Reveal on Turn' : 'Hidden')
        : '';
      if (actStatus) {
        const statusLine = document.createElement('div');
        statusLine.className = 'act-status';
        statusLine.textContent = actStatus;
        actTd.appendChild(statusLine);
      }
      const actButton = document.createElement('button');
      actButton.type = 'button';
      actButton.textContent = 'Act Now';
      actButton.disabled = encounterState !== 'active' || currentTurnId === p.id;
      actButton.addEventListener('click', () => {
        setTurnNow(p.id);
      });
      actTd.appendChild(actButton);

      tr.appendChild(initTd);
      tr.appendChild(nameTd);
      tr.appendChild(hpTd);
      tr.appendChild(conditionsTd);
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
    if (players.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'subtitle';
      empty.textContent = 'No characters yet.';
      characterList.appendChild(empty);
      return;
    }

    players.forEach((player) => {
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

  function openCharacterReference(player) {
    const referenceUrl = player?.referenceUrl?.trim();
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
      closeRefereeRowOverflowMenus();
      closeExpandedOrderStats();
      closeInitiativeEditor();
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
    await loadAvailableRulesets();
    await loadConditionLibrary();
    if (hasActiveCampaign) {
      await loadCampaignUserData();
      await loadState();
    } else if (await recoverActiveCampaignIfNeeded()) {
      await loadCampaign();
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
  if (initiativeModal) {
    initiativeModal.addEventListener('click', (event) => {
      if (event.target !== initiativeModal) return;
      closeInitiativeEditor();
    });
  }
  if (initiativeModalCancelBtn) {
    initiativeModalCancelBtn.addEventListener('click', () => {
      closeInitiativeEditor();
    });
  }
  if (initiativeModalSaveBtn) {
    initiativeModalSaveBtn.addEventListener('click', async () => {
      await saveInitiativeEditor();
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
  bindActionButtons();
  updateAddDialogTabs();
  updateSelectionControls();

  init();
});
