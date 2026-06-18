const {
  APP_NAME,
  APP_ICON_URL,
  isAdminHost,
  rollStandardDie,
  formatInitiative,
  updateCampaignHeader,
  appendOverflowMenuSeparator,
  showConfirmDialog
} = window.PlayerTrackerShared || {
  APP_NAME: 'Roll4Initiative',
  APP_ICON_URL: '/favicon-512.png',
  isAdminHost: () => false,
  rollStandardDie: () => null,
  formatInitiative: () => '🎲',
  updateCampaignHeader: () => {},
  appendOverflowMenuSeparator: (menuEl) => menuEl,
  showConfirmDialog: async () => true
};
const {
  DEFAULT_CLAIM_TIMEOUT_MINUTES,
  claimTimeoutLabel: sharedClaimTimeoutLabel,
  formatAccessLabel: sharedFormatAccessLabel,
  readClaimTimeoutMode: sharedReadClaimTimeoutMode,
  readClaimTimeoutMinutes: sharedReadClaimTimeoutMinutes,
  syncClaimTimeoutUi: sharedSyncClaimTimeoutUi,
  populateRulesetSelect: sharedPopulateRulesetSelect
} = window.PlayerTrackerCampaignSettings || {
  DEFAULT_CLAIM_TIMEOUT_MINUTES: 5,
  claimTimeoutLabel: (minutes, defaultMinutes = 5) => {
    if (!Number.isInteger(minutes)) return `${defaultMinutes}m claim timeout`;
    if (minutes < 0) return 'Explicit release only';
    if (minutes === 0) return 'Release immediately on disconnect';
    return `${minutes}m claim timeout`;
  },
  readClaimTimeoutMode: (manualInput) => (manualInput?.checked ? 'manual' : 'timed'),
  readClaimTimeoutMinutes: (manualInput, input, defaultMinutes = 5) => (
    manualInput?.checked
      ? -1
      : ((Number.isFinite(Number.parseInt(String(input?.value || '').trim(), 10)) &&
        Number.parseInt(String(input?.value || '').trim(), 10) >= 0)
        ? Number.parseInt(String(input?.value || '').trim(), 10)
        : defaultMinutes)
  ),
  syncClaimTimeoutUi: (manualInput, input) => {
    const manual = Boolean(manualInput?.checked);
    if (input) {
      input.disabled = manual;
      input.classList.toggle('hidden', manual);
    }
    return manual;
  },
  populateRulesetSelect: (selectEl, rulesets, options = {}) => {
    if (!selectEl) return;
    const {
      currentRulesetId = '',
      emptyValue = 'none',
      emptyLabel = 'No Conditions',
      createOption = () => document.createElement('option')
    } = options;
    selectEl.innerHTML = '';
    if (Array.isArray(rulesets) && rulesets.length > 0) {
      rulesets.forEach((ruleset) => {
        const option = createOption();
        option.value = ruleset.id;
        option.textContent = ruleset.label || ruleset.id;
        selectEl.appendChild(option);
      });
      return;
    }
    const option = createOption();
    option.value = currentRulesetId || emptyValue;
    option.textContent = currentRulesetId || emptyLabel;
    selectEl.appendChild(option);
  }
};
const refereeVisibilityHelpers = window.PlayerTrackerRefereeVisibility || {
  getInitiativeGroupMembers: (currentPlayers, player) => (
    Array.isArray(currentPlayers) && player?.initiativeGroupId
      ? currentPlayers.filter(
          (candidate) =>
            candidate &&
            candidate.initiativeGroupId &&
            candidate.initiativeGroupId === player.initiativeGroupId
        )
      : []
  ),
  getCharacterVisibilityMenuItems: (isHidden) => (
    isHidden
      ? [
          { label: 'Reveal Now', isHidden: false, revealOnTurn: false },
          { label: 'Reveal on Turn', isHidden: true, revealOnTurn: true }
        ]
      : [
          { label: 'Hide Character', isHidden: true, revealOnTurn: false }
        ]
  ),
  getInitiativeGroupVisibilityMenuItems: (groupMembers, isHidden) => (
    Array.isArray(groupMembers) && groupMembers.length > 1
      ? (isHidden
          ? [
              { label: 'Group: Reveal Now', isHidden: false, revealOnTurn: false },
              { label: 'Group: Reveal On Turn', isHidden: true, revealOnTurn: true }
            ]
          : [
              { label: 'Group: Hide', isHidden: true, revealOnTurn: false }
            ])
      : []
  ),
  buildInitiativeGroupVisibilityUpdates: (groupMembers, isHidden, revealOnTurn) => (
    Array.isArray(groupMembers)
      ? groupMembers.filter((member) => Boolean(member && member.id)).map((member) => ({
          id: member.id,
          isHidden,
          revealOnTurn
        }))
      : []
  )
};
const inventoryView = window.PlayerTrackerInventoryView || {};
const {
  normalizeConditionEntry,
  formatEncounterStateText,
  orderedEncounterStats,
  encounterStatusInfo,
  applyEncounterHealthClasses,
  formatEncounterStatsText,
  formatEncounterStatsItems = (stats) => (Array.isArray(stats) ? stats : []),
  formatEncounterStatLine = (stat) => (stat ? `${stat.key} ${stat.current}/${stat.max}` : ''),
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
  formatEncounterStatsItems: (stats) => (Array.isArray(stats) ? stats : []),
  formatEncounterStatLine: (stat) => (stat ? `${stat.key} ${stat.current}/${stat.max}` : ''),
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
  const roundIndicator = document.getElementById('ref-round-indicator');
  const playerNameEdit = document.getElementById('player-name-edit');
  const playerNameInput = document.getElementById('player-name-input');
  const playerNameEditBtn = document.getElementById('edit-player-name');
  const playerNameSaveBtn = document.getElementById('player-name-save');
  const playerNameCancelBtn = document.getElementById('player-name-cancel');
  const playerNameLogoutBtn = document.getElementById('player-name-logout');
  const refereeRulesetLink = document.getElementById('ref-ruleset-link');
  const refereeRulesetLicense = document.getElementById('ref-ruleset-license');
  const refereeRulesetLicenseWrap = document.getElementById('ref-ruleset-license-wrap');
  const refereeRulesetIcon = document.getElementById('ref-ruleset-icon');
  const refereeHeaderPlayerName = document.getElementById('ref-referee-player-name');
  const invitePlayerBtn = document.getElementById('ref-invite-player');
  const campaignSettingsBtn = document.getElementById('ref-campaign-settings');
  const campaignSettingsModal = document.getElementById('ref-campaign-settings-modal');
  const campaignSettingsModalSummary = document.getElementById('ref-campaign-settings-modal-summary');
  const campaignSettingsModalStatus = document.getElementById('ref-campaign-settings-modal-status');
  const campaignSettingsCancelBtn = document.getElementById('ref-campaign-settings-cancel');
  const campaignSettingsSaveBtn = document.getElementById('ref-campaign-settings-save');
  const campaignSettingsInfoTabBtn = document.getElementById('ref-campaign-settings-tab-information');
  const campaignSettingsLibrariesTabBtn = document.getElementById('ref-campaign-settings-tab-libraries');
  const campaignSettingsInfoPanel = document.getElementById('ref-campaign-settings-information-panel');
  const campaignSettingsLibrariesPanel = document.getElementById('ref-campaign-settings-libraries-panel');
  const campaignNameInput = document.getElementById('ref-campaign-name-input');
  const campaignRulesetSelect = document.getElementById('ref-ruleset-select');
  const campaignClaimTimeoutManualInput = document.getElementById('ref-campaign-claim-timeout-manual');
  const campaignClaimTimeoutTimedInput = document.getElementById('ref-campaign-claim-timeout-timed');
  const campaignClaimTimeoutInput = document.getElementById('ref-campaign-claim-timeout-input');
  const campaignInviteOnlyInput = document.getElementById('ref-campaign-invite-only');
  const campaignOpenJoinInput = document.getElementById('ref-campaign-open-join');
  const partyTreasureButton = document.getElementById('ref-party-treasure-button');
  const partyTreasurePanel = document.getElementById('ref-party-treasure-panel');
  const partyTreasureFields = document.getElementById('ref-party-treasure-fields');
  const partyTreasureCancelBtn = document.getElementById('ref-party-treasure-cancel');
  const partyTreasureAddBtn = document.getElementById('ref-party-treasure-add');
  const partyTreasureEditBtn = document.getElementById('ref-party-treasure-edit');
  const partyTreasureRemoveBtn = document.getElementById('ref-party-treasure-remove');
  const partyTreasureDialogTitle = document.getElementById('ref-party-treasure-dialog-title');
  const partyTreasureContext = document.getElementById('ref-party-treasure-context');
  const partyTreasureAddForm = document.getElementById('ref-party-treasure-add-form');
  const partyTreasureAddFormTitle = document.getElementById('ref-party-treasure-add-form-title');
  const partyTreasureAddFormName = document.getElementById('ref-party-treasure-add-name');
  const partyTreasureAddFormQuantity = document.getElementById('ref-party-treasure-add-quantity');
  const partyTreasureAddFormValue = document.getElementById('ref-party-treasure-add-value');
  const partyTreasureAddFormWeight = document.getElementById('ref-party-treasure-add-weight');
  const partyTreasureAddFormUrl = document.getElementById('ref-party-treasure-add-url');
  const partyTreasureAddFormSaveBtn = document.getElementById('ref-party-treasure-add-form-save');
  const partyTreasureAddFormCancelBtn = document.getElementById('ref-party-treasure-add-form-cancel');
  const partyTreasureItemOptions = document.getElementById('ref-party-treasure-item-options');
  const currencyPanel = document.getElementById('currency-panel');
  const currencyCloseBtn = document.getElementById('currency-cancel');
  const currencyDialogTitle = document.getElementById('currency-dialog-title');
  const currencySummary = document.getElementById('currency-summary');
  const currencyFields = document.getElementById('currency-fields');
  const inventoryPanel = document.getElementById('inventory-panel');
  const inventoryCloseBtn = document.getElementById('inventory-close');
  const inventoryDialogTitle = document.getElementById('inventory-dialog-title');
  const inventorySummary = document.getElementById('inventory-summary');
  const inventoryTotalWeight = document.getElementById('inventory-total-weight');
  const inventoryFields = document.getElementById('inventory-fields');
  const inventoryContainerSections = document.getElementById('inventory-container-sections');

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
  const userdataOpenFoldersButton = document.getElementById('ref-campaign-userdata-open-folders');
  const userdataRefreshButton = document.getElementById('ref-campaign-userdata-refresh');
  const userdataSaveButton = document.getElementById('ref-campaign-userdata-save');
  const healthHeading = document.getElementById('health-heading');
  const visibleToggle = document.getElementById('ref-visible');
  const addCurrentStats = document.getElementById('ref-add-current-stats');
  const addButton = document.getElementById('ref-add-button');
  const addCancelBtn = document.getElementById('ref-add-cancel');
  const addRunAsGroupInput = document.getElementById('ref-run-as-group');
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
  const conditionsDialogTitle = document.getElementById('ref-conditions-dialog-title');
  const detailsToggle = document.getElementById('ref-details-toggle');
  const detailsPanel = document.getElementById('ref-details-panel');
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
  const initiativeModalRollBtn = document.getElementById('ref-initiative-roll');
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
  let currentInventory = [];
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
  let initiativeEditorOriginalValue = '';
  let currentTurnId = null;
  let encounterState = 'new';
  let skipRefresh = false;
  let activeCampaignId = null;
  let loadStateInFlight = false;
  let loadStateRefreshQueued = false;
  let campaignSettingsTab = 'information';
  let allowNegativeHealth = false;
  let supportsTempHp = false;
  let currentStandardDie = null;
  let detailsDirty = false;
  let conditionsDirty = false;
  let partyTreasureSelectedRow = null;
  let partyTreasureEditingEntryId = null;
  let currencySystem = null;
  let currencyViewerCharacterId = null;
  let inventoryViewerCharacterId = null;
  let equipmentLibraryItems = [];
  let equipmentLibraryLoaded = false;
  let equipmentLibraryLoading = false;
  const equipmentPresetHelpers = window.PlayerTrackerEquipmentPreset || {
    findEquipmentPreset: (itemName, items = []) => {
      const normalizedName = typeof itemName === 'string' ? itemName.trim().toLowerCase() : '';
      if (!normalizedName || !Array.isArray(items)) {
        return null;
      }
      return items.find(
        (item) => typeof item?.name === 'string' && item.name.trim().toLowerCase() === normalizedName
      ) || null;
    },
    applyEquipmentPresetToInputs: (inputs = {}, itemName, items = []) => {
      const preset = equipmentPresetHelpers.findEquipmentPreset(itemName, items);
      if (!preset) {
        return false;
      }
      if (inputs.valueInput && Number.isFinite(preset.value)) {
        inputs.valueInput.value = String(preset.value);
      }
      if (inputs.weightInput && Number.isFinite(preset.weight)) {
        inputs.weightInput.value = String(preset.weight);
      }
      if (inputs.urlInput && typeof preset.url === 'string' && preset.url.trim()) {
        inputs.urlInput.value = preset.url.trim();
      }
      return true;
    }
  };
  const allowLocalFolderAccess = isAdminHost();
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
    getPartyTreasureRowEntry: (row) => {
      if (!row) return null;
      const rowData = (window.PlayerTrackerPartyTreasure?.getInventoryRowData || partyTreasureHelpers.getInventoryRowData)(row) || {};
      const nameInput = row.querySelector('input[data-inventory-field="name"]');
      const quantityInput = row.querySelector('input[data-inventory-field="quantity"]');
      const valueInput = row.querySelector('input[data-inventory-field="value"]');
      const weightInput = row.querySelector('input[data-inventory-field="weight"]');
      const urlInput = row.querySelector('input[data-inventory-field="url"]');
      return (window.PlayerTrackerPartyTreasure?.normalizeInventoryEntry || partyTreasureHelpers.normalizeInventoryEntry)({
        id: rowData.id || null,
        name: nameInput ? nameInput.value.trim() : '',
        quantity: quantityInput ? Number(quantityInput.value) : 1,
        value: valueInput ? Number(valueInput.value) : 0,
        weight: weightInput ? Number(weightInput.value) : 0,
        url: urlInput ? urlInput.value.trim() : '',
        containerId: rowData.containerId,
        isContainer: rowData.isContainer
      });
    },
    createPartyTreasureRow: (options = {}) => {
      const {
        entry = {},
        itemOptionsId = 'ref-party-treasure-item-options',
        onDirty = null,
        onSelect = null,
        applyPreset = null
      } = options;
      const normalized = (window.PlayerTrackerPartyTreasure?.normalizeInventoryEntry || partyTreasureHelpers.normalizeInventoryEntry)(entry, null, false);
      const row = document.createElement('tr');
      row.className = 'inventory-entry';
      row.dataset.inventoryEntryId = normalized.id;
      row.dataset.inventoryContainerId = '';
      row.dataset.inventoryIsContainer = 'false';
      row.addEventListener('click', () => {
        if (typeof onSelect === 'function') onSelect(row);
      });
      const fields = [
        { key: 'name', type: 'text', value: normalized.name, placeholder: 'Item name', list: itemOptionsId },
        { key: 'quantity', type: 'number', value: String(normalized.quantity), step: '1' },
        { key: 'value', type: 'number', value: String(normalized.value), step: 'any' }
      ];
      fields.forEach((field) => {
        const cell = document.createElement('td');
        const input = document.createElement('input');
        input.type = field.type;
        input.value = field.value;
        if (field.placeholder) input.placeholder = field.placeholder;
        if (field.list) input.setAttribute('list', field.list);
        if (field.step) input.step = field.step;
        input.dataset.inventoryField = field.key;
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
        row.appendChild(cell);
      });
      const nameCell = row.querySelector('td[data-inventory-field-cell="name"]');
      if (nameCell) {
        const weightHidden = document.createElement('input');
        weightHidden.type = 'hidden';
        weightHidden.value = String(normalized.weight);
        weightHidden.dataset.inventoryField = 'weight';
        nameCell.appendChild(weightHidden);

        const urlHidden = document.createElement('input');
        urlHidden.type = 'hidden';
        urlHidden.value = normalized.url || '';
        urlHidden.dataset.inventoryField = 'url';
        nameCell.appendChild(urlHidden);
      }
      return row;
    },
    buildPartyTreasureFields: (fieldsEl, items = [], options = {}) => {
      if (!fieldsEl) return null;
      const {
        itemOptionsId = 'ref-party-treasure-item-options',
        onDirty = null,
        onSelect = null,
        applyPreset = null
      } = options;
      fieldsEl.innerHTML = '';
      const normalizedEntries = Array.isArray(items)
        ? items.map((entry) => (window.PlayerTrackerPartyTreasure?.normalizeInventoryEntry || partyTreasureHelpers.normalizeInventoryEntry)(entry))
        : [];
      const rows = normalizedEntries.length > 0
        ? normalizedEntries
        : [(window.PlayerTrackerPartyTreasure?.normalizeInventoryEntry || partyTreasureHelpers.normalizeInventoryEntry)({}, null, false)];
      rows.forEach((entry) => {
        fieldsEl.appendChild((window.PlayerTrackerPartyTreasure?.createPartyTreasureRow || partyTreasureHelpers.createPartyTreasureRow)({
          entry,
          itemOptionsId,
          onDirty,
          onSelect,
          applyPreset
        }));
      });
      const firstRow = fieldsEl.querySelector('tr.inventory-entry');
      if (typeof onSelect === 'function') {
        onSelect(firstRow);
      }
      return firstRow;
    },
  };
  const inventoryTransferHelpers = window.PlayerTrackerInventoryTransfer || {
    normalizeTransferEntry: (entry = {}) => ({
      id: typeof entry.id === 'string' ? entry.id.trim() : '',
      name: typeof entry.name === 'string' ? entry.name : '',
      quantity: Number.isFinite(entry.quantity) ? entry.quantity : 1,
      value: Number.isFinite(entry.value) ? entry.value : 0,
      weight: Number.isFinite(entry.weight) ? entry.weight : 0,
      url: typeof entry.url === 'string' && entry.url.trim() ? entry.url.trim() : null,
      containerId: typeof entry.containerId === 'string' && entry.containerId.trim() ? entry.containerId.trim() : null,
      isContainer: Boolean(entry.isContainer)
    }),
    transferEntry: ({ sourceItems = [], destinationItems = [], entryId, mapTransferredEntry = (entry) => entry, removeFromSource = true } = {}) => {
      const normalizedSourceItems = Array.isArray(sourceItems)
        ? sourceItems.map((item) => inventoryTransferHelpers.normalizeTransferEntry(item))
        : [];
      const normalizedDestinationItems = Array.isArray(destinationItems)
        ? destinationItems.map((item) => inventoryTransferHelpers.normalizeTransferEntry(item))
        : [];
      const normalizedEntryId = typeof entryId === 'string' ? entryId.trim() : '';
      if (!normalizedEntryId) {
        return {
          sourceItems: normalizedSourceItems,
          destinationItems: normalizedDestinationItems,
          transferredEntry: null
        };
      }
      const sourceIndex = normalizedSourceItems.findIndex((item) => item.id === normalizedEntryId);
      if (sourceIndex < 0) {
        return {
          sourceItems: normalizedSourceItems,
          destinationItems: normalizedDestinationItems,
          transferredEntry: null
        };
      }
      const sourceEntry = normalizedSourceItems[sourceIndex];
      const transferredEntry = inventoryTransferHelpers.normalizeTransferEntry(mapTransferredEntry({ ...sourceEntry }));
      const nextSourceItems = removeFromSource
        ? normalizedSourceItems.filter((item) => item.id !== normalizedEntryId)
        : normalizedSourceItems.map((item) => (item.id === normalizedEntryId ? transferredEntry : item));
      const nextDestinationItems = (() => {
        const normalizedItems = normalizedDestinationItems.slice();
        const destIndex = normalizedItems.findIndex((item) => item.id === transferredEntry.id);
        if (destIndex >= 0) {
          normalizedItems[destIndex] = transferredEntry;
        } else {
          normalizedItems.push(transferredEntry);
        }
        return normalizedItems;
      })();
      return {
        sourceItems: nextSourceItems,
        destinationItems: nextDestinationItems,
        transferredEntry
      };
    }
  };
  const refereeHeaderNameTargets = [refereeCampaignName];
  const refereeHeaderIconTargets = [refereeRulesetIcon];
  const refereeHeaderLinkTargets = [refereeRulesetLink];
  const refereeHeaderLicenseTargets = [
    { linkEl: refereeRulesetLicense, wrapEl: refereeRulesetLicenseWrap }
  ];

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
  if (campaignSettingsInfoTabBtn) {
    campaignSettingsInfoTabBtn.addEventListener('click', () => {
      setCampaignSettingsTab('information');
    });
  }
  if (campaignSettingsLibrariesTabBtn) {
    campaignSettingsLibrariesTabBtn.addEventListener('click', () => {
      setCampaignSettingsTab('libraries');
    });
  }
  if (campaignSettingsModal) {
    campaignSettingsModal.addEventListener('click', (event) => {
      if (event.target !== campaignSettingsModal) return;
      closeCampaignSettingsModal();
    });
  }
  if (playerNameEditBtn && playerNameInput) {
    playerNameEditBtn.addEventListener('click', () => {
      playerNameInput.value = getStoredRefereePlayerName();
      showPlayerNameEdit(true);
      playerNameInput.focus();
      playerNameInput.select();
    });
  }
  if (playerNameEdit) {
    playerNameEdit.addEventListener('click', (event) => {
      if (event.target !== playerNameEdit) return;
      if (playerNameCancelBtn) {
        playerNameCancelBtn.click();
      } else {
        showPlayerNameEdit(false);
      }
    });
  }
  if (playerNameCancelBtn && playerNameInput) {
    playerNameCancelBtn.addEventListener('click', () => {
      playerNameInput.value = getStoredRefereePlayerName();
      showPlayerNameEdit(false);
    });
  }
  if (playerNameLogoutBtn) {
    playerNameLogoutBtn.addEventListener('click', () => {
      void logoutPlayerSession();
    });
  }
  if (playerNameSaveBtn && playerNameInput) {
    playerNameSaveBtn.addEventListener('click', () => {
      const newName = playerNameInput.value.trim();
      if (!newName) {
        playerNameInput.focus();
        playerNameInput.select();
        return;
      }
      setStoredRefereePlayerName(newName);
      updateRefereeHeaderPlayerName();
      showPlayerNameEdit(false);
    });
  }
  if (form) {
    form.addEventListener('click', (event) => {
      if (event.target !== form) return;
      if (addCancelBtn) {
        addCancelBtn.click();
      } else {
        hideAddForm();
      }
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
  if (campaignOpenJoinInput) {
    campaignOpenJoinInput.addEventListener('change', () => validateCampaignSettingsModal());
  }
  if (partyTreasureAddBtn) {
    partyTreasureAddBtn.addEventListener('click', () => {
      addPartyTreasureItem();
    });
  }
  if (partyTreasureEditBtn) {
    partyTreasureEditBtn.addEventListener('click', () => {
      editSelectedPartyTreasureItem();
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
  if (partyTreasureAddFormName) {
    partyTreasureAddFormName.addEventListener('input', () => {
      applyPartyTreasurePresetToForm(partyTreasureAddFormName.value);
    });
    partyTreasureAddFormName.addEventListener('change', () => {
      applyPartyTreasurePresetToForm(partyTreasureAddFormName.value);
    });
  }
  if (partyTreasureRemoveBtn) {
    partyTreasureRemoveBtn.addEventListener('click', () => {
      removeSelectedPartyTreasureItem();
    });
  }
  if (partyTreasureCancelBtn) {
    partyTreasureCancelBtn.addEventListener('click', async () => {
      closePartyTreasureEditor();
    });
  }
  if (partyTreasurePanel) {
    partyTreasurePanel.addEventListener('click', async (event) => {
      if (event.target !== partyTreasurePanel) return;
      closePartyTreasureEditor();
    });
  }
  if (currencyCloseBtn) {
    currencyCloseBtn.addEventListener('click', () => {
      closeCurrencyViewer();
    });
  }
  if (inventoryCloseBtn) {
    inventoryCloseBtn.addEventListener('click', () => {
      closeInventoryViewer();
    });
  }
  if (currencyPanel) {
    currencyPanel.addEventListener('click', (event) => {
      if (event.target !== currencyPanel) return;
      closeCurrencyViewer();
    });
  }
  if (inventoryPanel) {
    inventoryPanel.addEventListener('click', (event) => {
      if (event.target !== inventoryPanel) return;
      closeInventoryViewer();
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
  if (userdataOpenFoldersButton) {
    userdataOpenFoldersButton.classList.toggle('hidden', !allowLocalFolderAccess);
    userdataOpenFoldersButton.disabled = !allowLocalFolderAccess || !activeCampaignId;
    userdataOpenFoldersButton.setAttribute('aria-disabled', userdataOpenFoldersButton.disabled.toString());
    userdataOpenFoldersButton.addEventListener('click', () => {
      void openCampaignUserDataFolders();
    });
  }
  if (userdataSaveButton) {
    userdataSaveButton.addEventListener('click', () => {
      void saveCampaignUserDataSelection();
    });
  }
  updateRefereeHeaderPlayerName();
  window.addEventListener('storage', updateRefereeHeaderPlayerName);

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
  /**
   * Update the campaign summary UI in the referee header and settings modal.
   * @param {object|null} campaign Campaign payload returned by the server.
   * @returns {void}
   */
  function setCampaignSummary(campaign) {
    if (!campaignSettingsModalSummary) return;
    if (!campaign) {
      campaignSettingsModalSummary.textContent = 'No active campaign selected.';
      return;
    }
    const claimTimeoutLabel = sharedClaimTimeoutLabel(
      campaign.claimTimeoutMinutes,
      DEFAULT_CLAIM_TIMEOUT_MINUTES
    );
    const inviteLabel = sharedFormatAccessLabel(campaign.isInviteOnly);
    campaignSettingsModalSummary.textContent = `${campaign.name} · ${campaign.rulesetLabel || campaign.rulesetId || 'No Conditions'} · ${claimTimeoutLabel} · ${inviteLabel}`;
  }

  function getStoredRefereePlayerName() {
    try {
      const ownerName = (localStorage.getItem('ownerName') || '').trim();
      if (ownerName) return ownerName;
      return (localStorage.getItem('playerLoginName') || '').trim();
    } catch (_err) {
      return '';
    }
  }

  function setStoredRefereePlayerName(name) {
    try {
      localStorage.setItem('ownerName', name);
    } catch (_err) {
      // Ignore localStorage failures; the header will still update for this session.
    }
  }

  /**
   * Update the referee header's player name label.
   * @returns {void}
   */
  function updateRefereeHeaderPlayerName() {
    if (!refereeHeaderPlayerName) return;
    refereeHeaderPlayerName.textContent = getStoredRefereePlayerName() || 'Player';
  }

  function showPlayerNameEdit(show) {
    if (!playerNameEdit) return;
    playerNameEdit.classList.toggle('visible', show);
    playerNameEdit.setAttribute('aria-hidden', (!show).toString());
    if (playerNameEditBtn) {
      playerNameEditBtn.classList.toggle('hidden', show);
    }
    if (playerNameInput) {
      playerNameInput.readOnly = !show;
    }
  }

  async function logoutPlayerSession() {
    const confirmed = window.confirm('Log out and return to the join page?');
    if (!confirmed) return;
    try {
      await fetch('/player/logout', { method: 'POST' });
    } catch (_err) {
      // Continue with local cleanup and redirect even if the request fails.
    }
    try {
      localStorage.removeItem('ownerName');
      localStorage.removeItem('playerLoginName');
    } catch (_err) {
      // Ignore storage failures.
    }
    updateRefereeHeaderPlayerName();
    window.location.replace('/index.html');
  }

  /**
   * Show or clear the status line inside the campaign settings modal.
   * @param {string} text Status text to display.
   * @param {boolean} [isError=false] Whether the status should be styled as an error.
   * @returns {void}
   */
  function setCampaignSettingsModalStatus(text = '', isError = false) {
    if (!campaignSettingsModalStatus) return;
    campaignSettingsModalStatus.textContent = text;
    campaignSettingsModalStatus.style.color = isError ? '#b00020' : '';
  }

  /**
   * Switch the campaign settings modal between Information and Creature Libraries.
   * @param {'information'|'libraries'} tab Tab to show.
   * @returns {void}
   */
  function setCampaignSettingsTab(tab) {
    campaignSettingsTab = tab === 'libraries' ? 'libraries' : 'information';
    const isInfoTab = campaignSettingsTab === 'information';
    if (campaignSettingsInfoTabBtn) {
      campaignSettingsInfoTabBtn.setAttribute('aria-selected', isInfoTab.toString());
    }
    if (campaignSettingsLibrariesTabBtn) {
      campaignSettingsLibrariesTabBtn.setAttribute('aria-selected', (!isInfoTab).toString());
    }
    if (campaignSettingsInfoPanel) {
      campaignSettingsInfoPanel.classList.toggle('hidden', !isInfoTab);
      campaignSettingsInfoPanel.setAttribute('aria-hidden', (!isInfoTab).toString());
    }
    if (campaignSettingsLibrariesPanel) {
      campaignSettingsLibrariesPanel.classList.toggle('hidden', isInfoTab);
      campaignSettingsLibrariesPanel.setAttribute('aria-hidden', isInfoTab.toString());
    }
  }

  /**
   * Populate the ruleset selector with the loaded ruleset list.
   * @returns {void}
   */
  function populateCampaignRulesetSelect() {
    sharedPopulateRulesetSelect(campaignRulesetSelect, availableRulesets, {
      currentRulesetId,
      emptyValue: 'none',
      emptyLabel: currentRulesetId || 'No Conditions'
    });
  }

  /**
   * Load the list of available rulesets for campaign settings.
   * @returns {Promise<void>}
   */
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

  /**
   * Try to recover a previously selected campaign when no active campaign is set.
   * @returns {Promise<boolean>} True when a campaign was recovered.
   */
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

  /**
   * Check whether the campaign settings modal is currently visible.
   * @returns {boolean}
   */
  function isCampaignSettingsModalOpen() {
    return Boolean(campaignSettingsModal && !campaignSettingsModal.classList.contains('hidden'));
  }

  /**
   * Normalize a claim-timeout value into a whole number of minutes or null.
   * @param {unknown} value Raw input value from the form.
   * @returns {number|null}
   */
  /**
   * Read the current claim-timeout mode from the campaign settings form.
   * @returns {'manual'|'timed'}
   */
  function getCampaignClaimTimeoutMode() {
    return sharedReadClaimTimeoutMode(campaignClaimTimeoutManualInput);
  }

  /**
   * Read and normalize the timed claim timeout from the campaign settings form.
   * @returns {number|null}
   */
  function getCampaignClaimTimeoutMinutes() {
    return sharedReadClaimTimeoutMinutes(
      campaignClaimTimeoutManualInput,
      campaignClaimTimeoutInput,
      DEFAULT_CLAIM_TIMEOUT_MINUTES
    );
  }

  /**
   * Synchronize the claim-timeout controls and their disabled state.
   * @returns {void}
   */
  function syncCampaignClaimTimeoutUi() {
    return sharedSyncClaimTimeoutUi(campaignClaimTimeoutManualInput, campaignClaimTimeoutInput);
  }

  /**
   * Fill the campaign settings form from the currently loaded campaign.
   * @returns {void}
   */
  function populateCampaignSettingsForm() {
    populateCampaignRulesetSelect();
    if (campaignNameInput) {
      campaignNameInput.value = currentCampaignName;
    }
    if (campaignRulesetSelect) {
      campaignRulesetSelect.disabled = true;
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
    if (campaignOpenJoinInput) {
      campaignOpenJoinInput.checked = !currentCampaignInviteOnly;
    }
    syncCampaignClaimTimeoutUi();
    setCampaignSettingsModalStatus('');
  }

  /**
   * Determine whether the campaign settings form differs from the loaded values.
   * @returns {boolean}
   */
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

  /**
   * Validate the current campaign settings form values.
   * @returns {boolean}
   */
  function campaignSettingsAreValid() {
    const name = (campaignNameInput?.value || '').trim();
    const rulesetId = campaignRulesetSelect?.value || '';
    if (!name || !rulesetId || rulesetId === 'none') return false;
    if (getCampaignClaimTimeoutMode() !== 'manual' && getCampaignClaimTimeoutMinutes() === null) return false;
    return true;
  }

  /**
   * Update the campaign settings save button state from current form validity.
   * @returns {void}
   */
  function validateCampaignSettingsModal() {
    if (!campaignSettingsSaveBtn) return;
    const valid = campaignSettingsAreValid();
    const changed = campaignSettingsHaveChanges();
    campaignSettingsSaveBtn.disabled = !(valid && changed && Boolean(activeCampaignId));
  }

  /**
   * Open the campaign settings modal and focus the first editable field.
   * @returns {void}
   */
  function openCampaignSettingsModal() {
    if (!campaignSettingsModal || !activeCampaignId) {
      return;
    }
    setCampaignSettingsTab('information');
    populateCampaignSettingsForm();
    renderCampaignUserDataFiles();
    updateCampaignUserDataSummary();
    updateCampaignUserDataSaveState();
    campaignSettingsModal.classList.remove('hidden');
    campaignSettingsModal.setAttribute('aria-hidden', 'false');
    validateCampaignSettingsModal();
    campaignNameInput?.focus();
  }

  /**
   * Close the campaign settings modal and clear its status message.
   * @returns {void}
   */
  function closeCampaignSettingsModal() {
    if (!campaignSettingsModal) return;
    campaignSettingsModal.classList.add('hidden');
    campaignSettingsModal.setAttribute('aria-hidden', 'true');
    setCampaignSettingsModalStatus('');
  }

  /**
   * Persist the campaign settings modal back to the server.
   * @returns {Promise<void>}
   */
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
          rulesetId: currentRulesetId,
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

  /**
   * Update the visible encounter summary in the referee header.
   * @param {number} round Current encounter round.
   * @param {object|null} currentTurnPlayer Player who is currently acting.
   * @param {boolean} isRefTurn Whether the active turn belongs to a referee-owned character.
   * @returns {void}
   */
  function updateEncounterStateDisplay(round = 1, currentTurnPlayer = null, isRefTurn = false) {
    if (roundIndicator) {
      roundIndicator.textContent = `Round: ${round || 1}`;
      roundIndicator.classList.toggle('round-indicator-active', encounterState === 'active');
      roundIndicator.classList.toggle('round-indicator-suspended', encounterState === 'suspended');
      roundIndicator.classList.toggle('round-indicator-new', encounterState !== 'active' && encounterState !== 'suspended');
    }
    if (refereeEncounterState) {
      refereeEncounterState.classList.toggle('player-encounter-state-mine', Boolean(isRefTurn));
      refereeEncounterState.textContent = formatEncounterStateText(encounterState, round, currentTurnPlayer);
    }
  }

  /**
   * Enable or disable add-form initiative bonus inputs based on the roll mode.
   * @returns {void}
   */
  function updateAddInitiativeBonusAvailability() {
    if (!initiativeBonusInput || !initiativeBonusWrap) return;
    const enabled = !useAppInitiativeRollInput || useAppInitiativeRollInput.checked;
    initiativeBonusInput.disabled = !enabled;
    initiativeBonusWrap.classList.toggle('disabled', !enabled);
  }

  /**
   * Enable or disable the editor initiative bonus input based on the selected stat block.
   * @returns {void}
   */
  function updateEditorInitiativeBonusAvailability() {
    if (!editorInitiativeBonusInput || !editorInitiativeBonusWrap) return;
    editorInitiativeBonusInput.disabled = false;
    editorInitiativeBonusWrap.classList.remove('disabled');
  }

  /**
   * Normalize a stat-block definition loaded from JSON.
   * @param {object} entry Raw stat-block definition.
   * @returns {object|null}
   */
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

  /**
   * Normalize a stat key or alias token for case-insensitive comparisons.
   * @param {unknown} value Raw stat token.
   * @returns {string}
   */
  function normalizeStatToken(value) {
    if (typeof value !== 'string') {
      return '';
    }
    return value
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '');
  }

  /**
   * Replace the current stat alias lookup map.
   * @param {Map<string, string>|object} aliases Alias mapping to install.
   * @returns {void}
   */
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

  /**
   * Normalize a stat key into its canonical display name.
   * @param {unknown} value Raw stat key from user or JSON input.
   * @returns {string}
   */
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

  /**
   * Normalize a stat array into the shape the UI expects.
   * @param {Array<object>} stats Raw stat array.
   * @returns {Array<object>}
   */
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

  /**
   * Snapshot the current stat input values so they can be restored after a block switch.
   * @param {Map<string, {maxInput?: HTMLInputElement, currentInput?: HTMLInputElement}>} map Input map.
   * @returns {Map<string, {max?: string, current?: string}>}
   */
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

  /**
   * Restore stat input values from a previously captured snapshot.
   * @param {Map<string, {maxInput?: HTMLInputElement, currentInput?: HTMLInputElement}>} map Input map.
   * @param {Map<string, {max?: string, current?: string}>} snapshot Captured values.
   * @returns {void}
   */
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

  /**
   * Resolve the currently selected add-form stat block definition.
   * @returns {object|null}
   */
  function getSelectedAddStatBlock() {
    return addStatBlockLookup.get(selectedAddStatBlockId) || null;
  }

  /**
   * Return the stat keys that should be rendered in the add form.
   * @returns {string[]}
   */
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

  /**
   * Pick the default stat block id for the add form.
   * @returns {string}
   */
  function getDefaultAddStatBlockId() {
    return addStatBlockDefinitions.find((block) => block.defaultBlock)?.id
      || addStatBlockDefinitions[0]?.id
      || null;
  }

  /**
   * Infer a stat block id from an existing stat array.
   * @param {Array<object>} stats Character stats.
   * @returns {string|null}
   */
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

  /**
   * Resolve the stat keys that should be shown for a character row.
   * @param {object|null} player Character record.
   * @returns {string[]}
   */
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

  /**
   * Build a set of stat input rows for either the add form or the editor.
   * @param {object} options Rendering options.
   * @param {string[]} options.keys Stat keys to render.
   * @param {Map<string, object>} options.inputsMap Map that receives the generated inputs.
   * @param {HTMLElement} options.fieldsContainer Container for the field rows.
   * @param {HTMLElement|null} options.currentStatsContainer Container for live stat summaries.
   * @param {HTMLElement|null} options.headingEl Optional heading element to update.
   * @param {string} options.prefix Prefix for generated input ids.
   * @returns {void}
   */
  /**
   * Build the stat editor fields for a given stat block definition.
   * @param {object} options Stat block options.
   * @returns {void}
   */
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
      headingEl.textContent = 'Health';
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

  /**
   * Synchronize the add-form stat block selector with the loaded definitions.
   * @returns {void}
   */
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

  /**
   * Select a stat block for the add form and rebuild its stat inputs.
   * @param {string} statBlockId Selected stat block id.
   * @param {object} [options]
   * @param {boolean} [options.preserveValues=true] Whether to preserve current field values.
   * @returns {void}
   */
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

  /**
   * Enable or disable the invite-player button based on campaign/session state.
   * @returns {void}
   */
  function updateInvitePlayerButtonState() {
    if (!invitePlayerBtn) return;
    invitePlayerBtn.disabled = !activeCampaignId;
  }

  /**
   * Send a campaign invite to the email address in the referee header.
   * @returns {Promise<void>}
   */
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

  /**
   * Hide the main referee overflow menu.
   * @returns {void}
   */
  function closeOverflowMenu() {
    if (!overflowMenu || !overflowToggle) return;
    overflowMenu.classList.add('hidden');
    overflowMenu.setAttribute('aria-hidden', 'true');
    overflowToggle.setAttribute('aria-expanded', 'false');
  }

  /**
   * Show the main referee overflow menu.
   * @returns {void}
   */
  function openOverflowMenu() {
    if (!overflowMenu || !overflowToggle) return;
    overflowMenu.classList.remove('hidden');
    overflowMenu.setAttribute('aria-hidden', 'false');
    overflowToggle.setAttribute('aria-expanded', 'true');
  }

  /**
   * Toggle the main referee overflow menu.
   * @returns {void}
   */
  function toggleOverflowMenu() {
    if (!overflowMenu || !overflowToggle) return;
    if (overflowMenu.classList.contains('hidden')) {
      openOverflowMenu();
    } else {
      closeOverflowMenu();
    }
  }

  /**
   * Rebuild the referee add-form stat fields from the active stat block.
   * @returns {void}
   */
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

  /**
   * Open or close the referee conditions panel.
   * @param {boolean} open Whether the panel should be open.
   * @returns {void}
   */
  function setConditionsPanelOpen(open) {
    if (!conditionsPanel) return;
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
    conditionsPanel.setAttribute('aria-hidden', (!open).toString());
  }

  function updateConditionsDialogTitle(name = '') {
    if (!conditionsDialogTitle) return;
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    conditionsDialogTitle.textContent = `🩸 Conditions - ${trimmedName || 'this character'}`;
  }

  /**
   * Confirm that unsaved condition edits should be discarded.
   * @returns {boolean} True if the editor can close, false if the user cancelled.
   */
  async function confirmDiscardUnsavedConditions() {
    if (!conditionsDirty) return true;
    const discard = await showConfirmDialog({
      title: 'Discard Changes?',
      header: 'You have unsaved condition changes.',
      message: 'Choose Discard Changes to lose them, or Return to Conditions to keep editing.',
      confirmLabel: 'Discard Changes',
      cancelLabel: 'Return to Conditions',
      confirmButtonClass: 'danger',
      initialFocus: 'cancel'
    });
    if (!discard) return false;
    const current = currentPlayers.find((player) => player.id === selectedCharacterId);
    if (current) {
      setSelectedCharacter(current);
    }
    return true;
  }

  /**
   * Confirm that unsaved detail edits should be discarded.
   * @returns {Promise<boolean>} True if the editor can close, false if the user cancelled.
   */
  async function confirmDiscardUnsavedDetails() {
    if (!detailsDirty) return true;
    const discard = await showConfirmDialog({
      title: 'Discard Changes?',
      header: 'You have unsaved detail changes.',
      message: 'Choose Discard Changes to lose them, or Keep Editing to continue working.',
      confirmLabel: 'Discard Changes',
      cancelLabel: 'Keep Editing',
      confirmButtonClass: 'danger',
      initialFocus: 'cancel'
    });
    if (!discard) return false;
    const current = currentPlayers.find((player) => player.id === selectedCharacterId);
    if (current) {
      setSelectedCharacter(current);
    }
    return true;
  }

  /**
   * Open or close the referee details panel.
   * @param {boolean} open Whether the panel should be open.
   * @returns {void}
   */
  function setDetailsPanelOpen(open) {
    if (!detailsPanel) return;
    if (open && conditionsPanel) {
      setConditionsPanelOpen(false);
    }
    detailsPanel.classList.toggle('hidden', !open);
    detailsPanel.classList.toggle('details-panel-open', open);
    detailsPanel.classList.toggle('details-panel-collapsed', !open);
    if (detailsToggle) {
      detailsToggle.setAttribute('aria-expanded', open.toString());
    }
    detailsPanel.setAttribute('aria-hidden', (!open).toString());
  }

  /**
   * Rebuild the selected-character editor stat fields.
   * @returns {void}
   */
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

  /**
   * Update the creature library summary line.
   * @param {string} text Summary text to show.
   * @returns {void}
   */
  function setCreatureLibrarySummary(text) {
    if (!librarySummary) return;
    librarySummary.textContent = text || '';
  }

  /**
   * Update the creature library import status text.
   * @param {string} text Status text to show.
   * @returns {void}
   */
  function setCreatureLibraryImportStatus(text) {
    if (!libraryImportStatus) return;
    libraryImportStatus.textContent = text || '';
  }

  /**
   * Update the campaign userdata status text.
   * @param {string} text Status text to show.
   * @returns {void}
   */
  function setCampaignUserDataStatus(text) {
    if (!userdataStatus) return;
    userdataStatus.textContent = text || '';
  }

  /**
   * Reset the userdata picker state back to defaults.
   * @returns {void}
   */
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
    updateCampaignUserDataFolderButtonState();
  }

  /**
   * Refresh the userdata save button state.
   * @returns {void}
   */
  function updateCampaignUserDataSaveState() {
    if (!userdataSaveButton) return;
    userdataSaveButton.disabled = !campaignUserdataDirty || campaignUserdataLoading;
    userdataSaveButton.setAttribute('aria-disabled', userdataSaveButton.disabled.toString());
  }

  /**
   * Refresh the folder-open button state.
   * @returns {void}
   */
  function updateCampaignUserDataFolderButtonState() {
    if (!userdataOpenFoldersButton) return;
    userdataOpenFoldersButton.classList.toggle('hidden', !allowLocalFolderAccess);
    userdataOpenFoldersButton.disabled = !allowLocalFolderAccess || campaignUserdataLoading || !activeCampaignId;
    userdataOpenFoldersButton.setAttribute('aria-disabled', userdataOpenFoldersButton.disabled.toString());
  }

  /**
   * Normalize a userdata file name for display and selection.
   * @param {string} name Raw file name.
   * @returns {string}
   */
  function normalizeUserdataFileName(name) {
    if (typeof name !== 'string') return '';
    return name.trim();
  }

  /**
   * Read the current userdata selection into a set.
   * @returns {Set<string>}
   */
  function currentUserdataSelectionSet() {
    return new Set(campaignUserdataSelection.map((name) => normalizeUserdataFileName(name)).filter(Boolean));
  }

  /**
   * Render the list of campaign userdata files.
   * @param {Array<object>} files Files to render.
   * @returns {void}
   */
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

  /**
   * Refresh the campaign userdata summary line.
   * @returns {void}
   */
  function updateCampaignUserDataSummary() {
    if (!userdataSummary) return;
    const selectedCount = campaignUserdataSelection.length;
    const availableCount = campaignUserdataFiles.filter((entry) => !entry.missing).length;
    userdataSummary.textContent = availableCount > 0
      ? `Userdata: ${selectedCount} selected from ${availableCount} file(s)`
      : 'Userdata: no files available';
  }

  /**
   * Replace the userdata selection with the provided set.
   * @param {Iterable<string>} selection Selected file names.
   * @returns {void}
   */
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

  /**
   * Update the add-dialog tab button state and visible panel.
   * @returns {void}
   */
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

  /**
   * Switch the add dialog between manual and library modes.
   * @param {string} tab Tab key to show.
   * @param {object} [options={}] Optional focus behavior.
   * @returns {void}
   */
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

  /**
   * Load the campaign's imported userdata file list.
   * @returns {Promise<void>}
   */
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
    updateCampaignUserDataFolderButtonState();
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
      updateCampaignUserDataFolderButtonState();
    }
  }

  /**
   * Save the selected userdata files for the campaign.
   * @returns {Promise<void>}
   */
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

  /**
   * Ask the local server to open the bundled rulesets folder and the campaign userdata folder.
   * @returns {Promise<boolean>}
   */
  async function openCampaignUserDataFolders() {
    if (!allowLocalFolderAccess) {
      setCampaignUserDataStatus('Open folders is only available from localhost.');
      return false;
    }
    if (!activeCampaignId) {
      setCampaignUserDataStatus('No active campaign selected.');
      return false;
    }
    if (!userdataOpenFoldersButton) {
      return false;
    }
    userdataOpenFoldersButton.disabled = true;
    setCampaignUserDataStatus('Opening library folders...');
    try {
      const res = await fetch('/campaign/userdata/open-folders', { method: 'POST' });
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }
      setCampaignUserDataStatus('Opened default rulesets and userdata folders.');
      return true;
    } catch (err) {
      setCampaignUserDataStatus(`Unable to open folders: ${err.message}`);
      return false;
    } finally {
      updateCampaignUserDataFolderButtonState();
    }
  }

  /**
   * Clear the current creature library selection.
   * @returns {void}
   */
  function clearCreatureLibrarySelection() {
    selectedCreatureLibraryId = null;
    selectedCreatureLibrary = null;
  }

  /**
   * Reset the creature library UI and cached results.
   * @returns {void}
   */
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

  /**
   * Open or close the creature library section.
   * @param {boolean} open Whether the library should be open.
   * @returns {void}
   */
  function setCreatureLibraryOpen(open) {
    setAddDialogTab(open ? 'library' : 'manual', { focus: open });
  }

  /**
   * Debounce a creature library search request.
   * @param {string} query Search text.
   * @returns {void}
   */
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

  /**
   * Extract the relevant stat fields from a creature library record.
   * @param {object} creature Creature record.
   * @returns {Array<object>}
   */
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

  /**
   * Build the form stat list for a creature library record.
   * @param {object} creature Creature record.
   * @returns {Array<object>}
   */
  function creatureLibraryFormStats(creature) {
    return creatureLibraryStats(creature);
  }

  /**
   * Get the active health label used by the creature library UI.
   * @returns {string}
   */
  function creatureLibraryHealthLabel() {
    return currentHealthLabel || 'HP';
  }

  /**
   * Convert a stat key into a display label for the creature library.
   * @param {string} key Stat key.
   * @returns {string}
   */
  function creatureLibraryStatLabel(key) {
    if (key === 'HP') {
      return creatureLibraryHealthLabel();
    }
    return key;
  }

  /**
   * Select the best add-form stat block for a creature.
   * @param {object} creature Creature record.
   * @returns {void}
   */
  function selectAddStatBlockForCreature(creature) {
    const inferredStatBlockId = inferStatBlockIdFromStats(creatureLibraryFormStats(creature));
    const nextStatBlockId = inferredStatBlockId || getDefaultAddStatBlockId();
    setAddStatBlockId(nextStatBlockId, { preserveValues: false });
  }

  /**
   * Apply a creature library selection to the add form.
   * @param {object} creature Creature record.
   * @returns {void}
   */
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

  /**
   * Render the searchable creature library result list.
   * @returns {void}
   */
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

  /**
   * Render the detail pane for the selected creature library entry.
   * @returns {void}
   */
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
      addField('Play Health', statSummary);
    }

    libraryDetails.appendChild(fields);

  }

  /**
   * Load creature library results for the given search query.
   * @param {string} query Search text.
   * @returns {Promise<void>}
   */
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

  /**
   * Import creature library files into the campaign library.
   * @param {FileList|Array<File>} files Files to import.
   * @returns {Promise<void>}
   */
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

  /**
   * Load the active campaign and sync header state.
   * @returns {Promise<boolean>} True when a campaign is active.
   */
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
      updateCampaignUserDataFolderButtonState();
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
      updateCampaignUserDataFolderButtonState();
      campaignLiveStream.close();
      document.title = currentCampaignName ? `${currentCampaignName} - Referee` : APP_NAME;
      return false;
    }
  }

  /**
   * Open or close the party treasure panel.
   * @param {boolean} open Whether the panel should be open.
   * @returns {void}
   */
  function setPartyTreasurePanelOpen(open) {
    if (!partyTreasurePanel) return;
    partyTreasurePanel.classList.toggle('hidden', !open);
    partyTreasurePanel.setAttribute('aria-hidden', (!open).toString());
    partyTreasurePanel.classList.toggle('party-treasure-compact', open && isCompactPartyTreasureLayout());
    if (!open) {
      setPartyTreasureAddFormOpen(false);
    }
  }

  /**
   * Rebuild the party treasure item suggestions list.
   * @returns {void}
   */
  function updatePartyTreasureItemOptions() {
    partyTreasureHelpers.updateEquipmentItemOptions(partyTreasureItemOptions, equipmentLibraryItems);
  }

  /**
   * Check whether the party treasure editor should use the compact layout.
   * @returns {boolean}
   */
  function isCompactPartyTreasureLayout() {
    return window.matchMedia('(max-width: 760px)').matches;
  }

  function populatePartyTreasureAddForm(entry = null) {
    const normalized = entry
      ? partyTreasureHelpers.normalizeInventoryEntry(entry)
      : partyTreasureHelpers.normalizeInventoryEntry({}, null, false);
    if (partyTreasureAddFormName) partyTreasureAddFormName.value = normalized.name || '';
    if (partyTreasureAddFormQuantity) partyTreasureAddFormQuantity.value = String(normalized.quantity ?? 1);
    if (partyTreasureAddFormValue) partyTreasureAddFormValue.value = String(normalized.value ?? 0);
    if (partyTreasureAddFormWeight) partyTreasureAddFormWeight.value = String(normalized.weight ?? 0);
    if (partyTreasureAddFormUrl) partyTreasureAddFormUrl.value = normalized.url || '';
  }

  function applyPartyTreasurePresetToForm(itemName) {
    equipmentPresetHelpers.applyEquipmentPresetToInputs(
      {
        valueInput: partyTreasureAddFormValue,
        weightInput: partyTreasureAddFormWeight,
        urlInput: partyTreasureAddFormUrl
      },
      itemName,
      equipmentLibraryItems
    );
  }

  function updatePartyTreasureActionButtons() {
    const isAddFormOpen = Boolean(partyTreasureAddForm && !partyTreasureAddForm.classList.contains('hidden'));
    const hasSelection = Boolean(partyTreasureSelectedRow);
    const canEdit = hasSelection && !isAddFormOpen;
    const canRemove = hasSelection && !isAddFormOpen;
    if (partyTreasureAddBtn) {
      partyTreasureAddBtn.disabled = isAddFormOpen;
      partyTreasureAddBtn.setAttribute('aria-disabled', isAddFormOpen.toString());
    }
    if (partyTreasureEditBtn) {
      partyTreasureEditBtn.disabled = !canEdit;
      partyTreasureEditBtn.setAttribute('aria-disabled', (!canEdit).toString());
    }
    if (partyTreasureRemoveBtn) {
      partyTreasureRemoveBtn.disabled = !canRemove;
      partyTreasureRemoveBtn.setAttribute('aria-disabled', (!canRemove).toString());
    }
  }

  /**
   * Open or close the party treasure add-item form.
   * @param {boolean} open Whether the form should be open.
   * @param {object|null} entry Optional row data to prefill when editing.
   * @returns {void}
   */
  function setPartyTreasureAddFormOpen(open, entry = null) {
    if (!partyTreasureAddForm) return;
    partyTreasureAddForm.classList.toggle('hidden', !open);
    partyTreasureAddForm.setAttribute('aria-hidden', (!open).toString());
    partyTreasureEditingEntryId = open && entry ? (entry.id || null) : null;
    if (partyTreasureAddFormTitle) {
      partyTreasureAddFormTitle.textContent = open && entry ? 'Edit Item' : 'Add Item';
    }
    if (partyTreasureAddFormSaveBtn) {
      partyTreasureAddFormSaveBtn.textContent = open && entry ? 'Save Changes' : 'Add Item';
    }
    populatePartyTreasureAddForm(open ? entry : null);
    if (open) {
      applyPartyTreasurePresetToForm(partyTreasureAddFormName?.value || '');
    }
    updatePartyTreasureActionButtons();
  }

  /**
   * Read the party treasure add form into a draft item.
   * @returns {object|null}
   */
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
      id: partyTreasureEditingEntryId || (window.PlayerTrackerPartyTreasure?.createInventoryEntryId || partyTreasureHelpers.createInventoryEntryId)(),
      name,
      quantity,
      value,
      weight,
      url: url || null,
      containerId: null,
      isContainer: false
    };
  }

  /**
   * Get the current editable party treasure rows.
   * @returns {HTMLTableRowElement[]}
   */
  function getPartyTreasureRows() {
    return partyTreasureHelpers.getPartyTreasureRows(partyTreasureFields);
  }

  /**
   * Mark one party treasure row as selected.
   * @param {HTMLTableRowElement|null} row Row to select.
   * @returns {void}
   */
  function setSelectedPartyTreasureRow(row) {
    partyTreasureSelectedRow = row;
    if (!partyTreasureFields) return;
    getPartyTreasureRows().forEach((entryRow) => {
      entryRow.classList.toggle('selected', entryRow === row);
      entryRow.setAttribute('aria-selected', (entryRow === row).toString());
    });
    updatePartyTreasureActionButtons();
  }

  function buildPartyTreasureRowOverflowControls(entry, row) {
    const overflow = document.createElement('div');
    overflow.className = 'character-overflow inventory-row-overflow party-treasure-row-overflow';

    const overflowToggle = document.createElement('button');
    overflowToggle.type = 'button';
    overflowToggle.className = 'character-overflow-toggle';
    overflowToggle.setAttribute('aria-label', `Manage ${entry.name || 'item'}`);
    overflowToggle.setAttribute('aria-haspopup', 'menu');
    overflowToggle.setAttribute('aria-expanded', 'false');
    overflowToggle.textContent = '⋮';

    const overflowMenu = document.createElement('div');
    overflowMenu.className = 'character-overflow-menu hidden inventory-row-menu party-treasure-row-menu';
    overflowMenu.setAttribute('role', 'menu');
    overflowMenu.setAttribute('aria-hidden', 'true');
    overflowMenu.style.position = 'fixed';
    overflowMenu.style.zIndex = '10000';
    overflowMenu._overflowToggle = overflowToggle;
    document.body.appendChild(overflowMenu);

    const overflowTitle = document.createElement('div');
    overflowTitle.className = 'character-overflow-title';
    overflowTitle.textContent = entry.name || 'Item';
    overflowMenu.appendChild(overflowTitle);

    const menuSummary = document.createElement('div');
    menuSummary.className = 'inventory-row-menu-summary';

    const quantityLine = document.createElement('div');
    quantityLine.className = 'inventory-row-menu-summary-line';
    const quantityLabel = document.createElement('span');
    quantityLabel.className = 'inventory-row-menu-summary-label';
    quantityLabel.textContent = 'Qty';
    const quantityAmount = document.createElement('span');
    quantityAmount.className = 'inventory-row-menu-summary-value';
    quantityAmount.textContent = String(entry.quantity ?? 1);
    quantityLine.appendChild(quantityLabel);
    quantityLine.appendChild(quantityAmount);
    menuSummary.appendChild(quantityLine);

    const valueLine = document.createElement('div');
    valueLine.className = 'inventory-row-menu-summary-line';
    const valueLabel = document.createElement('span');
    valueLabel.className = 'inventory-row-menu-summary-label';
    valueLabel.textContent = 'Value';
    const valueAmount = document.createElement('span');
    valueAmount.className = 'inventory-row-menu-summary-value';
    valueAmount.textContent = String(Math.round(Number(entry.value ?? 0) * 100) / 100);
    valueLine.appendChild(valueLabel);
    valueLine.appendChild(valueAmount);
    menuSummary.appendChild(valueLine);

    overflowMenu.appendChild(menuSummary);

    const appendMenuButton = (label, handler, options = {}) => {
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
        closeRefereeRowOverflowMenus(overflowMenu);
        await handler();
      });
      overflowMenu.appendChild(button);
      return button;
    };

    appendMenuButton('✏️ Edit', async () => {
      setSelectedPartyTreasureRow(row);
      editSelectedPartyTreasureItem();
    });
    appendMenuButton('🗑️ Remove', async () => {
      setSelectedPartyTreasureRow(row);
      await removeSelectedPartyTreasureItem();
    }, {
      className: 'secondary danger'
    });

    const openOverflowMenu = () => {
      closeRefereeRowOverflowMenus(overflowMenu);
      overflowMenu.classList.remove('hidden');
      overflowMenu.setAttribute('aria-hidden', 'false');
      overflowToggle.setAttribute('aria-expanded', 'true');
      const centered = isNarrowPopupViewport();
      overflowMenu.classList.toggle('popup-centered', centered);
      const toggleRect = row?.getBoundingClientRect?.() || overflowToggle.getBoundingClientRect();
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

    overflowToggle.addEventListener('click', (event) => {
      event.stopPropagation();
      const isOpen = !overflowMenu.classList.contains('hidden');
      if (isOpen) {
        closeRefereeRowOverflowMenus();
      } else {
        openOverflowMenu();
      }
    });
    overflowToggle.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
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
    return overflow;
  }

  /**
   * Render the party treasure editor rows from the current item list.
   * @param {Array<object>} items Items to render.
   * @returns {void}
   */
  function buildPartyTreasureFields(items = []) {
    if (!partyTreasureFields) return;
    partyTreasureHelpers.buildPartyTreasureFields(partyTreasureFields, items, {
      itemOptionsId: 'ref-party-treasure-item-options',
      onSelect: (row) => {
        setSelectedPartyTreasureRow(row);
      },
      applyPreset: (row, itemName) => {
        partyTreasureHelpers.applyPartyTreasurePresetToRow(row, itemName, equipmentLibraryItems);
      },
      firstColumnRenderer: ({ row, entry: normalized }) => buildPartyTreasureRowOverflowControls(normalized, row)
    });
  }

  function addPartyTreasureItem() {
    setPartyTreasureAddFormOpen(true, null);
    window.requestAnimationFrame(() => {
      partyTreasureAddFormName?.focus();
      partyTreasureAddFormName?.select?.();
    });
  }

  function editSelectedPartyTreasureItem() {
    if (!partyTreasureSelectedRow) return;
    const entry = partyTreasureHelpers.getPartyTreasureRowEntry(partyTreasureSelectedRow);
    if (!entry) return;
    setPartyTreasureAddFormOpen(true, entry);
    window.requestAnimationFrame(() => {
      partyTreasureAddFormName?.focus();
      partyTreasureAddFormName?.select?.();
    });
  }

  function findPartyTreasureRowById(entryId) {
    if (!entryId || !partyTreasureFields) return null;
    return getPartyTreasureRows().find((row) => row.dataset.inventoryEntryId === entryId) || null;
  }

  /**
   * Remove the currently selected party treasure row.
   * @returns {Promise<void>}
   */
  async function removeSelectedPartyTreasureItem() {
    if (!partyTreasureSelectedRow) return;
    const rowName = (partyTreasureSelectedRow.querySelector('input[data-inventory-field="name"]')?.value || '').trim() || 'Item';
    const items = partyTreasureHelpers.removePartyTreasureEntry(
      currentPartyTreasure,
      partyTreasureSelectedRow.dataset.inventoryEntryId || ''
    );
    try {
      const updatedCampaign = await savePartyTreasureItems(items);
      currentPartyTreasure = Array.isArray(updatedCampaign?.partyTreasure)
        ? updatedCampaign.partyTreasure
        : items;
      buildPartyTreasureFields(currentPartyTreasure);
      setSelectedPartyTreasureRow(getPartyTreasureRows()[0] || null);
    } catch (err) {
      if (statusDiv) {
        statusDiv.textContent = `Party treasure remove failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
  }

  /**
   * Commit the add-form draft item into the party treasure list.
   * @returns {void}
   */
  async function commitPartyTreasureAddFormItem() {
    if (!partyTreasureFields) return;
    let entry;
    try {
      entry = collectPartyTreasureDraftFromForm();
    } catch (err) {
      if (statusDiv) statusDiv.textContent = err instanceof Error ? err.message : String(err);
      return;
    }
    const items = partyTreasureHelpers.upsertPartyTreasureEntry(currentPartyTreasure, entry);
    try {
      const updatedCampaign = await savePartyTreasureItems(items);
      currentPartyTreasure = Array.isArray(updatedCampaign?.partyTreasure)
        ? updatedCampaign.partyTreasure
        : items;
      buildPartyTreasureFields(currentPartyTreasure);
      setSelectedPartyTreasureRow(findPartyTreasureRowById(entry.id) || getPartyTreasureRows()[0] || null);
      setPartyTreasureAddFormOpen(false);
      if (statusDiv) {
        statusDiv.textContent = `Saved ${entry.name}.`;
      }
    } catch (err) {
      if (statusDiv) {
        statusDiv.textContent = `Party treasure save failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
  }

  /**
   * Save the party treasure editor contents back to the server.
   * @returns {Promise<void>}
   */
  async function savePartyTreasureItems(items) {
    if (!activeCampaignId) return null;
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
    return updatedCampaign;
  }

  /**
   * Open the party treasure editor modal and refresh its contents.
   * @returns {Promise<void>}
   */
  async function openPartyTreasureEditor() {
    if (!partyTreasureFields) return;
    if (partyTreasureDialogTitle) {
      partyTreasureDialogTitle.textContent = '💰 Party Treasure';
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
      partyTreasureAddBtn?.focus();
    });
  }

  /**
   * Close the party treasure editor modal.
   * @returns {void}
   */
  function closePartyTreasureEditor() {
    partyTreasureSelectedRow = null;
    if (partyTreasureDialogTitle) {
      partyTreasureDialogTitle.textContent = '💰 Party Treasure';
    }
    if (partyTreasureContext) {
      partyTreasureContext.classList.add('hidden');
      partyTreasureContext.setAttribute('aria-hidden', 'true');
    }
    if (partyTreasureFields) {
      partyTreasureFields.innerHTML = '';
    }
    setPartyTreasureAddFormOpen(false);
    setPartyTreasurePanelOpen(false);
  }

  /**
   * Load the condition library used by the referee editor.
   * @returns {Promise<void>}
   */
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
          label: statKeys.length === 1 ? statKeys[0] : 'Health',
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
      currencySystem = inventoryView.normalizeCurrencySystem
        ? inventoryView.normalizeCurrencySystem(json?.currency)
        : null;
      if (!currencySystem) {
        closeCurrencyViewer();
      }
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
      currencySystem = null;
      closeCurrencyViewer();
      closeInventoryViewer();
      statKeys = ['HP'];
      setStatAliases(null);
      statBlockDefinitions = [];
      statBlockLookup = new Map();
      addStatBlockDefinitions = [{
        id: 'default',
        label: statKeys.length === 1 ? statKeys[0] : 'Health',
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

  /**
   * Normalize equipment library entries into the internal shape.
   * @param {Array<object>} items Raw equipment items.
   * @returns {Array<object>}
   */
  function normalizeEquipmentItems(items) {
    return partyTreasureHelpers.normalizeEquipmentItems(items);
  }

  /**
   * Load the equipment library used by party treasure and add forms.
   * @returns {Promise<void>}
   */
  async function loadEquipmentLibrary() {
    if (equipmentLibraryLoading) {
      return equipmentLibraryItems;
    }
    if (equipmentLibraryLoaded) {
      return equipmentLibraryItems;
    }
    equipmentLibraryLoading = true;
    try {
      const response = await fetch('/equipment-library?limit=0');
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

  function setCurrencyPanelOpen(open) {
    if (!currencyPanel) return;
    currencyPanel.classList.toggle('hidden', !open);
    currencyPanel.setAttribute('aria-hidden', (!open).toString());
  }

  function setInventoryPanelOpen(open) {
    if (!inventoryPanel) return;
    inventoryPanel.classList.toggle('hidden', !open);
    inventoryPanel.setAttribute('aria-hidden', (!open).toString());
  }

  function normalizeInventoryEntry(entry = {}, containerId = null, isContainer = false) {
    const normalizedContainerId =
      typeof entry.containerId === 'string' && entry.containerId.trim()
        ? entry.containerId.trim()
        : containerId;
    return {
      id: typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : (window.PlayerTrackerInventoryIds?.createInventoryEntryId?.() || `inventory-${Date.now().toString(36)}`),
      name: typeof entry.name === 'string' ? entry.name : '',
      quantity: Number.isFinite(entry.quantity) ? entry.quantity : 1,
      value: Number.isFinite(entry.value) ? entry.value : 0,
      weight: Number.isFinite(entry.weight) ? entry.weight : 0,
      url: typeof entry.url === 'string' && entry.url.trim() ? entry.url.trim() : null,
      containerId: normalizedContainerId,
      isContainer: typeof entry.isContainer === 'boolean' ? entry.isContainer : isContainer
    };
  }

  function buildCurrencyFields(character) {
    if (!currencyFields || !inventoryView.buildCurrencyFields) return;
    inventoryView.buildCurrencyFields(currencyFields, character, currencySystem, {
      readOnly: true,
      inputIdPrefix: 'ref-currency'
    });
  }

  function formatCharacterCurrencyTotal(character) {
    return inventoryView.formatCurrencyTotal
      ? inventoryView.formatCurrencyTotal(character, currencySystem)
      : null;
  }

  function closeCurrencyViewer() {
    currencyViewerCharacterId = null;
    if (currencyDialogTitle) {
      currencyDialogTitle.textContent = '🪙 Money';
    }
    if (currencySummary) {
      currencySummary.textContent = 'Money for —';
    }
    if (currencyFields) {
      currencyFields.innerHTML = '';
    }
    setCurrencyPanelOpen(false);
  }

  function closeInventoryViewer() {
    inventoryViewerCharacterId = null;
    currentInventory = [];
    if (inventoryDialogTitle) {
      inventoryDialogTitle.textContent = '🎒 Inventory';
    }
    if (inventorySummary) {
      inventorySummary.textContent = 'Inventory for —';
    }
    if (inventoryFields) {
      inventoryFields.innerHTML = '';
    }
    if (inventoryContainerSections) {
      inventoryContainerSections.innerHTML = '';
    }
    if (inventoryTotalWeight) {
      inventoryTotalWeight.textContent = 'Total weight carried: 0';
    }
    setInventoryPanelOpen(false);
  }

  function formatInventoryMenuNumber(value) {
    const rounded = Math.round(Number(value) * 100) / 100;
    return Number.isFinite(rounded) ? String(rounded) : '0';
  }

  function buildInventoryInfoControl(entry = {}, row = null) {
    const overflow = document.createElement('div');
    overflow.className = 'character-overflow inventory-row-overflow';

    const overflowToggle = document.createElement('button');
    overflowToggle.type = 'button';
    overflowToggle.className = 'character-overflow-toggle inventory-row-info-toggle';
    overflowToggle.setAttribute('aria-label', `Show info for ${entry.name || 'item'}`);
    overflowToggle.setAttribute('aria-haspopup', 'menu');
    overflowToggle.setAttribute('aria-expanded', 'false');
    overflowToggle.textContent = entry.isContainer ? '🧳' : '🗡';

    const overflowMenu = document.createElement('div');
    overflowMenu.className = 'character-overflow-menu referee-row-menu inventory-row-info-menu hidden';
    overflowMenu.setAttribute('role', 'menu');
    overflowMenu.setAttribute('aria-hidden', 'true');
    overflowMenu.style.position = 'fixed';
    overflowMenu.style.zIndex = '10000';
    overflowMenu._overflowToggle = overflowToggle;
    document.body.appendChild(overflowMenu);

    const overflowTitle = document.createElement('div');
    overflowTitle.className = 'character-overflow-title';
    overflowTitle.textContent = entry.name || 'Item';
    overflowMenu.appendChild(overflowTitle);

    const menuSummary = document.createElement('div');
    menuSummary.className = 'inventory-row-menu-summary';

    const valueLine = document.createElement('div');
    valueLine.className = 'inventory-row-menu-summary-line';
    const valueLabel = document.createElement('span');
    valueLabel.className = 'inventory-row-menu-summary-label';
    valueLabel.textContent = 'Value';
    const valueAmount = document.createElement('span');
    valueAmount.className = 'inventory-row-menu-summary-value';
    valueAmount.textContent = formatInventoryMenuNumber(entry.value ?? 0);
    valueLine.appendChild(valueLabel);
    valueLine.appendChild(valueAmount);
    menuSummary.appendChild(valueLine);

    const weightLine = document.createElement('div');
    weightLine.className = 'inventory-row-menu-summary-line';
    const weightLabel = document.createElement('span');
    weightLabel.className = 'inventory-row-menu-summary-label';
    weightLabel.textContent = 'Weight';
    const weightAmount = document.createElement('span');
    weightAmount.className = 'inventory-row-menu-summary-value';
    weightAmount.textContent = formatInventoryMenuNumber(entry.weight ?? 0);
    weightLine.appendChild(weightLabel);
    weightLine.appendChild(weightAmount);
    menuSummary.appendChild(weightLine);
    overflowMenu.appendChild(menuSummary);

    const appendMenuButton = (label, handler, options = {}) => {
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
        closeRefereeRowOverflowMenus(overflowMenu);
        await handler();
      });
      overflowMenu.appendChild(button);
      return button;
    };

    appendMenuButton('📦 Send to Party Treasure', async () => {
      await sendSelectedInventoryEntryToPartyTreasure();
    }, {
      hidden: entry.isContainer || !inventoryViewerCharacterId
    });
    appendMenuButton('🗑️ Remove', async () => {
      await removeSelectedInventoryEntry();
    }, {
      className: 'secondary danger',
      hidden: !inventoryViewerCharacterId
    });

    const openOverflowMenu = () => {
      closeRefereeRowOverflowMenus(overflowMenu);
      overflowMenu.classList.remove('hidden');
      overflowMenu.setAttribute('aria-hidden', 'false');
      overflowToggle.setAttribute('aria-expanded', 'true');
      const centered = isNarrowPopupViewport();
      overflowMenu.classList.toggle('popup-centered', centered);
      const toggleRect = row?.getBoundingClientRect?.() || overflowToggle.getBoundingClientRect();
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

    overflowToggle.addEventListener('click', (event) => {
      event.stopPropagation();
      const isOpen = !overflowMenu.classList.contains('hidden');
      if (isOpen) {
        closeRefereeRowOverflowMenus();
      } else {
        openOverflowMenu();
      }
    });
    overflowToggle.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
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
    return overflow;
  }

  function buildInventoryFields(character) {
    if (!inventoryFields || !inventoryContainerSections || !inventoryView.appendInventoryDisplayRow) return;
    const inventoryItems = Array.isArray(character?.inventory)
      ? character.inventory.map((entry) => normalizeInventoryEntry(entry)).filter(Boolean)
      : [];
    currentInventory = inventoryItems;
    if (inventoryDialogTitle) {
      inventoryDialogTitle.textContent = `🎒 Inventory - ${character?.name || 'Character'}`;
    }
    if (inventorySummary) {
      inventorySummary.textContent = `Inventory for ${character?.name || 'Character'}`;
    }
    inventoryFields.innerHTML = '';
    inventoryContainerSections.innerHTML = '';
    const rootEntries = inventoryItems.filter((entry) => !entry.isContainer && !entry.containerId);
    const containerEntries = inventoryItems.filter((entry) => entry.isContainer && !entry.containerId);
    const containerLabels = inventoryView.buildInventoryContainerDisplayLabels
      ? inventoryView.buildInventoryContainerDisplayLabels(containerEntries)
      : new Map();
    const firstColumnRenderer = ({ row, entry }) => buildInventoryInfoControl(entry, row);
    rootEntries.forEach((entry) => {
      inventoryView.appendInventoryDisplayRow(inventoryFields, entry, {
        rowClassName: 'inventory-entry-display',
        firstColumnRenderer
      });
    });
    containerEntries.forEach((entry) => {
      inventoryView.buildInventoryContainerSection(entry, inventoryItems, {
        displayLabel: containerLabels.get(entry.id) || entry.name || 'Container',
        containerLabels,
        containerSectionsEl: inventoryContainerSections,
        firstColumnRenderer
      });
    });
    if (inventoryTotalWeight) {
      const totalWeight = inventoryView.calculateInventoryTotalWeight
        ? inventoryView.calculateInventoryTotalWeight(inventoryItems)
        : 0;
      const formattedTotal = Number.isInteger(totalWeight)
        ? String(totalWeight)
        : String(Math.round(totalWeight * 1000) / 1000);
      inventoryTotalWeight.textContent = `Total weight carried: ${formattedTotal}`;
    }
  }

  function getInventoryViewerCharacter() {
    if (!inventoryViewerCharacterId) return null;
    return currentPlayers.find((player) => player.id === inventoryViewerCharacterId) || null;
  }

  async function removeSelectedInventoryEntry() {
    if (!inventoryViewerCharacterId || !inventorySelectedRow) return;
    const player = getInventoryViewerCharacter();
    if (!player) return;
    const rowData = getInventoryRowData(inventorySelectedRow) || {};
    const entry = currentInventory.find((item) => item && item.id === rowData.id) || null;
    const rowName = (entry?.name || inventorySelectedRow.querySelector('input[data-inventory-field="name"]')?.value || '').trim() || 'Item';
    const items = inventoryRemovalHelpers.removeInventoryEntry(currentInventory, rowData.id || '', {
      moveContainedItems: false
    });
    try {
      const nextPlayer = {
        ...player,
        inventory: items
      };
      const savedPlayer = await saveCharacterEntry(nextPlayer);
      if (!savedPlayer) return;
      currentInventory = Array.isArray(savedPlayer.inventory) ? savedPlayer.inventory : items;
      buildInventoryFields(savedPlayer);
      if (statusDiv) {
        statusDiv.textContent = `Removed ${rowName}.`;
      }
    } catch (err) {
      if (statusDiv) {
        statusDiv.textContent = `Inventory remove failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
  }

  async function sendSelectedInventoryEntryToPartyTreasure() {
    if (!inventoryViewerCharacterId || !inventorySelectedRow || !activeCampaignId) return;
    const player = getInventoryViewerCharacter();
    if (!player) return;
    const rowData = getInventoryRowData(inventorySelectedRow) || {};
    const entry = currentInventory.find((item) => item && item.id === rowData.id) || null;
    if (!rowData.id || !entry) return;
    if (entry.isContainer) {
      if (statusDiv) {
        statusDiv.textContent = 'Send to Party Treasure only works for items, not containers.';
      }
      return;
    }
    const originalInventory = currentInventory.map((item) => inventoryTransferHelpers.normalizeTransferEntry(item));
    const originalPartyTreasure = currentPartyTreasure.map((item) => partyTreasureHelpers.normalizeInventoryEntry(item));
    const transfer = inventoryTransferHelpers.transferEntry({
      sourceItems: currentInventory,
      destinationItems: currentPartyTreasure,
      entryId: rowData.id,
      mapTransferredEntry: (item) => ({
        ...item,
        containerId: null,
        isContainer: false
      }),
      removeFromSource: true
    });
    if (!transfer.transferredEntry) {
      return;
    }
    try {
      const updatedCampaign = await savePartyTreasureItems(transfer.destinationItems);
      if (!updatedCampaign) {
        return;
      }
      const nextPlayer = {
        ...player,
        inventory: transfer.sourceItems
      };
      const savedPlayer = await saveCharacterEntry(nextPlayer);
      if (!savedPlayer) {
        currentPartyTreasure = originalPartyTreasure;
        await savePartyTreasureItems(originalPartyTreasure);
        await loadState();
        return;
      }
      currentPartyTreasure = Array.isArray(updatedCampaign?.partyTreasure)
        ? updatedCampaign.partyTreasure
        : transfer.destinationItems;
      currentInventory = Array.isArray(savedPlayer.inventory) ? savedPlayer.inventory : transfer.sourceItems;
      buildPartyTreasureFields(currentPartyTreasure);
      buildInventoryFields(savedPlayer);
      if (statusDiv) {
        statusDiv.textContent = `Sent ${entry.name || 'Item'} to party treasure.`;
      }
    } catch (err) {
      currentPartyTreasure = originalPartyTreasure;
      await savePartyTreasureItems(originalPartyTreasure);
      await loadState();
      if (statusDiv) {
        statusDiv.textContent = `Send to party treasure failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
  }

  async function openCurrencyViewer(player) {
    if (!player || !currencySystem || !currencyFields) return;
    closeRefereeRowOverflowMenus();
    closeInventoryViewer();
    currencyViewerCharacterId = player.id;
    if (currencyDialogTitle) {
      currencyDialogTitle.textContent = `🪙 Money - ${player.name || 'Character'}`;
    }
    if (currencySummary) {
      currencySummary.textContent = `Money for ${player.name || 'Character'}`;
    }
    buildCurrencyFields(player);
    setCurrencyPanelOpen(true);
    window.requestAnimationFrame(() => {
      currencyCloseBtn?.focus();
    });
  }

  async function openInventoryViewer(player) {
    if (!player || !inventoryFields) return;
    closeRefereeRowOverflowMenus();
    closeCurrencyViewer();
    inventoryViewerCharacterId = player.id;
    buildInventoryFields(player);
    setInventoryPanelOpen(true);
    window.requestAnimationFrame(() => {
      inventoryCloseBtn?.focus();
    });
  }

  /**
   * Apply a fresh campaign state snapshot to the referee view.
   * @param {object} state Campaign state payload.
   * @returns {void}
   */
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
    if (selectedCharacterId) {
      const updated = currentPlayers.find((p) => p.id === selectedCharacterId);
      if (updated) {
        if (!detailsDirty && !conditionsDirty) {
          setSelectedCharacter(updated);
        }
      } else {
        clearSelectedCharacter();
      }
    }
    if (statusDiv) {
      statusDiv.textContent = '';
    }
    if (currencyViewerCharacterId) {
      const updatedMoneyCharacter = currentPlayers.find((player) => player.id === currencyViewerCharacterId);
      if (updatedMoneyCharacter) {
        buildCurrencyFields(updatedMoneyCharacter);
      } else {
        closeCurrencyViewer();
      }
    }
    if (inventoryViewerCharacterId) {
      const updatedInventoryCharacter = currentPlayers.find((player) => player.id === inventoryViewerCharacterId);
      if (updatedInventoryCharacter) {
        buildInventoryFields(updatedInventoryCharacter);
      } else {
        closeInventoryViewer();
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

  /**
   * Load the latest campaign state from the server.
   * @returns {Promise<void>}
   */
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

  /**
   * Sync the encounter control buttons with the active state.
   * @returns {void}
   */
  function updateTurnControls() {
    if (!turnCompleteBtn) return;
    const enabled = encounterState === 'active';
    turnCompleteBtn.classList.toggle('hidden', !enabled);
    turnCompleteBtn.disabled = !enabled;
    turnCompleteBtn.setAttribute('aria-disabled', (!enabled).toString());
    turnCompleteBtn.setAttribute('aria-hidden', (!enabled).toString());
    if (encounterNewBtn) {
      const isNew = encounterState === 'new';
      encounterNewBtn.disabled = isNew;
      encounterNewBtn.setAttribute('aria-disabled', isNew.toString());
    }
    if (encounterStartBtn) {
      const isActive = encounterState === 'active';
      const isSuspended = encounterState === 'suspended';
      encounterStartBtn.textContent = isSuspended ? '🟢 Resume Encounter' : '🟢 Start Encounter';
      encounterStartBtn.disabled = isActive;
      encounterStartBtn.setAttribute('aria-disabled', isActive.toString());
    }
    if (encounterSuspendBtn) {
      const isSuspended = encounterState === 'suspended';
      encounterSuspendBtn.disabled = isSuspended;
      encounterSuspendBtn.setAttribute('aria-disabled', isSuspended.toString());
    }
  }

  /**
   * Post an encounter action to the server and refresh state.
   * @param {string} path Encounter route path.
   * @returns {Promise<void>}
   */
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

  /**
   * Return the display name for the character controller.
   * @param {object} character Character record.
   * @returns {string}
   */
  function getCharacterControllerName(character) {
    if (!character) return '';
    const claimedDisplayName = typeof character.claimedDisplayName === 'string'
      ? character.claimedDisplayName.trim()
      : '';
    if (claimedDisplayName) return claimedDisplayName;
    if (character.isReferee) return 'Referee';
    return '';
  }

  /**
   * Check whether popup menus should use the compact centered layout.
   * @returns {boolean}
   */
  function isNarrowPopupViewport() {
    return true;
  }

  /**
   * Close every referee row overflow menu except the optional one.
   * @param {HTMLElement|null} [exceptMenu=null] Menu to keep open.
   * @returns {void}
   */
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

  /**
   * Close all transient referee panels and popovers.
   * @returns {void}
   */
  function closeTransientRefereePanels() {
    closeOverflowMenu();
    closeRefereeRowOverflowMenus();
    closeExpandedOrderStats();
    closeInitiativeEditor();
    closeCurrencyViewer();
    closeInventoryViewer();
    hideAddForm();
    closeCampaignSettingsModal();
    closePartyTreasureEditor();
    clearSelectedCharacter();
  }

  function closeOpenRefereeModalOverlay() {
    if (playerNameEdit && playerNameEdit.classList.contains('visible')) {
      if (playerNameCancelBtn) {
        playerNameCancelBtn.click();
      } else {
        showPlayerNameEdit(false);
      }
      return true;
    }
    if (campaignSettingsModal && !campaignSettingsModal.classList.contains('hidden')) {
      closeCampaignSettingsModal();
      return true;
    }
    if (conditionsPanel && conditionsPanel.classList.contains('conditions-panel-open') && !conditionsPanel.classList.contains('hidden')) {
      if (conditionsCancelBtn) {
        conditionsCancelBtn.click();
      } else {
        setConditionsPanelOpen(false);
      }
      return true;
    }
    if (form && !form.classList.contains('hidden')) {
      if (addCancelBtn) {
        addCancelBtn.click();
      } else {
        hideAddForm();
      }
      return true;
    }
    if (detailsPanel && detailsPanel.classList.contains('details-panel-open') && !detailsPanel.classList.contains('hidden')) {
      if (detailsCancelBtn) {
        detailsCancelBtn.click();
      } else {
        setDetailsPanelOpen(false);
      }
      return true;
    }
    if (initiativeModal && !initiativeModal.classList.contains('hidden')) {
      if (initiativeModalCancelBtn) {
        initiativeModalCancelBtn.click();
      } else {
        closeInitiativeEditor();
      }
      return true;
    }
    if (partyTreasurePanel && !partyTreasurePanel.classList.contains('hidden')) {
      if (partyTreasureCancelBtn) {
        partyTreasureCancelBtn.click();
      } else {
        closePartyTreasureEditor();
      }
      return true;
    }
    if (currencyPanel && !currencyPanel.classList.contains('hidden')) {
      if (currencyCloseBtn) {
        currencyCloseBtn.click();
      } else {
        closeCurrencyViewer();
      }
      return true;
    }
    if (inventoryPanel && !inventoryPanel.classList.contains('hidden')) {
      if (inventoryCloseBtn) {
        inventoryCloseBtn.click();
      } else {
        closeInventoryViewer();
      }
      return true;
    }
    return false;
  }

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    if (
      event.target.closest(
        'button, input, select, textarea, a, label, .character-overflow, .referee-row-menu, .player-name-edit, .conditions-modal, .details-panel-collapsed, .conditions-panel-collapsed'
      )
    ) {
      return;
    }
    closeTransientRefereePanels();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (closeOpenRefereeModalOverlay()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    let handled = false;
    const hasOpenOverflow = document.querySelector('.referee-row-menu:not(.hidden)');
    const hasOpenStats = Boolean(expandedOrderStatsCharacterId);
    const hasOpenInitiative = Boolean(initiativeEditorCharacterId);
    const hasOpenCurrency = Boolean(currencyViewerCharacterId);
    const hasOpenInventory = Boolean(inventoryViewerCharacterId);
    if (hasOpenOverflow) {
      closeRefereeRowOverflowMenus();
      handled = true;
    }
    if (hasOpenStats) {
      closeExpandedOrderStats();
      handled = true;
    }
    if (hasOpenInitiative) {
      handled = true;
      void (async () => {
        if (!(await confirmDiscardInitiativeChanges())) return;
        closeInitiativeEditor();
      })();
    }
    if (hasOpenCurrency) {
      closeCurrencyViewer();
      handled = true;
    }
    if (hasOpenInventory) {
      closeInventoryViewer();
      handled = true;
    }
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  });

  /**
   * Collapse any expanded encounter stat popovers.
   * @returns {void}
   */
  function closeExpandedOrderStats() {
    if (!expandedOrderStatsCharacterId) return;
    expandedOrderStatsCharacterId = null;
    if (currentPlayers.length > 0) {
      renderTurnTable(currentPlayers, currentTurnId);
    }
  }

  /**
   * Close the initiative editor modal.
   * @returns {void}
   */
  function closeInitiativeEditor() {
    initiativeEditorCharacterId = null;
    initiativeEditorOriginalValue = '';
    if (initiativeModal) {
      initiativeModal.classList.add('hidden');
      initiativeModal.setAttribute('aria-hidden', 'true');
      initiativeModal.classList.remove('popup-centered');
    }
  }

  /**
   * Open the initiative editor modal for a character.
   * @param {object} player Character record.
   * @returns {void}
   */
  function openInitiativeEditor(player) {
    if (!player || !initiativeModal || !initiativeModalInput) return;
    closeRefereeRowOverflowMenus();
    closeExpandedOrderStats();
    initiativeEditorCharacterId = player.id;
    if (initiativeModalTitle) {
      initiativeModalTitle.textContent = '🎲 Edit Initiative';
    }
    if (initiativeModalCharacter) {
      initiativeModalCharacter.textContent = player.name || 'Character';
    }
    initiativeEditorOriginalValue = Number.isFinite(player.initiative) ? String(player.initiative) : '';
    if (initiativeModalRollBtn) {
      const hasInitiative = Number.isFinite(player.initiative);
      initiativeModalRollBtn.classList.toggle('hidden', hasInitiative);
      initiativeModalRollBtn.setAttribute('aria-hidden', hasInitiative.toString());
    }
    initiativeModalInput.value = initiativeEditorOriginalValue;
    initiativeModal.classList.toggle('popup-centered', isNarrowPopupViewport());
    initiativeModal.classList.remove('hidden');
    initiativeModal.setAttribute('aria-hidden', 'false');
    window.requestAnimationFrame(() => {
      initiativeModalInput.focus();
      initiativeModalInput.select();
    });
  }

  /**
   * Save the initiative editor value back to the selected character.
   * @returns {Promise<void>}
   */
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

  /**
   * Confirm that unsaved initiative edits should be discarded.
   * @returns {Promise<boolean>} True if the editor can close, false if the user cancelled.
   */
  async function confirmDiscardInitiativeChanges() {
    if (!initiativeModalInput) return true;
    const currentValue = initiativeModalInput.value.trim();
    if (currentValue === initiativeEditorOriginalValue) return true;
    const discard = await showConfirmDialog({
      title: 'Discard Changes?',
      header: 'You have unsaved initiative changes.',
      message: 'Choose Discard Changes to lose them, or Resume Editing to keep working.',
      confirmLabel: 'Discard Changes',
      cancelLabel: 'Resume Editing',
      confirmButtonClass: 'danger',
      initialFocus: 'cancel'
    });
    return Boolean(discard);
  }

  /**
   * Toggle the expanded stat details for a turn-order row.
   * @param {string} characterId Character id to expand or collapse.
   * @returns {void}
   */
  function toggleExpandedOrderStats(characterId) {
    expandedOrderStatsCharacterId =
      expandedOrderStatsCharacterId === characterId ? null : characterId;
    if (currentPlayers.length > 0) {
      renderTurnTable(currentPlayers, currentTurnId);
    }
  }

  /**
   * Build the popover that shows editable encounter stats for a row.
   * @param {object} character Character record.
   * @param {string[]} displayStatKeys Stat keys to render.
   * @returns {HTMLElement}
   */
  function buildOrderStatsPopover(character, displayStatKeys) {
    const stats = Array.isArray(character.stats) ? character.stats : [];
    const statsByKey = new Map(stats.map((stat) => [stat.key, stat]));
    const popover = document.createElement('div');
    popover.className = 'player-row-stats-popover character-stats';
    if (isNarrowPopupViewport()) {
      popover.classList.add('popup-centered');
    }
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-label', `${character.name || 'character'} health controls`);
    popover.addEventListener('click', (event) => {
      event.stopPropagation();
    });

    const heading = document.createElement('div');
    heading.className = 'player-row-stats-heading';
    heading.textContent = `❤️ Health: ${character.name || 'Character'}`;
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

  function createEncounterIcon(emoji, className) {
    const icon = document.createElement('span');
    icon.className = `encounter-icon ${className || ''}`.trim();
    icon.textContent = emoji;
    icon.setAttribute('aria-hidden', 'true');
    return icon;
  }

  /**
   * Build the referee row overflow menu for a character in the encounter table.
   * @param {object} player Character record.
   * @param {object} [options]
   * @param {HTMLElement|null} [options.anchorEl=null] Element used to position the menu.
   * @returns {{overflow: HTMLElement, openOverflowMenu: Function}}
   */
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

    const currencyTotal = formatCharacterCurrencyTotal(player);
    const groupMembers = getInitiativeGroupMembers(player);
    const characterVisibilityMenuItems = refereeVisibilityHelpers.getCharacterVisibilityMenuItems(Boolean(player.isHidden));
    const groupVisibilityMenuItems = refereeVisibilityHelpers.getInitiativeGroupVisibilityMenuItems(groupMembers, Boolean(player.isHidden));
    const menuGroups = [
      [
        {
          label: '⚡ Act Now',
          handler: () => {
            setTurnNow(player.id);
          },
          options: {
            disabled: encounterState !== 'active'
          }
        }
      ],
      [
        ...characterVisibilityMenuItems.map((item) => ({
          label: item.label,
          handler: async () => {
            await updateVisibility(player.id, item.isHidden, item.revealOnTurn);
          },
          options: {
            hidden: !player.isReferee,
            disabled: !player.isReferee
          }
        })),
        ...groupVisibilityMenuItems.map((item) => ({
          label: item.label,
          handler: async () => {
            await updateGroupVisibility(player, item.isHidden, item.revealOnTurn);
          },
          options: {
            hidden: !player.isReferee || groupMembers.length <= 1,
            disabled: !player.isReferee || groupMembers.length <= 1
          }
        })),
        {
          label: '📖 Open Reference',
          handler: () => openCharacterReference(player),
          options: {
            hidden: !player.referenceUrl
          }
        },
        {
          label: currencyTotal ? `🪙 Money: ${currencyTotal}` : '🪙 Money',
          handler: async () => {
            await openCurrencyViewer(player);
          },
          options: {
            hidden: player.isReferee || !(currencySystem && Array.isArray(currencySystem.units) && currencySystem.units.length > 0)
          }
        },
        {
          label: '🎒 Inventory',
          handler: async () => {
            await openInventoryViewer(player);
          },
          options: {
            hidden: player.isReferee
          }
        }
      ],
      [
        {
          label: '✏️ Edit Character',
          handler: async () => {
            if (detailsDirty) {
              const discard = await confirmDiscardUnsavedDetails();
              if (!discard) return;
            }
            if (conditionsDirty) {
              const discard = await confirmDiscardUnsavedConditions();
              if (!discard) return;
              setConditionsPanelOpen(false);
            }
            setSelectedCharacter(player);
            setDetailsPanelOpen(true);
          }
        },
        {
          label: '🏷️ Claim Character',
          handler: async () => {
            await claimCharacter(player);
          },
          options: {
            hidden: Boolean(player.isReferee) || Boolean(player.claimedSessionId)
          }
        },
        {
          label: player.isReferee ? '↩️ Release to Pool' : '↩️ Release Character',
          handler: async () => {
            if (player.isReferee) {
              await releaseCharacterToPool(player);
              return;
            }
            await forceReleaseCharacter(player);
          },
          options: {
            hidden: !Boolean(player.claimedSessionId) && !player.isReferee
          }
        },
        {
          label: '🗑️ Remove Character',
          handler: async () => {
            const confirmed = await showConfirmDialog({
              title: 'Remove Character?',
              header: player.name || 'This character',
              message: 'Remove this character from the tracker?',
              confirmLabel: 'Remove Character',
              cancelLabel: 'Keep Character',
              confirmButtonClass: 'danger',
              initialFocus: 'cancel'
            });
            if (!confirmed) return;
            await deleteCharacter(player.id);
          },
          options: {
            className: 'secondary character-remove'
          }
        }
      ]
    ];

    let appendedGroup = false;
    menuGroups.forEach((group) => {
      const visibleItems = group.filter((item) => !item.options?.hidden);
      if (visibleItems.length === 0) return;
      if (appendedGroup) {
        appendOverflowMenuSeparator(overflowMenu);
      }
      visibleItems.forEach((item) => {
        addMenuItem(item.label, item.handler, item.options || {});
      });
      appendedGroup = true;
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
    return { overflow, openOverflowMenu };
  }

  /**
   * Render the referee encounter turn table.
   * @param {Array<object>} players Characters to render.
   * @param {string|null} currentTurnId Active turn id.
   * @returns {void}
   */
  function renderTurnTable(players, currentTurnId) {
    if (!playersBody) return;
    document.querySelectorAll('.referee-row-menu').forEach((menu) => menu.remove());
    playersBody.innerHTML = '';
    if (players.length === 0) {
      playersBody.appendChild(createEmptyEncounterRow(4));
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
      if (!p.isReferee) {
        initTd.classList.add('init-mine');
      }

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
        const statsContent = document.createElement('div');
        statsContent.className = 'stats-cell-content';
        const statsInner = document.createElement('div');
        statsInner.className = 'stats-cell-text';
        const statItems = formatEncounterStatsItems(orderedStats, statKeys);
        statsContent.appendChild(createEncounterIcon('❤️', 'encounter-icon-health'));
        statItems.forEach((stat) => {
          const valueLine = document.createElement('div');
          valueLine.textContent = formatEncounterStatLine(stat);
          statsInner.appendChild(valueLine);
        });
        statsContent.appendChild(statsInner);
        hpTd.appendChild(statsContent);
        if (p.id === expandedOrderStatsCharacterId) {
          const statsPopover = buildOrderStatsPopover(p, statKeys);
          hpTd.appendChild(statsPopover);
        }
      } else {
        hpTd.textContent = '—';
      }
      if (statusInfo) {
        hpTd.style.cursor = 'pointer';
        hpTd.setAttribute('role', 'button');
        hpTd.setAttribute('tabindex', '0');
        hpTd.setAttribute('aria-label', `Edit health for ${p.name || 'character'}`);
        hpTd.addEventListener('click', (event) => {
          event.stopPropagation();
          closeRefereeRowOverflowMenus();
          toggleExpandedOrderStats(p.id);
        });
        hpTd.addEventListener('keydown', (event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
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
      const conditionsContent = document.createElement('div');
      conditionsContent.className = 'conditions-cell-content';
      const conditionIcon = createEncounterIcon('🩸', 'encounter-icon-conditions');
      const conditionsInner = document.createElement('div');
      conditionsInner.className = 'conditions-cell-text';
      conditionsContent.appendChild(conditionIcon);
      if (list) {
        conditionsInner.appendChild(list);
      } else {
        conditionsInner.textContent = '—';
      }
      conditionsContent.appendChild(conditionsInner);
      conditionsTd.appendChild(conditionsContent);
      conditionsTd.style.cursor = 'pointer';
      conditionsTd.setAttribute('role', 'button');
      conditionsTd.setAttribute('tabindex', '0');
      conditionsTd.setAttribute('aria-label', `Edit conditions for ${p.name || 'character'}`);
      conditionsTd.addEventListener('click', (event) => {
        if (!(event.target instanceof Element)) return;
        if (event.target.closest('a')) return;
        event.stopPropagation();
        void openConditionsEditorForCharacter(p);
      });
      conditionsTd.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.stopPropagation();
        void openConditionsEditorForCharacter(p);
      });

      tr.appendChild(initTd);
      tr.appendChild(nameTd);
      tr.appendChild(hpTd);
      tr.appendChild(conditionsTd);
      playersBody.appendChild(tr);
    });
  }

  /**
   * Clamp a stat's current value to the allowed range.
   * @param {number} value Proposed current value.
   * @param {number} maxValue Stat maximum.
   * @returns {number}
   */
  function clampCurrentStat(value, maxValue) {
    let clamped = allowNegativeHealth ? value : Math.max(0, value);
    if (Number.isFinite(maxValue)) {
      clamped = Math.min(clamped, maxValue);
    }
    return clamped;
  }

  /**
   * Clamp a stat using TempHP-specific rules when needed.
   * @param {string} statKey Stat key being updated.
   * @param {number} value Proposed current value.
   * @param {number} maxValue Stat maximum.
   * @returns {number}
   */
  function clampCurrentForKey(statKey, value, maxValue) {
    if (statKey === 'TempHP') {
      return Math.max(0, value);
    }
    return clampCurrentStat(value, maxValue);
  }

  /**
   * Adjust a character stat locally and persist the change.
   * @param {object} player Character record.
   * @param {string} statKey Stat key to change.
   * @param {number} delta Signed amount to add or subtract.
   * @returns {void}
   */
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
    skipRefresh = true;
  }

  /**
   * Load a character into the referee editor as the active selection.
   * @param {object} player Character record.
   * @returns {void}
   */
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
    updateConditionsDialogTitle(player.name || 'this character');
  }

  /**
   * Open the condition editor for a specific character.
   * @param {object} player Character record.
   * @returns {Promise<void>}
   */
  async function openConditionsEditorForCharacter(player) {
    if (!player) return;
    if (detailsDirty) {
      const discard = await confirmDiscardUnsavedDetails();
      if (!discard) return;
    }
    if (conditionsDirty && selectedCharacterId === player.id) {
      const discard = await confirmDiscardUnsavedConditions();
      if (!discard) return;
    }
    setSelectedCharacter(player);
    setConditionsPanelOpen(true);
  }

  /**
   * Prompt for a character's initiative and save the result.
   * @param {object} player Character record.
   * @returns {Promise<void>}
   */
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

  /**
   * Roll or prompt for initiative for a referee-owned character.
   * @param {object} player Character record.
   * @returns {Promise<void>}
   */
  async function handleInitiativeAction(player) {
    if (!player) return;
    if (player.useAppInitiativeRoll !== false) {
      const rolled = rollStandardDie(currentStandardDie, player.initiativeBonus);
      if (Number.isFinite(rolled)) {
        player.initiative = rolled;
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
    skipRefresh = true;
    await saveCharacterEntry(player);
  }

  /**
   * Clear the current character selection and hide the editor panels.
   * @returns {void}
   */
  function clearSelectedCharacter() {
    selectedCharacterId = null;
    detailsDirty = false;
    conditionsDirty = false;
    if (editorForm) editorForm.classList.add('hidden');
    if (editorEmpty) editorEmpty.classList.remove('hidden');
    closeOverflowMenu();
    setDetailsPanelOpen(false);
    setConditionsPanelOpen(false);
    updateConditionsDialogTitle('this character');
  }

  /**
   * Open the selected character's reference URL in a new tab.
   * @returns {void}
   */
  function openSelectedCharacterReference() {
    const selected = selectedCharacterId
      ? currentPlayers.find((player) => player.id === selectedCharacterId)
      : null;
    const referenceUrl = selected?.referenceUrl?.trim();
    if (!referenceUrl) return;
    window.open(referenceUrl, '_blank', 'noopener');
  }

  /**
   * Open a character's reference URL in a new tab.
   * @param {object|null} player Character record.
   * @returns {void}
   */
  function openCharacterReference(player) {
    const referenceUrl = player?.referenceUrl?.trim();
    if (!referenceUrl) return;
    window.open(referenceUrl, '_blank', 'noopener');
  }

  /**
   * Render the condition selector grid for the selected character.
   * @param {string} [filterText=''] Filter string entered by the user.
   * @returns {void}
   */
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

  /**
   * Refresh the summary of the selected conditions in the editor.
   * @returns {void}
   */
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

  /**
   * Update a character's hidden and reveal-on-turn flags on the server.
   * @param {string} id Character id.
   * @param {boolean} isHidden Whether the character is hidden.
   * @param {boolean} revealOnTurn Whether the character reveals on its turn.
   * @returns {Promise<void>}
   */
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

  /**
   * Update visibility flags for one or more characters on the server.
   * @param {Array<{id: string, isHidden: boolean, revealOnTurn: boolean}>} updates Visibility updates to apply.
   * @returns {Promise<void>}
   */
  async function updateVisibilities(updates) {
    if (!Array.isArray(updates) || updates.length === 0) return;
    try {
      for (const update of updates) {
        const res = await fetch(`/characters/${update.id}/visibility`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            isHidden: update.isHidden,
            revealOnTurn: update.revealOnTurn
          })
        });
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            window.location.replace('/index.html');
            return;
          }
          throw new Error('Server returned ' + res.status);
        }
      }
      await loadState();
    } catch (err) {
      if (statusDiv) statusDiv.textContent = `Failed to update visibility: ${err.message}`;
    }
  }

  /**
   * Collect the members of a character's initiative group.
   * @param {object} player Character record.
   * @returns {Array<object>}
   */
  function getInitiativeGroupMembers(player) {
    return refereeVisibilityHelpers.getInitiativeGroupMembers(currentPlayers, player);
  }

  /**
   * Update visibility for every member of a character's initiative group.
   * @param {object} player Character record.
   * @param {boolean} isHidden Whether the group should be hidden.
   * @param {boolean} revealOnTurn Whether the group should reveal on turn.
   * @returns {Promise<void>}
   */
  async function updateGroupVisibility(player, isHidden, revealOnTurn) {
    const groupMembers = getInitiativeGroupMembers(player);
    if (groupMembers.length <= 1) {
      await updateVisibility(player.id, isHidden, revealOnTurn);
      return;
    }
    await updateVisibilities(
      refereeVisibilityHelpers.buildInitiativeGroupVisibilityUpdates(groupMembers, isHidden, revealOnTurn)
    );
  }

  /**
   * Serialize the selected character editor into the server payload shape.
   * @returns {object|null}
   */
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

  /**
   * Save the active character editor form back to the server.
   * @returns {Promise<boolean>} True when the save succeeds.
   */
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

  /**
   * Move a character to the active turn on the server.
   * @param {string} id Character id.
   * @returns {Promise<void>}
   */
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

  /**
   * Submit the add-character form and create one or more characters.
   * @param {SubmitEvent} event Submit event from the add form.
   * @returns {Promise<void>}
   */
  function createAddGroupId() {
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
    const runAsGroup = Boolean(addRunAsGroupInput && addRunAsGroupInput.checked);
    const initiativeBonusStr = initiativeBonusInput ? initiativeBonusInput.value.trim() : '';
    const initiativeBonus = initiativeBonusStr === '' ? 0 : Number(initiativeBonusStr);
    if (!Number.isFinite(initiativeBonus)) {
      if (statusDiv) statusDiv.textContent = 'Initiative bonus must be a valid number.';
      return;
    }
    const groupInitiative = runAsGroup && encounterState === 'active'
      ? rollStandardDie(currentStandardDie, initiativeBonus)
      : null;
    if (runAsGroup && encounterState === 'active' && groupInitiative == null) {
      if (statusDiv) statusDiv.textContent = 'Unable to roll initiative for the group.';
      return;
    }
    const groupId = runAsGroup && quantity > 1 ? createAddGroupId() : null;

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
          initiative: Number.isFinite(groupInitiative) ? groupInitiative : null,
          useAppInitiativeRoll: true,
          initiativeBonus,
          stats: statsPayload,
          revealStats: false,
          isHidden: !shouldReveal,
          revealOnTurn: false,
          conditions: []
        };
        if (groupId) {
          payload.initiativeGroupId = groupId;
          payload.initiativeGroupIndex = i;
        }
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

  /**
   * Open the add-character form.
   * @returns {void}
   */
  function showAddForm() {
    if (!form) return;
    clearAddForm();
    setAddDialogTab('manual');
    form.classList.remove('hidden');
    form.classList.remove('details-panel-collapsed');
    form.classList.add('details-panel-open');
    form.setAttribute('aria-hidden', 'false');
  }

  /**
   * Close the add-character form.
   * @returns {void}
   */
  function hideAddForm() {
    if (!form) return;
    clearAddForm();
    form.classList.add('details-panel-collapsed');
    form.classList.remove('details-panel-open');
    form.classList.add('hidden');
    form.setAttribute('aria-hidden', 'true');
  }

  /**
   * Reset the add-character form back to its default values.
   * @returns {void}
   */
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
    if (addRunAsGroupInput) addRunAsGroupInput.checked = false;
  }

  /**
   * Persist a character entry from the referee editor back to the server.
   * @param {object} player Character record.
   * @returns {Promise<void>}
   */
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

  /**
   * Delete a character from the active campaign roster.
   * @param {string} id Character id.
   * @returns {Promise<void>}
   */
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

  /**
   * Force a claimed character back to the available pool.
   * @param {object} player Character record.
   * @returns {Promise<void>}
   */
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

  /**
   * Release a referee-owned character into the shared pool.
   * @param {object} player Character record.
   * @returns {Promise<void>}
   */
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

  /**
   * Claim an unassigned character for the current session.
   * @param {object} player Character record.
   * @returns {Promise<void>}
   */
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

  /**
   * Advance the active encounter to the next turn.
   * @returns {Promise<void>}
   */
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

  /**
   * Bootstrap the referee page.
   * @returns {Promise<void>}
   */
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
      handleEncounterAction(encounterState === 'suspended' ? '/encounter/resume' : '/encounter/start');
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
    detailsToggle.addEventListener('click', async () => {
      const isOpen = detailsPanel.classList.contains('details-panel-open');
      if (!isOpen && conditionsPanel && conditionsPanel.classList.contains('conditions-panel-open') && conditionsDirty) {
        const discard = await confirmDiscardUnsavedConditions();
        if (!discard) return;
        setConditionsPanelOpen(false);
      }
      setDetailsPanelOpen(!isOpen);
    });
  }
  if (detailsCancelBtn) {
    detailsCancelBtn.addEventListener('click', async () => {
      if (!(await confirmDiscardUnsavedDetails())) return;
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
    detailsPanel.addEventListener('click', async (event) => {
      if (event.target !== detailsPanel) return;
      if (!(await confirmDiscardUnsavedDetails())) return;
      setDetailsPanelOpen(false);
    });
  }
  if (conditionsCancelBtn) {
    conditionsCancelBtn.addEventListener('click', async () => {
      if (!(await confirmDiscardUnsavedConditions())) return;
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
    conditionsPanel.addEventListener('click', async (event) => {
      if (event.target !== conditionsPanel) return;
      event.stopPropagation();
      if (!(await confirmDiscardUnsavedConditions())) return;
      setConditionsPanelOpen(false);
    });
  }
  if (initiativeModal) {
    initiativeModal.addEventListener('click', async (event) => {
      if (event.target !== initiativeModal) return;
      if (!(await confirmDiscardInitiativeChanges())) return;
      closeInitiativeEditor();
    });
  }
  if (initiativeModalCancelBtn) {
    initiativeModalCancelBtn.addEventListener('click', async () => {
      if (!(await confirmDiscardInitiativeChanges())) return;
      closeInitiativeEditor();
    });
  }
  if (initiativeModalRollBtn) {
    initiativeModalRollBtn.addEventListener('click', async () => {
      if (!initiativeEditorCharacterId || !initiativeModalInput) return;
      const player = currentPlayers.find((entry) => entry.id === initiativeEditorCharacterId);
      if (!player) return;
      const rolled = rollStandardDie(currentStandardDie, player.initiativeBonus);
      if (!Number.isFinite(rolled)) {
        if (statusDiv) statusDiv.textContent = 'Unable to roll initiative.';
        return;
      }
      initiativeModalInput.value = String(rolled);
      await saveInitiativeEditor();
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
    deleteCharacterBtn.addEventListener('click', async () => {
      closeOverflowMenu();
      if (!selectedCharacterId) return;
      const current = currentPlayers.find((player) => player.id === selectedCharacterId);
      if (!current) return;
      const confirmDelete = await showConfirmDialog({
        title: 'Delete Character?',
        header: current.name || 'This character',
        message: 'Remove this character from the tracker?',
        confirmLabel: 'Delete Character',
        cancelLabel: 'Keep Character',
        confirmButtonClass: 'danger',
        initialFocus: 'cancel'
      });
      if (!confirmDelete) return;
      deleteCharacter(current.id);
    });
  }
  if (addCancelBtn) {
    addCancelBtn.addEventListener('click', () => {
      hideAddForm();
    });
  }
  updateAddDialogTabs();

  init();
});
