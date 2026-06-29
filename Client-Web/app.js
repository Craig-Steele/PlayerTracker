// Shared state
let lastStateJson = null;
let skipRefresh = false;
let loadStateInFlight = false;
let loadStateRefreshQueued = false;
let displayRosterLayoutFrame = null;
let displayRosterLayoutMode = 'single';

  const {
    APP_NAME,
    APP_ICON_URL,
    QR_CODE_SIZE,
    isAdminHost,
    rollStandardDie,
    formatInitiative,
    updateCampaignHeader,
    appendOverflowMenuSeparator,
    showConfirmDialog,
    showChoiceDialog
  } = window.PlayerTrackerShared || {
  APP_NAME: 'Tactical Table Top: Initiative',
  APP_ICON_URL: '/favicon-512.png',
  QR_CODE_SIZE: 96,
  isAdminHost: () => false,
  rollStandardDie: () => null,
    formatInitiative: () => '🎲',
    updateCampaignHeader: () => {},
    appendOverflowMenuSeparator: (menuEl) => menuEl,
    showConfirmDialog: async () => true,
    showChoiceDialog: async () => null
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
  formatEncounterStatsItems = (stats) => (Array.isArray(stats) ? stats : []),
  formatEncounterStatLine = (stat) => (stat ? `${stat.key} ${stat.current}/${stat.max}` : ''),
  buildEncounterConditionsList,
  createEmptyEncounterRow,
  setEncounterHealthLabel
} = window.PlayerTrackerEncounter || {
  normalizeConditionEntry: () => null,
  createConditionLink: () => null,
  formatEncounterStateText: () => 'Encounter: New',
  healthStatusLabel: () => '',
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
const {
  getCharacterControllerName: sharedGetCharacterControllerName,
  isClaimablePoolCharacter: sharedIsClaimablePoolCharacter
} = window.PlayerTrackerClaimableCharacters || {
  getCharacterControllerName: (character) => {
    if (!character) return '';
    const claimedDisplayName = typeof character.claimedDisplayName === 'string'
      ? character.claimedDisplayName.trim()
      : '';
    if (claimedDisplayName) return claimedDisplayName;
    if (character.isReferee && !(character?.claimedSessionId == null && Boolean(character?.isClaimable))) {
      return 'Referee';
    }
    return '';
  },
  isClaimablePoolCharacter: (character) => !character?.claimedSessionId && Boolean(character?.isClaimable)
};
const { collectStatPayloadFromInputs } = window.PlayerTrackerStatInputs || {
  collectStatPayloadFromInputs: () => []
};
const {
  SESSION_EXPIRED_MESSAGE,
  resolvePlayerNameSaveOutcome
} = window.TacticalTableTopInitiativePlayerNameSave || {
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
const {
  createInventoryEntryId
} = window.PlayerTrackerInventoryIds || {
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
  }
};
const {
  normalizePlayerName,
  sanitizePlayerDisplayName,
  hasRealPlayerName,
  resolvePlayerDisplayName
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
  },
  resolvePlayerDisplayName: (player, fallbackName = '') => {
    const sanitize = (value) => {
      const trimmed = (value || '').trim();
      if (!trimmed || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
        return '';
      }
      return trimmed;
    };
    const isReal = (value) => {
      const trimmed = sanitize(value);
      return Boolean(trimmed) && trimmed.toLowerCase() !== 'player';
    };
    const displayName = sanitize(player?.displayName);
    if (isReal(displayName)) {
      return displayName;
    }
    const fallback = sanitize(fallbackName);
    return isReal(fallback) ? fallback : '';
  }
};
const AUTO_SAVE_DELAY_MS = 600;
const LOCAL_DRAFT_PREFIX = 'characterDrafts:';
const LOCAL_TEMP_HP_VISIBILITY_PREFIX = 'characterTempHpVisibility:';

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
const APP_JS_VERSION = '54';
let statBlockDefinitions = [];
let statBlockLookup = new Map();

const inventoryTargetHelpers = window.PlayerTrackerInventoryTarget || {
  normalizeContainerId: (value) => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed || null;
  },
  resolveInventoryDraftContainerId: ({
    selectedRowData = null,
    chosenContainerId = null,
    isContainer = false
  } = {}) => {
    if (isContainer) return null;
    const chosen = typeof chosenContainerId === 'string' ? chosenContainerId.trim() : '';
    if (chosen) return chosen;
    if (selectedRowData?.isContainer) {
      const containerId = typeof selectedRowData.id === 'string' ? selectedRowData.id.trim() : '';
      return containerId || null;
    }
    const containerId = typeof selectedRowData?.containerId === 'string' ? selectedRowData.containerId.trim() : '';
    return containerId || null;
  }
};
const inventoryRemovalHelpers = window.PlayerTrackerInventoryRemoval || {
  normalizeInventoryEntry: (entry = {}) => ({
    id: typeof entry.id === 'string' ? entry.id.trim() : '',
    name: typeof entry.name === 'string' ? entry.name : '',
    quantity: Number.isFinite(entry.quantity) ? entry.quantity : 1,
    value: Number.isFinite(entry.value) ? entry.value : 0,
    weight: Number.isFinite(entry.weight) ? entry.weight : 0,
    url: typeof entry.url === 'string' && entry.url.trim() ? entry.url.trim() : null,
    containerId: typeof entry.containerId === 'string' && entry.containerId.trim() ? entry.containerId.trim() : null,
    isContainer: Boolean(entry.isContainer)
  }),
  removeInventoryEntry: (items = [], entryId, options = {}) => {
    const normalizedId = typeof entryId === 'string' ? entryId.trim() : '';
    if (!normalizedId) {
      return Array.isArray(items) ? items.slice() : [];
    }
    const normalizedItems = Array.isArray(items)
      ? items.map((item) => inventoryRemovalHelpers.normalizeInventoryEntry(item))
      : [];
    if (options.moveContainedItems) {
      return normalizedItems
        .filter((item) => item.id !== normalizedId)
        .map((item) => (item.containerId === normalizedId ? { ...item, containerId: null } : item));
    }
    const removedIds = new Set([normalizedId]);
    let changed = true;
    while (changed) {
      changed = false;
      normalizedItems.forEach((item) => {
        if (item.containerId && removedIds.has(item.containerId) && !removedIds.has(item.id)) {
          removedIds.add(item.id);
          changed = true;
        }
      });
    }
    return normalizedItems.filter((item) => !removedIds.has(item.id));
  }
};
const inventoryTransferHelpers = window.PlayerTrackerInventoryTransfer || {
    normalizeTransferEntry: (entry = {}) => ({
      id: typeof entry.id === 'string' ? entry.id.trim() : '',
      name: typeof entry.name === 'string' ? entry.name : '',
      quantity: Number.isFinite(entry.quantity) ? entry.quantity : 1,
      value: Number.isFinite(entry.value) ? entry.value : 0,
      weight: Number.isFinite(entry.weight) ? entry.weight : 0,
      url: typeof entry.url === 'string' && entry.url.trim() ? entry.url.trim() : null,
      category: typeof entry.category === 'string' && entry.category.trim() ? entry.category.trim() : null,
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

function isDisplayPath() {
  const path = window.location.pathname || '';
  return path === '/display.html' || path.endsWith('/display.html');
}

function isJoinPage() {
  const path = window.location.pathname || '';
  return path === '/index.html' || path === '/' || path.endsWith('/index.html');
}

const narrowPopupQuery = typeof window.matchMedia === 'function'
  ? window.matchMedia('(max-width: 760px)')
  : null;

function isNarrowPopupViewport() {
  return true;
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
  const form = document.getElementById('modal-form-stack');
  const statusDiv = document.getElementById('status');
  const playersBody = document.getElementById('players-body');

  const qrContainer = document.getElementById('qr-container'); // if you have it

  const ownerInput = document.getElementById('owner-name');
  const playerNameEdit = document.getElementById('player-name-edit');
  const playerNameInput = document.getElementById('player-name-input');
  const playerNameEditBtn = document.getElementById('edit-player-name');
  const playerNameSaveBtn = document.getElementById('player-name-save');
  const playerNameCancelBtn = document.getElementById('player-name-cancel');
  const playerNameLogoutBtn = document.getElementById('player-name-logout');
  const playerNameNudge = document.getElementById('player-name-nudge');
  const nameInput = document.getElementById('name');
  const useAppInitiativeRollInput = document.getElementById('use-app-initiative-roll');
  const initiativeBonusInput = document.getElementById('initiative-bonus');
  const initiativeBonusWrap = document.getElementById('initiative-bonus-wrap');
  const statsFields = document.getElementById('stats-fields');
  const currentStatsInputs = document.getElementById('current-stats-inputs');
  const revealStatsInput = document.getElementById('reveal-stats');
  const autoSkipTurnInput = document.getElementById('auto-skip-turn');
  const healthHeading = document.getElementById('health-heading');
  const roundIndicator = document.getElementById('round-indicator');
  const conditionsDialogTitle = document.getElementById('conditions-dialog-title');
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
  const rollInitiativeAllBtn = document.getElementById('roll-initiative-all');
  const turnCompleteBtn = document.getElementById('turn-complete');
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
  const conditionsToggle = document.getElementById('conditions-toggle');
  const conditionsPanel = document.getElementById('conditions-panel');
  const initiativePanel = document.getElementById('initiative-panel');
  const initiativeEditorInput = document.getElementById('initiative-editor-input');
  const initiativeSaveBtn = document.getElementById('initiative-save');
  const initiativeCancelBtn = document.getElementById('initiative-cancel');
  const initiativeRollBtn = document.getElementById('initiative-roll');
  const initiativeDialogTitle = document.getElementById('initiative-dialog-title');
  const currencyPanel = document.getElementById('currency-panel');
  const currencyFields = document.getElementById('currency-fields');
  const currencySaveBtn = document.getElementById('currency-save');
  const currencyCancelBtn = document.getElementById('currency-cancel');
  const partyTreasurePanel = document.getElementById('party-treasure-panel');
  const partyTreasureFields = document.getElementById('party-treasure-fields');
  const partyTreasureMoneyBtn = document.getElementById('party-treasure-money');
  const partyTreasureMoneyPanel = document.getElementById('party-treasure-money-panel');
  const partyTreasureMoneyFields = document.getElementById('party-treasure-money-fields');
  const partyTreasureMoneySaveBtn = document.getElementById('party-treasure-money-save');
  const partyTreasureMoneyCancelBtn = document.getElementById('party-treasure-money-cancel');
  const partyTreasureMoneyDialogTitle = document.getElementById('party-treasure-money-dialog-title');
  const partyTreasureMoneySummary = document.getElementById('party-treasure-money-summary');
  const partyTreasureMoneyEditorSummary = document.getElementById('party-treasure-money-editor-summary');
  const partyTreasureDisburseBtn = document.getElementById('party-treasure-disburse');
  const partyTreasureDisbursePanel = document.getElementById('party-treasure-disburse-panel');
  const partyTreasureDisburseAmountInput = document.getElementById('party-treasure-disburse-amount');
  const partyTreasureDisburseCharacters = document.getElementById('party-treasure-disburse-characters');
  const partyTreasureDisburseSummary = document.getElementById('party-treasure-disburse-summary');
  const partyTreasureDisburseSaveBtn = document.getElementById('party-treasure-disburse-save');
  const partyTreasureDisburseCancelBtn = document.getElementById('party-treasure-disburse-cancel');
  const partyTreasureDisburseDialogTitle = document.getElementById('party-treasure-disburse-dialog-title');
  const partyTreasureCancelBtn = document.getElementById('party-treasure-cancel');
  const partyTreasureAddBtn = document.getElementById('party-treasure-add');
  const partyTreasureEditBtn = document.getElementById('party-treasure-edit');
  const partyTreasureRemoveBtn = document.getElementById('party-treasure-remove');
  const partyTreasureClaimBtn = document.getElementById('party-treasure-claim');
  const partyTreasureDialogTitle = document.getElementById('party-treasure-dialog-title');
  const partyTreasureContext = document.getElementById('party-treasure-context');
  const partyTreasureAddForm = document.getElementById('party-treasure-add-form');
  const partyTreasureAddFormTitle = document.getElementById('party-treasure-add-form-title');
  const partyTreasureAddFormName = document.getElementById('party-treasure-add-name');
  const partyTreasureAddFormCategory = document.getElementById('party-treasure-add-category');
  const partyTreasureAddFormQuantity = document.getElementById('party-treasure-add-quantity');
  const partyTreasureAddFormValue = document.getElementById('party-treasure-add-value');
  const partyTreasureAddFormWeight = document.getElementById('party-treasure-add-weight');
  const partyTreasureAddFormUrl = document.getElementById('party-treasure-add-url');
  const partyTreasureAddFormSaveBtn = document.getElementById('party-treasure-add-form-save');
  const partyTreasureAddFormCancelBtn = document.getElementById('party-treasure-add-form-cancel');
  const partyTreasureItemOptions = document.getElementById('party-treasure-item-options');
  const inventoryPanel = document.getElementById('inventory-panel');
  const inventoryFields = document.getElementById('inventory-fields');
  const inventoryCloseBtn = document.getElementById('inventory-close');
  const inventoryAddBtn = document.getElementById('inventory-add');
  const inventoryDialogTitle = document.getElementById('inventory-dialog-title');
  const inventoryTotalWeight = document.getElementById('inventory-total-weight');
  const inventoryAddForm = document.getElementById('inventory-add-form');
  const inventoryAddFormKindRow = document.getElementById('inventory-add-kind-row');
  const inventoryAddFormKind = document.getElementById('inventory-add-kind');
  const inventoryAddFormContainerRow = document.getElementById('inventory-add-container-row');
  const inventoryAddFormTitle = document.getElementById('inventory-add-form-title');
  const inventoryAddFormName = document.getElementById('inventory-add-name');
  const inventoryAddFormCategory = document.getElementById('inventory-add-category');
  const inventoryAddFormContainer = document.getElementById('inventory-add-container-id');
  const inventoryAddFormQuantity = document.getElementById('inventory-add-quantity');
  const inventoryAddFormValue = document.getElementById('inventory-add-value');
  const inventoryAddFormWeight = document.getElementById('inventory-add-weight');
  const inventoryAddFormUrl = document.getElementById('inventory-add-url');
  const inventoryAddFormSaveBtn = document.getElementById('inventory-add-form-save');
  const inventoryAddFormCancelBtn = document.getElementById('inventory-add-form-cancel');
  const inventoryItemOptions = document.getElementById('inventory-item-options');
  const inventoryContainerSections = document.getElementById('inventory-container-sections');
  const conditionsSaveBtn = document.getElementById('conditions-save');
  const conditionsCancelBtn = document.getElementById('conditions-cancel');
  const detailsSaveBtn = document.getElementById('details-save');
  const detailsCancelBtn = document.getElementById('details-cancel');
  const playerListSection = document.querySelector('.character-list');
  const playerTable = playerListSection ? playerListSection.querySelector('table') : null;
  const displayRosterColumns = document.getElementById('display-roster-columns');
  const displayRosterColumnsLeftBody = document.getElementById('display-players-body-left');
  const displayRosterColumnsRightBody = document.getElementById('display-players-body-right');
  const characterListActions = document.querySelector('.character-list-actions');
  const inventoryCharacterBtn = document.getElementById('character-inventory');
  const moneyCharacterBtn = document.getElementById('character-money');
  const releaseCharacterBtn = document.getElementById('character-release');
  const characterOverflowToggle = document.getElementById('character-overflow-toggle');
  const characterOverflowMenu = document.getElementById('character-overflow-menu');

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
  let currentHealthLabel = 'HP';
  let statKeys = ['HP'];
  let statAliases = new Map();
  let currencySystem = null;
  let currentPartyTreasureCurrency = [];
  let currentPartyTreasureDisburseCharacterIds = [];
  let equipmentLibraryReference = null;
  let equipmentCategoryIcons = {};
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
      if (inputs.categoryInput && typeof preset.category === 'string' && preset.category.trim()) {
        inputs.categoryInput.value = preset.category.trim();
      }
      return true;
    }
  };
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
    normalizeInventoryEntry: (entry = {}, containerId = null, isContainer = false) => {
      const normalizedContainerId =
        typeof entry.containerId === 'string' && entry.containerId.trim()
          ? entry.containerId.trim()
          : containerId;
      return {
        id: typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : partyTreasureHelpers.createInventoryEntryId(),
        name: typeof entry.name === 'string' ? entry.name : '',
        quantity: Number.isFinite(entry.quantity) ? entry.quantity : 1,
        value: Number.isFinite(entry.value) ? entry.value : 0,
        weight: Number.isFinite(entry.weight) ? entry.weight : 0,
        url: typeof entry.url === 'string' && entry.url.trim() ? entry.url.trim() : null,
        category: typeof entry.category === 'string' && entry.category.trim() ? entry.category.trim() : null,
        containerId: normalizedContainerId,
        isContainer: typeof entry.isContainer === 'boolean' ? entry.isContainer : isContainer
      };
    },
    normalizeEquipmentItems: (items) =>
      Array.isArray(items)
        ? items.map((item) => ({
            id: typeof item?.id === 'string' && item.id.trim()
              ? item.id.trim()
              : (typeof item?.name === 'string'
                  ? item.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
                  : ''),
            name: typeof item?.name === 'string' ? item.name.trim() : '',
            category: typeof item?.category === 'string' && item.category.trim() ? item.category.trim() : null,
            value: Number.isFinite(item?.value) ? item.value : null,
            weight: Number.isFinite(item?.weight) ? item.weight : null,
            url: typeof item?.url === 'string' && item.url.trim() ? item.url.trim() : null,
            source: typeof item?.source === 'string' && item.source.trim() ? item.source.trim() : null
          })).filter((item) => Boolean(item.name))
        : [],
    resolveEquipmentOverflowGlyph: (options = {}) => {
      const {
        entry = {},
        categoryIcons = {},
        fallbackGlyph = PARTY_TREASURE_CATEGORY_FALLBACK_GLYPH
      } = options;
      if (entry.isContainer) {
        return PARTY_TREASURE_CONTAINER_GLYPH;
      }
      const category = typeof entry.category === 'string' && entry.category.trim() ? entry.category.trim() : null;
      return partyTreasureHelpers.resolveCategoryGlyph
        ? partyTreasureHelpers.resolveCategoryGlyph(category, categoryIcons, fallbackGlyph)
        : (category && typeof categoryIcons === 'object' && typeof categoryIcons[category] === 'string' && categoryIcons[category].trim()
            ? categoryIcons[category].trim()
            : fallbackGlyph);
    },
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
      const categoryInput = row.querySelector('input[data-inventory-field="category"]');
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
      if (categoryInput && typeof preset.category === 'string' && preset.category.trim()) {
        categoryInput.value = preset.category.trim();
      }
    },
    populatePartyTreasureAddForm: (inputs = {}, entry = null) => {
      const normalized = entry
        ? partyTreasureHelpers.normalizeInventoryEntry(entry, null, false)
        : partyTreasureHelpers.normalizeInventoryEntry({}, null, false);
      if (inputs.nameInput) inputs.nameInput.value = normalized.name || '';
      if (inputs.categoryInput) inputs.categoryInput.value = normalized.category || '';
      if (inputs.quantityInput) inputs.quantityInput.value = String(normalized.quantity ?? 1);
      if (inputs.valueInput) inputs.valueInput.value = String(normalized.value ?? 0);
      if (inputs.weightInput) inputs.weightInput.value = String(normalized.weight ?? 0);
      if (inputs.urlInput) inputs.urlInput.value = normalized.url || '';
      return normalized;
    },
    applyPartyTreasurePresetToForm: (inputs = {}, itemName, equipmentLibraryItems = []) => {
      const preset = equipmentLibraryItems.find(
        (item) => (item.name || '').trim().toLowerCase() === String(itemName || '').trim().toLowerCase()
      );
      if (!preset) return false;
      if (inputs.valueInput && Number.isFinite(preset.value)) {
        inputs.valueInput.value = String(preset.value);
      }
      if (inputs.weightInput && Number.isFinite(preset.weight)) {
        inputs.weightInput.value = String(preset.weight);
      }
      if (inputs.urlInput && typeof preset.url === 'string' && preset.url.trim()) {
        inputs.urlInput.value = preset.url.trim();
      }
      if (inputs.categoryInput && typeof preset.category === 'string' && preset.category.trim()) {
        inputs.categoryInput.value = preset.category.trim();
      }
      return true;
    },
    setPartyTreasureAddFormOpen: ({
      open,
      entry = null,
      formEl,
      titleEl,
      saveButtonEl,
      inputs = {},
      equipmentLibraryItems = [],
      updateActionButtons = null,
      refreshSelectedRowIcon = null
    } = {}) => {
      if (!formEl) return null;
      formEl.classList.toggle('hidden', !open);
      formEl.setAttribute('aria-hidden', (!open).toString());
      const editingEntryId = open && entry ? (entry.id || null) : null;
      if (titleEl) {
        titleEl.textContent = open && entry ? 'Edit Item' : 'Add Item';
      }
      if (saveButtonEl) {
        saveButtonEl.textContent = open && entry ? 'Save Changes' : 'Add Item';
      }
      partyTreasureHelpers.populatePartyTreasureAddForm(inputs, open ? entry : null);
      if (open) {
        partyTreasureHelpers.applyPartyTreasurePresetToForm(inputs, inputs.nameInput?.value || '', equipmentLibraryItems);
        if (typeof refreshSelectedRowIcon === 'function') {
          refreshSelectedRowIcon();
        }
      }
      if (typeof updateActionButtons === 'function') {
        updateActionButtons();
      }
      return editingEntryId;
    },
    collectPartyTreasureDraftFromForm: (inputs = {}, editingEntryId = null) => {
      const name = (inputs.nameInput?.value || '').trim();
      const category = (inputs.categoryInput?.value || '').trim();
      const quantityRaw = (inputs.quantityInput?.value || '').trim();
      const valueRaw = (inputs.valueInput?.value || '').trim();
      const weightRaw = (inputs.weightInput?.value || '').trim();
      const url = (inputs.urlInput?.value || '').trim();
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
        id: editingEntryId || partyTreasureHelpers.createInventoryEntryId(),
        name,
        quantity,
        value,
        weight,
        url: url || null,
        category: category || null,
        containerId: null,
        isContainer: false
      };
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
      const categoryInput = row.querySelector('input[data-inventory-field="category"]');
      return (window.PlayerTrackerPartyTreasure?.normalizeInventoryEntry || partyTreasureHelpers.normalizeInventoryEntry)({
        id: rowData.id || null,
        name: nameInput ? nameInput.value.trim() : '',
        quantity: quantityInput ? Number(quantityInput.value) : 1,
        value: valueInput ? Number(valueInput.value) : 0,
        weight: weightInput ? Number(weightInput.value) : 0,
        url: urlInput ? urlInput.value.trim() : '',
        category: categoryInput ? categoryInput.value.trim() : null,
        containerId: rowData.containerId,
        isContainer: rowData.isContainer
      });
    },
    createPartyTreasureRow: (options = {}) => {
      const {
        entry = {},
        itemOptionsId = 'party-treasure-item-options',
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
      let nameCell = null;
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
        input.type = field.type;
        input.value = field.value;
        if (field.placeholder) input.placeholder = field.placeholder;
        if (field.list) input.setAttribute('list', field.list);
        if (field.step) input.step = field.step;
        input.dataset.inventoryField = field.key;
        if (field.key === 'name') {
          nameCell = cell;
        }
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
      if (nameCell) {
        const categoryHidden = document.createElement('input');
        categoryHidden.type = 'hidden';
        categoryHidden.value = normalized.category || '';
        categoryHidden.dataset.inventoryField = 'category';
        nameCell.appendChild(categoryHidden);
      }
      return row;
    },
    buildPartyTreasureFields: (fieldsEl, items = [], options = {}) => {
      if (!fieldsEl) return null;
      const {
        itemOptionsId = 'party-treasure-item-options',
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
  const PARTY_TREASURE_CATEGORY_FALLBACK_GLYPH = '❓';
  const PARTY_TREASURE_CONTAINER_GLYPH =
    partyTreasureHelpers.CONTAINER_GLYPH || '🧳';
  const inventoryView = window.PlayerTrackerInventoryView || {};
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
  let currencyEditorCharacterId = null;
  let currencyEditorDirty = false;
  let expandedOrderStatsCharacterId = null;
  let lastEncounterSnapshot = null;
  let partyTreasureEditorCharacterId = null;
  let partyTreasureSelectedRow = null;
  let partyTreasureEditingEntryId = null;
  let currentPartyTreasure = [];
  let inventoryEditorCharacterId = null;
  let inventorySelectedRow = null;
  let inventoryEditingEntryId = null;
  let inventoryEditingContainerId = null;
  let inventoryEditingIsContainer = false;
  let inventoryAddFormOpen = false;
  let currentInventory = [];
  let currentCampaignId = '';
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
  if (playerTable) {
    playerTable.style.display = '';
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

  function clearDisplayRosterColumns() {
    if (displayRosterColumnsLeftBody) {
      displayRosterColumnsLeftBody.innerHTML = '';
    }
    if (displayRosterColumnsRightBody) {
      displayRosterColumnsRightBody.innerHTML = '';
    }
  }

  function setDisplayRosterLayoutMode(mode) {
    displayRosterLayoutMode = mode;
    document.body.classList.toggle('display-roster-split', mode !== 'single');
    document.body.classList.toggle('display-roster-compact', mode === 'compact');
    if (playerTable) {
      playerTable.classList.toggle('hidden', mode !== 'single');
      playerTable.setAttribute('aria-hidden', (mode !== 'single').toString());
    }
    if (displayRosterColumns) {
      displayRosterColumns.classList.toggle('hidden', mode === 'single');
      displayRosterColumns.setAttribute('aria-hidden', (mode === 'single').toString());
    }
  }

  function splitDisplayRosterRows(rows) {
    if (!displayRosterColumnsLeftBody || !displayRosterColumnsRightBody) return;
    const leftFragment = document.createDocumentFragment();
    const rightFragment = document.createDocumentFragment();
    const leftCount = Math.ceil(rows.length / 2);
    rows.forEach((row) => {
      const clone = row.cloneNode(true);
      if (leftFragment.childNodes.length < leftCount) {
        leftFragment.appendChild(clone);
      } else {
        rightFragment.appendChild(clone);
      }
    });
    displayRosterColumnsLeftBody.innerHTML = '';
    displayRosterColumnsRightBody.innerHTML = '';
    displayRosterColumnsLeftBody.appendChild(leftFragment);
    displayRosterColumnsRightBody.appendChild(rightFragment);
  }

  function measureDisplayRosterOverflow() {
    if (!displayOnly || !playerListSection) return false;
    const rosterRect = playerListSection.getBoundingClientRect();
    return rosterRect.bottom > window.innerHeight - 8;
  }

  function updateDisplayRosterLayout() {
    if (!displayOnly || !playersBody || !playerListSection || !displayRosterColumns) return;
    if (displayRosterLayoutMode !== 'single') {
      clearDisplayRosterColumns();
      setDisplayRosterLayoutMode('single');
    }
    const rows = Array.from(playersBody.querySelectorAll('tr'));
    if (rows.length === 0) {
      clearDisplayRosterColumns();
      setDisplayRosterLayoutMode('single');
      return;
    }

    const shouldSplit = window.innerWidth >= 1100 && measureDisplayRosterOverflow() && rows.length >= 6;
    if (!shouldSplit) {
      clearDisplayRosterColumns();
      setDisplayRosterLayoutMode('single');
      return;
    }

    splitDisplayRosterRows(rows);
    setDisplayRosterLayoutMode('split');
    const splitOverflow = measureDisplayRosterOverflow();
    if (splitOverflow) {
      setDisplayRosterLayoutMode('compact');
      const compactOverflow = measureDisplayRosterOverflow();
      if (!compactOverflow) {
        return;
      }
    }
  }

  function queueDisplayRosterLayoutUpdate() {
    if (!displayOnly) return;
    if (displayRosterLayoutFrame) {
      window.cancelAnimationFrame(displayRosterLayoutFrame);
    }
    displayRosterLayoutFrame = window.requestAnimationFrame(() => {
      displayRosterLayoutFrame = null;
      updateDisplayRosterLayout();
    });
  }

  function setConditionsPanelOpen(open) {
    if (!conditionsPanel) return;
    conditionsPanelOpen = open;
    if (open && detailsPanel && detailsPanel.classList.contains('details-panel-open')) {
      setDetailsPanelOpen(false);
    }
    conditionsPanel.classList.toggle('hidden', !open);
    conditionsPanel.classList.toggle('conditions-panel-open', open);
    conditionsPanel.setAttribute('aria-hidden', (!open).toString());
  }

  function updateConditionsDialogTitle(name = '') {
    if (!conditionsDialogTitle) return;
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    conditionsDialogTitle.textContent = `🩸 Conditions - ${trimmedName || 'this character'}`;
  }

  function setDetailsPanelOpen(open) {
    if (!detailsPanel) return;
    detailsPanel.classList.toggle('hidden', !open);
    detailsPanel.classList.toggle('details-panel-open', open);
    detailsPanel.classList.toggle('details-panel-collapsed', !open);
    detailsPanel.setAttribute('aria-hidden', (!open).toString());
  }

  function closeOpenModalOverlay() {
    if (playerNameEdit && playerNameEdit.classList.contains('visible')) {
      if (playerNameCancelBtn) {
        playerNameCancelBtn.click();
      } else {
        showPlayerNameEdit(false);
      }
      return true;
    }
    if (addForm && addForm.classList.contains('details-panel-open') && !addForm.classList.contains('hidden')) {
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
    if (conditionsPanel && conditionsPanel.classList.contains('conditions-panel-open') && !conditionsPanel.classList.contains('hidden')) {
      if (conditionsCancelBtn) {
        conditionsCancelBtn.click();
      } else {
        setConditionsPanelOpen(false);
      }
      return true;
    }
    if (initiativePanel && !initiativePanel.classList.contains('hidden')) {
      if (initiativeCancelBtn) {
        initiativeCancelBtn.click();
      } else {
        closeInitiativeEditor();
      }
      return true;
    }
    if (currencyPanel && !currencyPanel.classList.contains('hidden')) {
      if (currencyCancelBtn) {
        currencyCancelBtn.click();
      } else {
        closeCurrencyEditor();
      }
      return true;
    }
    if (partyTreasureMoneyPanel && !partyTreasureMoneyPanel.classList.contains('hidden')) {
      if (partyTreasureMoneyCancelBtn) {
        partyTreasureMoneyCancelBtn.click();
      } else {
        closePartyTreasureMoneyEditor();
      }
      return true;
    }
    if (partyTreasureDisbursePanel && !partyTreasureDisbursePanel.classList.contains('hidden')) {
      if (partyTreasureDisburseCancelBtn) {
        partyTreasureDisburseCancelBtn.click();
      } else {
        closePartyTreasureDisburseEditor();
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
    if (inventoryPanel && !inventoryPanel.classList.contains('hidden')) {
      if (inventoryCloseBtn) {
        inventoryCloseBtn.click();
      } else {
        closeInventoryEditor();
      }
      return true;
    }
    return false;
  }

  async function openDetailsEditorForCharacter(character) {
    if (!character || !detailsPanel) return;
    if (conditionsPanel && conditionsPanel.classList.contains('conditions-panel-open')) {
      if (!(await confirmDiscardChanges({
        dirty: conditionsDirty,
        header: 'You have unsaved condition changes.',
        message: 'Choose Discard Changes to lose them, or Return to Conditions to keep editing.',
        cancelLabel: 'Return to Conditions',
        onDiscard: revertSelectedConditions
      }))) return;
      setConditionsPanelOpen(false);
    }
    if (selectedCharacterId && selectedCharacterId !== character.id && formDirty) {
      if (!(await confirmDiscardChanges({
        dirty: formDirty,
        header: 'You have unsaved detail changes.',
        message: 'Choose Discard Changes to lose them, or Keep Editing to continue working.',
        cancelLabel: 'Keep Editing',
        onDiscard: revertSelectedCharacterDetails
      }))) return;
    }
    closeCharacterOverflowMenu();
    selectCharacter(character.id);
    setDetailsPanelOpen(true);
  }

  async function openConditionsEditorForCharacter(character) {
    if (!character || !conditionsPanel) return;
    if (detailsPanel && detailsPanel.classList.contains('details-panel-open')) {
      if (!(await confirmDiscardChanges({
        dirty: formDirty,
        header: 'You have unsaved detail changes.',
        message: 'Choose Discard Changes to lose them, or Keep Editing to continue working.',
        cancelLabel: 'Keep Editing',
        onDiscard: revertSelectedCharacterDetails
      }))) return;
      setDetailsPanelOpen(false);
    }
    if (selectedCharacterId && selectedCharacterId !== character.id && conditionsDirty) {
      if (!(await confirmDiscardChanges({
        dirty: conditionsDirty,
        header: 'You have unsaved condition changes.',
        message: 'Choose Discard Changes to lose them, or Return to Conditions to keep editing.',
        cancelLabel: 'Return to Conditions',
        onDiscard: revertSelectedConditions
      }))) return;
    }
    closeCharacterOverflowMenu();
    selectCharacter(character.id);
    setConditionsPanelOpen(true);
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

  async function confirmDiscardChanges({ dirty, header, message, cancelLabel, onDiscard }) {
    if (!dirty) return true;
    const confirmed = await showConfirmDialog({
      title: 'Discard Changes?',
      header,
      message,
      confirmLabel: 'Discard Changes',
      cancelLabel,
      confirmButtonClass: 'danger',
      initialFocus: 'cancel'
    });
    if (confirmed && typeof onDiscard === 'function') {
      onDiscard();
    }
    return confirmed;
  }

  function updateConditionsAvailability() {
    const hasCharacter = Boolean(selectedCharacterId);
    if (!hasCharacter) {
      conditionsPanelOpen = false;
      setDetailsPanelOpen(false);
      setConditionsPanelOpen(false);
      return;
    }
    setConditionsPanelOpen(conditionsPanelOpen);
  }

  function updateReleaseButtonState() {
    const selected = selectedCharacterId
      ? myCharacters.find((character) => character.id === selectedCharacterId)
      : null;
    const canEditInventory = Boolean(selected);
    const canEditMoney = Boolean(selected && currencySystem && currencySystem.units.length > 0);
    if (inventoryCharacterBtn) {
      inventoryCharacterBtn.classList.toggle('hidden', !canEditInventory);
      inventoryCharacterBtn.disabled = !canEditInventory;
      inventoryCharacterBtn.setAttribute('aria-disabled', (!canEditInventory).toString());
    }
    if (moneyCharacterBtn) {
      moneyCharacterBtn.classList.toggle('hidden', !canEditMoney);
      moneyCharacterBtn.disabled = !canEditMoney;
      moneyCharacterBtn.setAttribute('aria-disabled', (!canEditMoney).toString());
    }
    const canRelease = Boolean(selected && selected.claimedSessionId === currentPlayerSessionId);
    if (releaseCharacterBtn) {
      releaseCharacterBtn.classList.toggle('hidden', !canRelease);
      releaseCharacterBtn.disabled = !canRelease;
      releaseCharacterBtn.setAttribute('aria-disabled', (!canRelease).toString());
    }
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
      closeCurrencyEditor();
      closeInventoryEditor();
    }
  }

  function updateTurnCompleteButtonState() {
    if (!turnCompleteBtn) return;
    const canCompleteTurn =
      !displayOnly &&
      encounterState === 'active' &&
      Boolean(currentTurnId) &&
      myCharacters.some((entry) => entry.id === currentTurnId);
    turnCompleteBtn.classList.toggle('hidden', !canCompleteTurn);
    turnCompleteBtn.disabled = !canCompleteTurn;
    turnCompleteBtn.setAttribute('aria-disabled', (!canCompleteTurn).toString());
    turnCompleteBtn.setAttribute('aria-hidden', (!canCompleteTurn).toString());
  }

  function updateRollInitiativeButtonState() {
    if (!rollInitiativeAllBtn) return;
    const canRollInitiative =
      !displayOnly &&
      encounterState === 'active' &&
      myCharacters.some((character) => needsInitiativeAction(character));
    rollInitiativeAllBtn.classList.toggle('hidden', !canRollInitiative);
    rollInitiativeAllBtn.disabled = !canRollInitiative;
    rollInitiativeAllBtn.setAttribute('aria-disabled', (!canRollInitiative).toString());
    rollInitiativeAllBtn.setAttribute('aria-hidden', (!canRollInitiative).toString());
  }

  function setCurrencyPanelOpen(open) {
    if (!currencyPanel) return;
    currencyPanel.classList.toggle('hidden', !open);
    currencyPanel.setAttribute('aria-hidden', (!open).toString());
  }

  function buildCurrencyFields(character) {
    if (!currencyFields || !inventoryView.buildCurrencyFields) return;
    inventoryView.buildCurrencyFields(currencyFields, character, currencySystem, {
      readOnly: false,
      inputIdPrefix: 'currency',
      onDirty: () => {
        currencyEditorDirty = true;
      }
    });
  }

  function openCurrencyEditor(character) {
    if (!character || !currencySystem || !currencyFields) return;
    closeCharacterOverflowMenu();
    closeInventoryEditor();
    currencyEditorCharacterId = character.id;
    currencyEditorDirty = false;
    if (currencyPanel) {
      const title = currencyPanel.querySelector('#currency-dialog-title');
      if (title) {
        title.textContent = `🪙 Money - ${character.name || 'Character'}`;
      }
    }
    buildCurrencyFields(character);
    setCurrencyPanelOpen(true);
    window.requestAnimationFrame(() => {
      const firstInput = currencyFields.querySelector('input');
      if (firstInput) {
        firstInput.focus();
        firstInput.select();
      }
    });
  }

  function closeCurrencyEditor() {
    currencyEditorCharacterId = null;
    currencyEditorDirty = false;
    if (currencyPanel) {
      const title = currencyPanel.querySelector('#currency-dialog-title');
      if (title) {
        title.textContent = '🪙 Money';
      }
    }
    if (currencyFields) {
      currencyFields.innerHTML = '';
    }
    setCurrencyPanelOpen(false);
  }

  function collectCurrencyPayloadFromEditor() {
    if (!currencyFields) return null;
    const inputs = Array.from(currencyFields.querySelectorAll('input[data-currency-unit-id]'));
    if (inputs.length === 0) return null;
    const payload = [];
    for (const input of inputs) {
      const unitId = input.dataset.currencyUnitId || '';
      const raw = (input.value || '').trim();
      const amount = raw === '' ? 0 : Number(raw);
      if (!Number.isFinite(amount) || !Number.isInteger(amount)) {
        throw new Error(`Currency amount for ${unitId} must be a whole number.`);
      }
      payload.push({ unitId, amount });
    }
    return payload;
  }

  async function saveCurrencyFromEditor() {
    if (!currencyEditorCharacterId) return;
    const character = myCharacters.find((entry) => entry.id === currencyEditorCharacterId);
    if (!character) {
      closeCurrencyEditor();
      return;
    }
    let currency;
    try {
      currency = collectCurrencyPayloadFromEditor();
    } catch (err) {
      statusDiv.textContent = err instanceof Error ? err.message : String(err);
      return;
    }
    character.currency = currency || [];
    const savedCharacter = await saveCharacterEntry(character);
    if (!savedCharacter) {
      return;
    }
    currencyEditorDirty = false;
    closeCurrencyEditor();
  }

  function setInventoryPanelOpen(open) {
    if (!inventoryPanel) return;
    inventoryPanel.classList.toggle('hidden', !open);
    inventoryPanel.setAttribute('aria-hidden', (!open).toString());
  }

  function setInventoryTablesVisible(visible) {
    const tableWrappers = inventoryPanel?.querySelectorAll('.inventory-scroll') || [];
    tableWrappers.forEach((wrap) => {
      wrap.classList.toggle('hidden', !visible);
      wrap.setAttribute('aria-hidden', (!visible).toString());
    });
  }

  function updateInventoryItemOptions() {
    if (!inventoryItemOptions) return;
    inventoryItemOptions.innerHTML = '';
    equipmentLibraryItems.forEach((item) => {
      const option = document.createElement('option');
      option.value = item.name;
      option.label = item.source ? `${item.name} - ${item.source}` : item.name;
      inventoryItemOptions.appendChild(option);
    });
  }

  async function loadEquipmentLibrary() {
    if (equipmentLibraryLoading) {
      return equipmentLibraryItems;
    }
    if (equipmentLibraryLoaded) {
      return equipmentLibraryItems;
    }
    if (!equipmentLibraryReference?.file) {
      equipmentLibraryLoaded = true;
      equipmentLibraryItems = [];
      updateInventoryItemOptions();
      updatePartyTreasureItemOptions();
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
      updateInventoryItemOptions();
      updatePartyTreasureItemOptions();
      return equipmentLibraryItems;
    } catch (err) {
      console.error('Failed to load equipment library:', err);
      equipmentLibraryItems = [];
      equipmentLibraryLoaded = true;
      updateInventoryItemOptions();
      updatePartyTreasureItemOptions();
      return equipmentLibraryItems;
    } finally {
      equipmentLibraryLoading = false;
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

  function setPartyTreasureMoneyPanelOpen(open) {
    if (!partyTreasureMoneyPanel) return;
    partyTreasureMoneyPanel.classList.toggle('hidden', !open);
    partyTreasureMoneyPanel.setAttribute('aria-hidden', (!open).toString());
  }

  function updatePartyTreasureMoneySummary() {
    if (!partyTreasureMoneySummary) return;
    const summary = inventoryView.formatCurrencyTotal
      ? inventoryView.formatCurrencyTotal({ currency: currentPartyTreasureCurrency }, currencySystem)
      : null;
    partyTreasureMoneySummary.textContent = summary ? `Party treasure money: ${summary}` : 'Party treasure money: —';
    if (partyTreasureMoneyEditorSummary) {
      partyTreasureMoneyEditorSummary.textContent = summary ? `Money for party treasure: ${summary}` : 'Money for party treasure: —';
    }
  }

  function formatPartyTreasureCurrencyAmount(amount) {
    if (!inventoryView.formatCurrencyTotal || !currencySystem) {
      return String(Math.round(Number(amount) * 100) / 100);
    }
    const commonCurrencyId = currencySystem.commonCurrencyId || '';
    const formatted = inventoryView.formatCurrencyTotal(
      { currency: [{ unitId: commonCurrencyId, amount: Number(amount) || 0 }] },
      currencySystem
    );
    return formatted || String(Math.round(Number(amount) * 100) / 100);
  }

  function buildPartyTreasureMoneyFields() {
    if (!partyTreasureMoneyFields || !inventoryView.buildCurrencyFields) return;
    inventoryView.buildCurrencyFields(partyTreasureMoneyFields, { currency: currentPartyTreasureCurrency }, currencySystem, {
      inputIdPrefix: 'party-treasure-money'
    });
  }

  function collectPartyTreasureMoneyPayloadFromEditor() {
    if (!partyTreasureMoneyFields) return null;
    const inputs = Array.from(partyTreasureMoneyFields.querySelectorAll('input[data-currency-unit-id]'));
    if (inputs.length === 0) return null;
    const payload = [];
    for (const input of inputs) {
      const unitId = input.dataset.currencyUnitId || '';
      const raw = (input.value || '').trim();
      const amount = raw === '' ? 0 : Number(raw);
      if (!Number.isFinite(amount) || !Number.isInteger(amount)) {
        throw new Error(`Currency amount for ${unitId} must be a whole number.`);
      }
      payload.push({ unitId, amount });
    }
    return payload;
  }

  function openPartyTreasureMoneyEditor() {
    if (!currencySystem || !partyTreasureMoneyFields) return;
    closeCharacterOverflowMenu();
    setPartyTreasureAddFormOpen(false);
    buildPartyTreasureMoneyFields();
    updatePartyTreasureMoneySummary();
    if (partyTreasureMoneyDialogTitle) {
      partyTreasureMoneyDialogTitle.textContent = '🪙 Party Treasure Money';
    }
    setPartyTreasureMoneyPanelOpen(true);
    window.requestAnimationFrame(() => {
      const firstInput = partyTreasureMoneyFields.querySelector('input');
      if (firstInput) {
        firstInput.focus();
        firstInput.select();
      }
    });
  }

  function closePartyTreasureMoneyEditor() {
    if (partyTreasureMoneyFields) {
      partyTreasureMoneyFields.innerHTML = '';
    }
    if (partyTreasureMoneyDialogTitle) {
      partyTreasureMoneyDialogTitle.textContent = '🪙 Party Treasure Money';
    }
    setPartyTreasureMoneyPanelOpen(false);
  }

  function getPartyTreasureDisburseCharacters() {
    return Array.isArray(myCharacters) ? myCharacters.filter((character) => Boolean(character?.id)) : [];
  }

  function setPartyTreasureDisbursePanelOpen(open) {
    if (!partyTreasureDisbursePanel) return;
    partyTreasureDisbursePanel.classList.toggle('hidden', !open);
    partyTreasureDisbursePanel.setAttribute('aria-hidden', (!open).toString());
  }

  function updatePartyTreasureDisburseSummary() {
    if (!partyTreasureDisburseSummary) return;
    const amount = Number(partyTreasureDisburseAmountInput?.value || 0);
    const selectedCount = Array.from(partyTreasureDisbursePanel?.querySelectorAll('input[data-disburse-character-id]:checked') || []).length;
    const totalSummary = inventoryView.formatCurrencyTotal
      ? inventoryView.formatCurrencyTotal({ currency: currentPartyTreasureCurrency }, currencySystem)
      : null;
    if (!Number.isFinite(amount) || amount <= 0) {
      partyTreasureDisburseSummary.textContent = totalSummary
        ? `Available to disburse: ${totalSummary}. Select characters and enter an amount.`
        : 'Select characters and enter an amount.';
      return;
    }
    const split = partyTreasureHelpers.splitCommonCurrencyEvenly
      ? partyTreasureHelpers.splitCommonCurrencyEvenly(amount, selectedCount, currencySystem)
      : null;
    if (!split || selectedCount <= 0) {
      partyTreasureDisburseSummary.textContent = totalSummary
        ? `Available to disburse: ${totalSummary}. Select at least one character.`
        : 'Select at least one character.';
      return;
    }
    const shareSummary = formatPartyTreasureCurrencyAmount(split.shareCommonAmount);
    const remainderSummary = formatPartyTreasureCurrencyAmount(split.remainderCommonAmount);
    partyTreasureDisburseSummary.textContent = `Each selected character gets ${shareSummary}; ${remainderSummary} remains in party treasure.`;
  }

  function buildPartyTreasureDisburseFields() {
    if (!partyTreasureDisburseCharacters) return;
    partyTreasureDisburseCharacters.innerHTML = '';
    const characters = getPartyTreasureDisburseCharacters();
    const defaultSelected = currentPartyTreasureDisburseCharacterIds.length > 0
      ? new Set(currentPartyTreasureDisburseCharacterIds)
      : new Set(characters.map((character) => character.id));
    characters.forEach((character) => {
      const label = document.createElement('label');
      label.className = 'property-row party-treasure-disburse-character-row';
      const labelText = document.createElement('span');
      labelText.className = 'property-label';
      labelText.textContent = character.name || 'Character';
      const control = document.createElement('span');
      control.className = 'property-control';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = defaultSelected.has(character.id);
      checkbox.dataset.disburseCharacterId = character.id;
      checkbox.addEventListener('change', () => {
        currentPartyTreasureDisburseCharacterIds = Array.from(
          partyTreasureDisbursePanel?.querySelectorAll('input[data-disburse-character-id]:checked') || []
        ).map((input) => input.dataset.disburseCharacterId || '').filter(Boolean);
        updatePartyTreasureDisburseSummary();
      });
      control.appendChild(checkbox);
      label.appendChild(labelText);
      label.appendChild(control);
      partyTreasureDisburseCharacters.appendChild(label);
    });
    currentPartyTreasureDisburseCharacterIds = Array.from(
      partyTreasureDisbursePanel?.querySelectorAll('input[data-disburse-character-id]:checked') || []
    ).map((input) => input.dataset.disburseCharacterId || '').filter(Boolean);
    updatePartyTreasureDisburseSummary();
  }

  function openPartyTreasureDisburseEditor() {
    if (!currencySystem || !partyTreasureDisbursePanel) return;
    closeCharacterOverflowMenu();
    closePartyTreasureMoneyEditor();
    if (partyTreasureDisburseDialogTitle) {
      partyTreasureDisburseDialogTitle.textContent = '🪙 Disburse Party Treasure Money';
    }
    buildPartyTreasureDisburseFields();
    if (partyTreasureDisburseAmountInput) {
      partyTreasureDisburseAmountInput.value = '';
    }
    updatePartyTreasureDisburseSummary();
    setPartyTreasureDisbursePanelOpen(true);
    window.requestAnimationFrame(() => {
      partyTreasureDisburseAmountInput?.focus();
      partyTreasureDisburseAmountInput?.select?.();
    });
  }

  function closePartyTreasureDisburseEditor() {
    if (partyTreasureDisburseCharacters) {
      partyTreasureDisburseCharacters.innerHTML = '';
    }
    if (partyTreasureDisburseAmountInput) {
      partyTreasureDisburseAmountInput.value = '';
    }
    currentPartyTreasureDisburseCharacterIds = [];
    if (partyTreasureDisburseDialogTitle) {
      partyTreasureDisburseDialogTitle.textContent = '🪙 Disburse Party Treasure Money';
    }
    if (partyTreasureDisburseSummary) {
      partyTreasureDisburseSummary.textContent = 'Select characters and enter an amount.';
    }
    setPartyTreasureDisbursePanelOpen(false);
  }

  async function savePartyTreasureDisburseFromEditor() {
    const amount = Number(partyTreasureDisburseAmountInput?.value || 0);
    const selectedIds = Array.from(partyTreasureDisbursePanel?.querySelectorAll('input[data-disburse-character-id]:checked') || [])
      .map((input) => input.dataset.disburseCharacterId || '')
      .filter(Boolean);
    if (!Number.isFinite(amount) || amount <= 0) {
      statusDiv.textContent = 'Enter an amount to disburse.';
      return;
    }
    if (selectedIds.length === 0) {
      statusDiv.textContent = 'Select at least one character to receive a share.';
      return;
    }
    const split = partyTreasureHelpers.splitCommonCurrencyEvenly
      ? partyTreasureHelpers.splitCommonCurrencyEvenly(amount, selectedIds.length, currencySystem)
      : null;
    if (!split || split.distributableLowestUnits <= 0 || split.shareLowestUnits <= 0) {
      statusDiv.textContent = 'The amount is too small to split among the selected characters.';
      return;
    }
    const currentTotal = inventoryView.calculateCurrencyTotal
      ? inventoryView.calculateCurrencyTotal({ currency: currentPartyTreasureCurrency }, currencySystem)
      : 0;
    if (Number.isFinite(currentTotal) && split.distributableCommonAmount > currentTotal + 1e-9) {
      statusDiv.textContent = 'Party treasure does not have enough money for that disbursement.';
      return;
    }
    const selectedCharacters = selectedIds
      .map((characterId) => myCharacters.find((character) => character.id === characterId))
      .filter(Boolean);
    if (selectedCharacters.length === 0) {
      statusDiv.textContent = 'Select at least one valid character.';
      return;
    }
    const originalPartyTreasureCurrency = Array.isArray(currentPartyTreasureCurrency)
      ? currentPartyTreasureCurrency.map((amountEntry) => ({ ...amountEntry }))
      : [];
    const originalCharacters = selectedCharacters.map((character) => ({
      id: character.id,
      currency: Array.isArray(character.currency) ? character.currency.map((amountEntry) => ({ ...amountEntry })) : []
    }));
    const updatedPartyTreasureCurrency = partyTreasureHelpers.applyCurrencyDelta
      ? partyTreasureHelpers.applyCurrencyDelta(currentPartyTreasureCurrency, currencySystem, -split.distributableCommonAmount)
      : currentPartyTreasureCurrency;
    const shareCurrencyDelta = split.shareCommonAmount;
    try {
      for (const character of selectedCharacters) {
        character.currency = partyTreasureHelpers.applyCurrencyDelta
          ? partyTreasureHelpers.applyCurrencyDelta(character.currency, currencySystem, shareCurrencyDelta)
          : character.currency;
        await saveCharacterEntry(character, { reloadState: false });
      }
      await savePartyTreasureItems(currentPartyTreasure, updatedPartyTreasureCurrency);
      currentPartyTreasureCurrency = Array.isArray(updatedPartyTreasureCurrency)
        ? updatedPartyTreasureCurrency
        : currentPartyTreasureCurrency;
      updatePartyTreasureMoneySummary();
      closePartyTreasureDisburseEditor();
      await loadState();
      statusDiv.textContent = `Disbursed ${formatPartyTreasureCurrencyAmount(split.distributableCommonAmount)} across ${selectedCharacters.length} characters.`;
    } catch (err) {
      try {
        for (const original of originalCharacters) {
          const character = myCharacters.find((entry) => entry.id === original.id);
          if (!character) continue;
          character.currency = original.currency;
          await saveCharacterEntry(character, { reloadState: false });
        }
        await savePartyTreasureItems(currentPartyTreasure, originalPartyTreasureCurrency);
      } catch (rollbackErr) {
        console.error('Failed to roll back party treasure disbursement:', rollbackErr);
      }
      await loadState();
      statusDiv.textContent = `Party treasure disbursement failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  async function savePartyTreasureMoneyFromEditor() {
    let currency;
    try {
      currency = collectPartyTreasureMoneyPayloadFromEditor();
    } catch (err) {
      statusDiv.textContent = err instanceof Error ? err.message : String(err);
      return;
    }
    try {
      const updatedCampaign = await savePartyTreasureItems(currentPartyTreasure, currency);
      currentPartyTreasure = Array.isArray(updatedCampaign?.partyTreasure)
        ? updatedCampaign.partyTreasure
        : currentPartyTreasure;
      currentPartyTreasureCurrency = Array.isArray(updatedCampaign?.currency)
        ? updatedCampaign.currency
        : (currency || currentPartyTreasureCurrency);
      updatePartyTreasureMoneySummary();
      closePartyTreasureMoneyEditor();
      statusDiv.textContent = 'Saved party treasure money.';
    } catch (err) {
      statusDiv.textContent = `Party treasure money save failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  function updatePartyTreasureItemOptions() {
    partyTreasureHelpers.updateEquipmentItemOptions(partyTreasureItemOptions, equipmentLibraryItems);
  }

  function isCompactPartyTreasureLayout() {
    return window.matchMedia('(max-width: 760px)').matches;
  }

  function populatePartyTreasureAddForm(entry = null) {
    return partyTreasureHelpers.populatePartyTreasureAddForm(
      {
        nameInput: partyTreasureAddFormName,
        categoryInput: partyTreasureAddFormCategory,
        quantityInput: partyTreasureAddFormQuantity,
        valueInput: partyTreasureAddFormValue,
        weightInput: partyTreasureAddFormWeight,
        urlInput: partyTreasureAddFormUrl
      },
      entry
    );
  }

  function applyPartyTreasurePresetToForm(itemName) {
    return partyTreasureHelpers.applyPartyTreasurePresetToForm(
      {
        valueInput: partyTreasureAddFormValue,
        weightInput: partyTreasureAddFormWeight,
        urlInput: partyTreasureAddFormUrl,
        categoryInput: partyTreasureAddFormCategory
      },
      itemName,
      equipmentLibraryItems
    );
  }

  function refreshPartyTreasureSelectedRowIcon() {
    if (!partyTreasureSelectedRow) return;
    const overflowToggle = partyTreasureSelectedRow.querySelector('.character-overflow-toggle');
    if (!overflowToggle) return;
    const category = (partyTreasureAddFormCategory?.value || '').trim();
    const isContainer = partyTreasureSelectedRow.dataset.inventoryIsContainer === 'true';
    overflowToggle.textContent = isContainer
      ? PARTY_TREASURE_CONTAINER_GLYPH
      : (category && partyTreasureHelpers.resolveCategoryGlyph
          ? partyTreasureHelpers.resolveCategoryGlyph(category, equipmentCategoryIcons, PARTY_TREASURE_CATEGORY_FALLBACK_GLYPH)
          : PARTY_TREASURE_CATEGORY_FALLBACK_GLYPH);
  }

  function setPartyTreasureAddFormOpen(open, entry = null) {
    partyTreasureEditingEntryId = partyTreasureHelpers.setPartyTreasureAddFormOpen({
      open,
      entry,
      formEl: partyTreasureAddForm,
      titleEl: partyTreasureAddFormTitle,
      saveButtonEl: partyTreasureAddFormSaveBtn,
      inputs: {
        nameInput: partyTreasureAddFormName,
        categoryInput: partyTreasureAddFormCategory,
        quantityInput: partyTreasureAddFormQuantity,
        valueInput: partyTreasureAddFormValue,
        weightInput: partyTreasureAddFormWeight,
        urlInput: partyTreasureAddFormUrl
      },
      equipmentLibraryItems,
      updateActionButtons: updatePartyTreasureActionButtons,
      refreshSelectedRowIcon: refreshPartyTreasureSelectedRowIcon
    });
  }

  function getCharacterCurrencyTotal(character) {
    return inventoryView.calculateCurrencyTotal
      ? inventoryView.calculateCurrencyTotal(character, currencySystem)
      : null;
  }

  function formatCharacterCurrencyTotal(character) {
    return inventoryView.formatCurrencyTotal
      ? inventoryView.formatCurrencyTotal(character, currencySystem)
      : null;
  }

  function updatePartyTreasureActionButtons() {
    const isAddFormOpen = Boolean(partyTreasureAddForm && !partyTreasureAddForm.classList.contains('hidden'));
    const hasSelection = Boolean(partyTreasureSelectedRow);
    const canClaim = hasSelection && !isAddFormOpen;
    const canEdit = hasSelection && !isAddFormOpen;
    const canRemove = hasSelection && !isAddFormOpen;
    const canEditMoney = Boolean(currencySystem && Array.isArray(currencySystem.units) && currencySystem.units.length > 0);
    const canDisburse = Boolean(
      canEditMoney &&
      Array.isArray(myCharacters) &&
      myCharacters.length > 0 &&
      Array.isArray(currentPartyTreasureCurrency)
    );
    if (partyTreasureMoneyBtn) {
      partyTreasureMoneyBtn.disabled = !canEditMoney;
      partyTreasureMoneyBtn.setAttribute('aria-disabled', (!canEditMoney).toString());
    }
    if (partyTreasureDisburseBtn) {
      partyTreasureDisburseBtn.disabled = !canDisburse;
      partyTreasureDisburseBtn.setAttribute('aria-disabled', (!canDisburse).toString());
    }
    if (partyTreasureAddBtn) {
      partyTreasureAddBtn.disabled = isAddFormOpen;
      partyTreasureAddBtn.setAttribute('aria-disabled', isAddFormOpen.toString());
    }
    if (partyTreasureEditBtn) {
      partyTreasureEditBtn.disabled = !canEdit;
      partyTreasureEditBtn.setAttribute('aria-disabled', (!canEdit).toString());
    }
    if (partyTreasureClaimBtn) {
      partyTreasureClaimBtn.disabled = !canClaim;
      partyTreasureClaimBtn.setAttribute('aria-disabled', (!canClaim).toString());
    }
    if (partyTreasureRemoveBtn) {
      partyTreasureRemoveBtn.disabled = !canRemove;
      partyTreasureRemoveBtn.setAttribute('aria-disabled', (!canRemove).toString());
    }
  }

  function collectPartyTreasureDraftFromForm() {
    return partyTreasureHelpers.collectPartyTreasureDraftFromForm(
      {
        nameInput: partyTreasureAddFormName,
        categoryInput: partyTreasureAddFormCategory,
        quantityInput: partyTreasureAddFormQuantity,
        valueInput: partyTreasureAddFormValue,
        weightInput: partyTreasureAddFormWeight,
        urlInput: partyTreasureAddFormUrl
      },
      partyTreasureEditingEntryId
    );
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
    overflowToggle.textContent = partyTreasureHelpers.resolveEquipmentOverflowGlyph
      ? partyTreasureHelpers.resolveEquipmentOverflowGlyph({
        entry,
        equipmentLibraryItems,
        categoryIcons: equipmentCategoryIcons,
        fallbackGlyph: PARTY_TREASURE_CATEGORY_FALLBACK_GLYPH
      })
      : (entry.isContainer ? PARTY_TREASURE_CONTAINER_GLYPH : PARTY_TREASURE_CATEGORY_FALLBACK_GLYPH);

    const overflowMenu = document.createElement('div');
    overflowMenu.className = 'character-overflow-menu hidden inventory-row-menu party-treasure-row-menu';
    overflowMenu.setAttribute('role', 'menu');
    overflowMenu.setAttribute('aria-hidden', 'true');
    overflowMenu._overflowToggle = overflowToggle;

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
    valueAmount.textContent = Math.round(Number(entry.value ?? 0) * 100) / 100;
    valueLine.appendChild(valueLabel);
    valueLine.appendChild(valueAmount);
    menuSummary.appendChild(valueLine);

    overflowMenu.appendChild(menuSummary);

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
        closeCharacterOverflowMenu();
        await handler();
      });
      overflowMenu.appendChild(button);
      return button;
    };

    addMenuItem('✏️ Edit', async () => {
      setSelectedPartyTreasureRow(row);
      editSelectedPartyTreasureItem();
    });
    addMenuItem('🏷️ Claim', async () => {
      setSelectedPartyTreasureRow(row);
      await claimSelectedPartyTreasureItem();
    }, {
      hidden: Boolean(entry.isContainer)
    });
    addMenuItem('Vendor 50%', async () => {
      setSelectedPartyTreasureRow(row);
      await vendorSelectedPartyTreasureItem(0.5);
    });
    addMenuItem('Vendor 100%', async () => {
      setSelectedPartyTreasureRow(row);
      await vendorSelectedPartyTreasureItem(1);
    });
    addMenuItem('🗑️ Remove', async () => {
      setSelectedPartyTreasureRow(row);
      await removeSelectedPartyTreasureItem();
    }, {
      className: 'secondary danger'
    });

    const openOverflowMenu = () => {
      closeCharacterOverflowMenu(overflowMenu);
      overflowMenu.classList.remove('hidden');
      overflowMenu.setAttribute('aria-hidden', 'false');
      const centered = isNarrowPopupViewport();
      overflowMenu.classList.toggle('popup-centered', centered);
      overflowMenu.style.left = centered ? '' : '0';
      overflowMenu.style.right = centered ? '' : 'auto';
      overflowMenu.style.top = centered ? '' : 'calc(100% + 0.35rem)';
      overflowMenu.style.bottom = '';
      overflowMenu.style.transform = '';
      overflowToggle.setAttribute('aria-expanded', 'true');
      if (!centered) {
        window.requestAnimationFrame(() => {
          const menuRect = overflowMenu.getBoundingClientRect();
          const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
          const overflowRight = menuRect.right > viewportWidth - 8;
          const overflowLeft = menuRect.left < 8;
          if (overflowRight && !overflowLeft) {
            overflowMenu.style.left = 'auto';
            overflowMenu.style.right = '0';
          }
        });
      }
    };

    overflowToggle.addEventListener('click', (event) => {
      event.stopPropagation();
      const isOpen = !overflowMenu.classList.contains('hidden');
      if (isOpen) {
        closeCharacterOverflowMenu();
      } else {
        openOverflowMenu();
      }
    });
    overflowToggle.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      const isOpen = !overflowMenu.classList.contains('hidden');
      if (isOpen) {
        closeCharacterOverflowMenu();
      } else {
        openOverflowMenu();
      }
    });
    overflowMenu.addEventListener('click', (event) => {
      event.stopPropagation();
    });

    overflow.appendChild(overflowToggle);
    overflow.appendChild(overflowMenu);
    return overflow;
  }

  function createPartyTreasureRow(entry = {}) {
    return partyTreasureHelpers.createPartyTreasureRow({
      entry,
      itemOptionsId: 'party-treasure-item-options',
      onSelect: (row) => {
        setSelectedPartyTreasureRow(row);
      },
      applyPreset: (row, itemName) => {
        partyTreasureHelpers.applyPartyTreasurePresetToRow(row, itemName, equipmentLibraryItems);
      },
      firstColumnRenderer: ({ row, entry: normalized }) => buildPartyTreasureRowOverflowControls(normalized, row)
    });
  }

  function buildPartyTreasureFields(items = []) {
    if (!partyTreasureFields) return;
    partyTreasureHelpers.buildPartyTreasureFields(partyTreasureFields, items, {
      itemOptionsId: 'party-treasure-item-options',
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

  function findPartyTreasureRowById(entryId) {
    if (!entryId || !partyTreasureFields) return null;
    return getPartyTreasureRows().find((row) => row.dataset.inventoryEntryId === entryId) || null;
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

  async function commitPartyTreasureAddFormItem() {
    if (!partyTreasureFields) return;
    let entry;
    try {
      entry = collectPartyTreasureDraftFromForm();
    } catch (err) {
      statusDiv.textContent = err instanceof Error ? err.message : String(err);
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
      statusDiv.textContent = `Saved ${entry.name}.`;
    } catch (err) {
      statusDiv.textContent = `Party treasure save failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  async function removeSelectedPartyTreasureItem() {
    if (!partyTreasureSelectedRow) return;
    const rowName = (partyTreasureSelectedRow.querySelector('input[data-inventory-field="name"]')?.value || '').trim() || 'Item';
    const confirmed = await showConfirmDialog({
      title: 'Remove Party Treasure Item?',
      header: rowName,
      message: 'Remove this item from party treasure? This cannot be undone.',
      confirmLabel: 'Remove Item',
      cancelLabel: 'Keep Item',
      confirmButtonClass: 'danger',
      initialFocus: 'cancel'
    });
    if (!confirmed) return;
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
      statusDiv.textContent = `Removed ${rowName}.`;
    } catch (err) {
      statusDiv.textContent = `Party treasure remove failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  async function vendorSelectedPartyTreasureItem(percent) {
    if (!partyTreasureSelectedRow) return;
    const entry = partyTreasureHelpers.getPartyTreasureRowEntry(partyTreasureSelectedRow);
    if (!entry) return;
    const proceeds = partyTreasureHelpers.calculatePartyTreasureVendorProceeds
      ? partyTreasureHelpers.calculatePartyTreasureVendorProceeds(entry, percent)
      : Math.max(0, Math.round(Math.max(1, Number(entry.quantity) || 1) * (Number(entry.value) || 0) * percent));
    const rowName = (entry.name || 'Item').trim() || 'Item';
    const percentLabel = percent >= 1 ? '100%' : '50%';
    const lowestUnitLabel = partyTreasureHelpers.getLowestCurrencyUnitLabel
      ? partyTreasureHelpers.getLowestCurrencyUnitLabel(currencySystem)
      : '';
    const proceedsInLowestUnits = partyTreasureHelpers.convertCommonCurrencyToLowestUnitAmount
      ? partyTreasureHelpers.convertCommonCurrencyToLowestUnitAmount(proceeds, currencySystem)
      : Math.max(0, Math.round(proceeds));
    const unitLabel = lowestUnitLabel || 'money';
    const confirmed = await showConfirmDialog({
      title: `Vendor ${percentLabel}?`,
      header: rowName,
      message: `Remove this item from party treasure and add ${proceedsInLowestUnits} ${unitLabel} to party treasure money?`,
      confirmLabel: `Vendor ${percentLabel}`,
      cancelLabel: 'Keep Item',
      confirmButtonClass: 'danger',
      initialFocus: 'cancel'
    });
    if (!confirmed) return;
    const items = partyTreasureHelpers.removePartyTreasureEntry(
      currentPartyTreasure,
      partyTreasureSelectedRow.dataset.inventoryEntryId || ''
    );
    const updatedCurrency = partyTreasureHelpers.applyCurrencyDelta
      ? partyTreasureHelpers.applyCurrencyDelta(currentPartyTreasureCurrency, currencySystem, proceeds)
      : currentPartyTreasureCurrency;
    try {
      const updatedCampaign = await savePartyTreasureItems(items, updatedCurrency);
      currentPartyTreasure = Array.isArray(updatedCampaign?.partyTreasure)
        ? updatedCampaign.partyTreasure
        : items;
      currentPartyTreasureCurrency = Array.isArray(updatedCampaign?.currency)
        ? updatedCampaign.currency
        : updatedCurrency;
      buildPartyTreasureFields(currentPartyTreasure);
      setSelectedPartyTreasureRow(getPartyTreasureRows()[0] || null);
      statusDiv.textContent = `Vended ${rowName} for ${proceedsInLowestUnits} ${unitLabel}.`;
    } catch (err) {
      statusDiv.textContent = `Party treasure vendor failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  async function savePartyTreasureItems(items, currency = undefined) {
    if (!currentCampaignId) return null;
    const payload = { items };
    if (currency !== undefined) {
      payload.currency = currency;
    }
    const res = await fetch('/campaign/party-treasure', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      throw new Error(await responseErrorMessage(res));
    }
    const updatedCampaign = await res.json();
    currentPartyTreasure = Array.isArray(updatedCampaign?.partyTreasure)
      ? updatedCampaign.partyTreasure
      : items;
    currentPartyTreasureCurrency = Array.isArray(updatedCampaign?.currency)
      ? updatedCampaign.currency
      : currentPartyTreasureCurrency;
    updatePartyTreasureMoneySummary();
    updatePartyTreasureActionButtons();
    return updatedCampaign;
  }

  async function claimSelectedPartyTreasureItem() {
    if (!currentCampaignId || !partyTreasureEditorCharacterId || !partyTreasureSelectedRow) return;
    const rowData = partyTreasureHelpers.getInventoryRowData(partyTreasureSelectedRow) || {};
    const itemId = rowData.id || '';
    const itemName = (partyTreasureSelectedRow.querySelector('input[data-inventory-field="name"]')?.value || '').trim();
    if (!itemId) {
      statusDiv.textContent = 'Select a treasure row with an item id first.';
      return;
    }
    try {
      const confirmed = await showConfirmDialog({
        title: 'Claim Item?',
        header: itemName || 'This item',
        message: 'Claim this item and add it to your inventory?',
        confirmLabel: 'Claim Item',
        cancelLabel: 'Keep Item',
        confirmButtonClass: 'danger',
        initialFocus: 'cancel'
      });
      if (!confirmed) return;
      const res = await fetch('/campaign/party-treasure/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId: partyTreasureEditorCharacterId,
          itemId
        })
      });
      if (!res.ok) {
        throw new Error(await responseErrorMessage(res));
      }
      const updatedCampaign = await res.json();
      currentPartyTreasure = Array.isArray(updatedCampaign?.partyTreasure)
        ? updatedCampaign.partyTreasure
        : currentPartyTreasure;
      buildPartyTreasureFields(currentPartyTreasure);
      closePartyTreasureEditor();
      await loadState();
      statusDiv.textContent = `Claimed ${itemName || 'item'}.`;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      statusDiv.textContent = `Claim failed: ${message}`;
    }
  }

  async function openPartyTreasureEditor(character) {
    if (!character || !partyTreasureFields) return;
    closeCharacterOverflowMenu();
    closeInventoryEditor();
    closePartyTreasureMoneyEditor();
    closePartyTreasureDisburseEditor();
    if (
      currencyEditorDirty &&
      !(await showConfirmDialog({
        title: 'Discard Money Changes?',
        header: 'Unsaved currency edits',
        message: 'Discard money changes? This cannot be undone.',
        confirmLabel: 'Discard Changes',
        cancelLabel: 'Keep Editing',
        confirmButtonClass: 'danger',
        initialFocus: 'cancel'
      }))
    ) {
      return;
    }
    closeCurrencyEditor();
    partyTreasureEditorCharacterId = character.id;
    if (partyTreasureDialogTitle) {
      partyTreasureDialogTitle.textContent = `💰 Party Treasure - ${character.name || 'Character'}`;
    }
    if (partyTreasureContext) {
      partyTreasureContext.classList.add('hidden');
      partyTreasureContext.setAttribute('aria-hidden', 'true');
    }
    await loadEquipmentLibrary();
    setPartyTreasureAddFormOpen(false);
    buildPartyTreasureFields(currentPartyTreasure);
    updatePartyTreasureMoneySummary();
    updatePartyTreasureActionButtons();
    setPartyTreasurePanelOpen(true);
    window.requestAnimationFrame(() => {
      partyTreasureAddBtn?.focus();
    });
  }

  function closePartyTreasureEditor() {
    closePartyTreasureMoneyEditor();
    closePartyTreasureDisburseEditor();
    partyTreasureEditorCharacterId = null;
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

  function setSelectedInventoryRow(row) {
    inventorySelectedRow = row;
    if (!inventoryFields) return;
    getInventoryPanelRows().forEach((entryRow) => {
      entryRow.classList.toggle('selected', entryRow === row);
      entryRow.setAttribute('aria-selected', (entryRow === row).toString());
    });
    updateInventoryActionButtons();
  }

  function focusInventoryRow(row) {
    if (!row) return;
    window.requestAnimationFrame(() => {
      const firstInput = row.querySelector('input');
      if (firstInput) {
        firstInput.focus();
        firstInput.select?.();
      }
    });
  }

  function normalizeInventoryEntry(entry = {}, containerId = null, isContainer = false) {
    const normalizedContainerId =
      typeof entry.containerId === 'string' && entry.containerId.trim()
        ? entry.containerId.trim()
        : containerId;
    return {
      id: typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : createInventoryEntryId(),
      name: typeof entry.name === 'string' ? entry.name : '',
      quantity: Number.isFinite(entry.quantity) ? entry.quantity : 1,
      value: Number.isFinite(entry.value) ? entry.value : 0,
      weight: Number.isFinite(entry.weight) ? entry.weight : 0,
      url: typeof entry.url === 'string' && entry.url.trim() ? entry.url.trim() : null,
      category: typeof entry.category === 'string' && entry.category.trim() ? entry.category.trim() : null,
      containerId: normalizedContainerId,
      isContainer: typeof entry.isContainer === 'boolean' ? entry.isContainer : isContainer
    };
  }

  function getInventoryPanelRows() {
    return Array.from(document.querySelectorAll('#inventory-panel tr.inventory-entry'));
  }

  function getInventoryContainerSection(containerId) {
    if (!inventoryContainerSections || !containerId) return null;
    return inventoryContainerSections.querySelector(`section[data-container-id="${containerId}"]`);
  }

  function getInventoryContainerBody(containerId) {
    const section = getInventoryContainerSection(containerId);
    return section ? section.querySelector('tbody') : null;
  }

  function getInventoryRowData(row) {
    if (!row) return null;
    return {
      id: typeof row.dataset.inventoryEntryId === 'string' ? row.dataset.inventoryEntryId : '',
      containerId: typeof row.dataset.inventoryContainerId === 'string' && row.dataset.inventoryContainerId.trim()
        ? row.dataset.inventoryContainerId.trim()
        : null,
      isContainer: row.dataset.inventoryIsContainer === 'true'
    };
  }

  function applyInventoryPresetToRow(row, itemName) {
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
  }

  function applyInventoryPresetToForm(itemName) {
    equipmentPresetHelpers.applyEquipmentPresetToInputs(
      {
        valueInput: inventoryAddFormValue,
        weightInput: inventoryAddFormWeight,
        urlInput: inventoryAddFormUrl,
        categoryInput: inventoryAddFormCategory
      },
      itemName,
      equipmentLibraryItems
    );
  }

  function refreshInventorySelectedRowIcon() {
    if (!inventorySelectedRow) return;
    const overflowToggle = inventorySelectedRow.querySelector('.character-overflow-toggle');
    if (!overflowToggle) return;
    const category = (inventoryAddFormCategory?.value || '').trim();
    const isContainer = inventorySelectedRow.dataset.inventoryIsContainer === 'true';
    overflowToggle.textContent = isContainer
      ? getContainerGlyph()
      : (category && partyTreasureHelpers.resolveCategoryGlyph
          ? partyTreasureHelpers.resolveCategoryGlyph(category, equipmentCategoryIcons, PARTY_TREASURE_CATEGORY_FALLBACK_GLYPH)
          : PARTY_TREASURE_CATEGORY_FALLBACK_GLYPH);
  }

  function buildInventoryContainerOptions(selectedContainerId = null, disabled = false) {
    if (!inventoryAddFormContainer) return;
    const nextValue = typeof selectedContainerId === 'string' ? selectedContainerId : '';
    inventoryAddFormContainer.innerHTML = '';

    const rootOption = document.createElement('option');
    rootOption.value = '';
    rootOption.textContent = 'Carried';
    inventoryAddFormContainer.appendChild(rootOption);

    const containerEntries = currentInventory.filter((entry) => entry && entry.isContainer && entry.id);
    const nameCounts = new Map();
    containerEntries.forEach((entry) => {
      const baseName = (entry.name || 'Container').trim() || 'Container';
      nameCounts.set(baseName, (nameCounts.get(baseName) || 0) + 1);
    });
    const seenCounts = new Map();
    containerEntries.forEach((entry) => {
      const option = document.createElement('option');
      option.value = entry.id;
      const baseName = (entry.name || 'Container').trim() || 'Container';
      const count = nameCounts.get(baseName) || 0;
      const seen = (seenCounts.get(baseName) || 0) + 1;
      seenCounts.set(baseName, seen);
      option.textContent = count > 1 ? `${baseName} (${seen})` : baseName;
      inventoryAddFormContainer.appendChild(option);
    });

    inventoryAddFormContainer.value = nextValue;
    inventoryAddFormContainer.disabled = disabled;
  }

  function updateInventoryTotalWeight() {
    if (!inventoryTotalWeight) return;
    const totalWeight = inventoryView.calculateInventoryTotalWeight
      ? inventoryView.calculateInventoryTotalWeight(currentInventory)
      : currentInventory.reduce((sum, entry) => {
          if (!entry || entry.containerId) {
            return sum;
          }
          const quantity = Number(entry.quantity);
          const weight = Number(entry.weight);
          if (!Number.isFinite(quantity) || !Number.isFinite(weight)) {
            return sum;
          }
          return sum + (quantity * weight);
        }, 0);
    const formattedTotal = Number.isInteger(totalWeight)
      ? String(totalWeight)
      : String(Math.round(totalWeight * 1000) / 1000);
    inventoryTotalWeight.textContent = `Total weight carried: ${formattedTotal}`;
  }

  function createInventorySectionTable(firstColumnLabel = PARTY_TREASURE_CONTAINER_GLYPH, secondColumnLabel = 'Item') {
    return inventoryView.createInventorySectionTable
      ? inventoryView.createInventorySectionTable(firstColumnLabel, secondColumnLabel)
      : (() => {
          const wrap = document.createElement('div');
          wrap.className = 'inventory-table-wrap';
          const table = document.createElement('table');
          table.className = 'inventory-table';
          const thead = document.createElement('thead');
          const tr = document.createElement('tr');
          [firstColumnLabel, secondColumnLabel, 'Qty', 'Value', 'Weight'].forEach((label) => {
            const th = document.createElement('th');
            th.textContent = label;
            tr.appendChild(th);
          });
          thead.appendChild(tr);
          table.appendChild(thead);
          const tbody = document.createElement('tbody');
          table.appendChild(tbody);
          wrap.appendChild(table);
          return { wrap, tbody };
        })();
  }

  function getContainerGlyph() {
    return inventoryView.resolveContainerGlyph
      ? inventoryView.resolveContainerGlyph(equipmentCategoryIcons, PARTY_TREASURE_CONTAINER_GLYPH)
      : (typeof equipmentCategoryIcons?.Containers === 'string' && equipmentCategoryIcons.Containers.trim()
        ? equipmentCategoryIcons.Containers.trim()
        : PARTY_TREASURE_CONTAINER_GLYPH);
  }

  function updateInventoryContainerHeadings() {
    const containerGlyph = getContainerGlyph();
    document.querySelectorAll('#inventory-panel .inventory-table th:first-child').forEach((th) => {
      th.textContent = containerGlyph;
    });
  }

  function buildInventoryContainerDisplayLabels(containerEntries = []) {
    return inventoryView.buildInventoryContainerDisplayLabels
      ? inventoryView.buildInventoryContainerDisplayLabels(containerEntries)
      : new Map();
  }

  function buildInventoryRowOverflowControls(entry, row, options = {}) {
    const containerLabels = options.containerLabels || buildInventoryContainerDisplayLabels(
      currentInventory.filter((candidate) => candidate && candidate.isContainer && candidate.id)
    );
    const formatInventoryMenuNumber = (value) => {
      const rounded = Math.round(Number(value) * 100) / 100;
      return Number.isFinite(rounded) ? String(rounded) : '0';
    };
    const overflow = document.createElement('div');
    overflow.className = 'character-overflow inventory-row-overflow';

    const overflowToggle = document.createElement('button');
    overflowToggle.type = 'button';
    overflowToggle.className = 'character-overflow-toggle';
    overflowToggle.setAttribute('aria-label', `Manage ${entry.name || 'item'}`);
    overflowToggle.setAttribute('aria-haspopup', 'menu');
    overflowToggle.setAttribute('aria-expanded', 'false');
    overflowToggle.textContent = partyTreasureHelpers.resolveEquipmentOverflowGlyph
      ? partyTreasureHelpers.resolveEquipmentOverflowGlyph({
        entry,
        equipmentLibraryItems,
        categoryIcons: equipmentCategoryIcons,
        fallbackGlyph: entry.isContainer ? getContainerGlyph() : PARTY_TREASURE_CATEGORY_FALLBACK_GLYPH
      })
      : (entry.isContainer ? getContainerGlyph() : PARTY_TREASURE_CATEGORY_FALLBACK_GLYPH);

    const overflowMenu = document.createElement('div');
    overflowMenu.className = 'character-overflow-menu hidden inventory-row-menu';
    overflowMenu.setAttribute('role', 'menu');
    overflowMenu.setAttribute('aria-hidden', 'true');

    const overflowTitle = document.createElement('div');
    overflowTitle.className = 'character-overflow-title';
    overflowTitle.textContent = entry.name || 'Item';
    overflowMenu.appendChild(overflowTitle);

    const menuSummary = document.createElement('div');
    menuSummary.className = 'inventory-row-menu-summary';
    const appendMenuDetailLine = (label, valueNode) => {
      const line = document.createElement('div');
      line.className = 'inventory-row-menu-summary-line';
      const detailLabel = document.createElement('span');
      detailLabel.className = 'inventory-row-menu-summary-label';
      detailLabel.textContent = label;
      line.appendChild(detailLabel);
      line.appendChild(valueNode);
      menuSummary.appendChild(line);
    };

    const valueAmount = document.createElement('span');
    valueAmount.className = 'inventory-row-menu-summary-value';
    valueAmount.textContent = formatInventoryMenuNumber(entry.value ?? 0);
    appendMenuDetailLine('Value', valueAmount);

    const weightAmount = document.createElement('span');
    weightAmount.className = 'inventory-row-menu-summary-value';
    weightAmount.textContent = formatInventoryMenuNumber(entry.weight ?? 0);
    appendMenuDetailLine('Weight', weightAmount);

    const url = typeof entry.url === 'string' ? entry.url.trim() : '';
    if (url) {
      let displayURL = url;
      try {
        displayURL = new URL(url, window.location.href).hostname || url;
      } catch (err) {
        displayURL = url.replace(/^https?:\/\//i, '').split('/')[0] || url;
      }
      const urlLink = document.createElement('a');
      urlLink.className = 'inventory-row-menu-summary-value inventory-row-menu-summary-link';
      urlLink.href = url;
      urlLink.target = '_blank';
      urlLink.rel = 'noopener';
      urlLink.textContent = displayURL;
      urlLink.addEventListener('click', (event) => {
        event.stopPropagation();
      });
      appendMenuDetailLine('URL', urlLink);
    }

    overflowMenu.appendChild(menuSummary);

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
        closeCharacterOverflowMenu();
        await handler();
      });
      overflowMenu.appendChild(button);
      return button;
    };

    const currentContainerId = entry.isContainer ? null : entry.containerId || null;
    const moveTargets = entry.isContainer
      ? []
      : currentInventory
          .filter((candidate) => candidate && candidate.isContainer && candidate.id && candidate.id !== currentContainerId)
          .map((candidate) => ({
            id: candidate.id,
            label: containerLabels.get(candidate.id) || candidate.name || 'Container'
          }));
    const hasMoveSection = !entry.isContainer && (moveTargets.length > 0 || currentContainerId);

    if (hasMoveSection) {
      appendOverflowMenuSeparator(overflowMenu);
      if (currentContainerId) {
        addMenuItem('🛡️ Equip Item', async () => {
          await moveInventoryEntryToContainer(entry.id, null);
        });
      }
      moveTargets.forEach((target) => {
        addMenuItem(`➡️ Move to ${target.label}`, async () => {
          await moveInventoryEntryToContainer(entry.id, target.id);
        });
      });
      appendOverflowMenuSeparator(overflowMenu);
    }

    const openOverflowMenu = () => {
      closeCharacterOverflowMenu(overflowMenu);
      overflowMenu.classList.remove('hidden');
      overflowMenu.setAttribute('aria-hidden', 'false');
      const centered = isNarrowPopupViewport();
      overflowMenu.classList.toggle('popup-centered', centered);
      overflowMenu.style.left = centered ? '' : '0';
      overflowMenu.style.right = centered ? '' : 'auto';
      overflowMenu.style.top = centered ? '' : 'calc(100% + 0.35rem)';
      overflowMenu.style.bottom = '';
      overflowMenu.style.transform = '';
      overflowToggle.setAttribute('aria-expanded', 'true');
      if (!centered) {
        window.requestAnimationFrame(() => {
          const menuRect = overflowMenu.getBoundingClientRect();
          const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
          const overflowRight = menuRect.right > viewportWidth - 8;
          const overflowLeft = menuRect.left < 8;
          if (overflowRight && !overflowLeft) {
            overflowMenu.style.left = 'auto';
            overflowMenu.style.right = '0';
          }
        });
      }
    };

    addMenuItem('✏️ Edit', () => {
      setSelectedInventoryRow(row);
      editSelectedInventoryEntry();
    });
    addMenuItem('📦 Send to Party Treasure', async () => {
      setSelectedInventoryRow(row);
      await sendSelectedInventoryEntryToPartyTreasure();
    }, {
      hidden: entry.isContainer
    });
    addMenuItem(entry.isContainer ? '🗑️ Remove Container' : '🗑️ Remove', () => {
      setSelectedInventoryRow(row);
      removeSelectedInventoryEntry();
    }, {
      className: 'secondary danger'
    });

    overflowToggle.addEventListener('click', (event) => {
      event.stopPropagation();
      const isOpen = !overflowMenu.classList.contains('hidden');
      if (isOpen) {
        closeCharacterOverflowMenu();
      } else {
        openOverflowMenu();
      }
    });
    overflowToggle.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      const isOpen = !overflowMenu.classList.contains('hidden');
      if (isOpen) {
        closeCharacterOverflowMenu();
      } else {
        openOverflowMenu();
      }
    });
    overflowMenu.addEventListener('click', (event) => {
      event.stopPropagation();
    });

    overflow.appendChild(overflowToggle);
    overflow.appendChild(overflowMenu);
    return overflow;
  }

  function createInventoryDisplayRow(entry = {}, options = {}) {
    const normalized = normalizeInventoryEntry(entry, options.containerId ?? null, options.isContainer ?? false);
    const row = inventoryView.createInventoryDisplayRow
      ? inventoryView.createInventoryDisplayRow(normalized, {
          ...options,
          rowClassName: 'inventory-entry-display',
          datasetEntry: JSON.stringify(normalized),
          onRowClick: (selectedRow) => setSelectedInventoryRow(selectedRow),
          firstColumnRenderer: ({ row: renderedRow }) => buildInventoryRowOverflowControls(normalized, renderedRow, options)
        })
      : null;
    return row;
  }

  function appendInventoryDisplayRow(entry = {}, options = {}) {
    const normalized = normalizeInventoryEntry(entry, options.containerId ?? null, options.isContainer ?? false);
    const targetBody =
      options.targetBody ||
      (options.containerId ? getInventoryContainerBody(options.containerId) : inventoryFields);
    if (!targetBody) return null;
    const row = createInventoryDisplayRow(normalized, options);
    targetBody.appendChild(row);
    return row;
  }

  function buildInventoryContainerSection(containerEntry, allEntries, displayLabel = null, containerLabels = null) {
    if (!inventoryContainerSections) return null;
    if (inventoryView.buildInventoryContainerSection) {
      return inventoryView.buildInventoryContainerSection(containerEntry, allEntries, {
        displayLabel: displayLabel || containerEntry.name || 'Container',
        containerLabels,
        containerSectionsEl: inventoryContainerSections,
        categoryIcons: equipmentCategoryIcons,
        rowClassName: 'inventory-entry-display',
        onRowClick: (selectedRow) => setSelectedInventoryRow(selectedRow),
        firstColumnRenderer: ({ row, entry, options: rowOptions }) => buildInventoryRowOverflowControls(entry, row, rowOptions)
      });
    }
    return null;
  }

  function buildInventoryFields(items = []) {
    if (!inventoryFields) return;
    const previouslySelectedEntryId = inventorySelectedRow?.dataset.inventoryEntryId || null;
    currentInventory = Array.isArray(items)
      ? items.map((entry) => normalizeInventoryEntry(entry)).filter(Boolean)
      : [];
    inventoryFields.innerHTML = '';
    if (inventoryContainerSections) {
      inventoryContainerSections.innerHTML = '';
    }
    const rootEntries = currentInventory.filter((entry) => !entry.isContainer && !entry.containerId);
    const containerEntries = currentInventory.filter((entry) => entry.isContainer && !entry.containerId);
    const containerLabels = buildInventoryContainerDisplayLabels(containerEntries);
    rootEntries.forEach((entry) => {
      appendInventoryDisplayRow(entry, {
        targetBody: inventoryFields,
        containerLabels,
        onRowClick: (selectedRow) => setSelectedInventoryRow(selectedRow)
      });
    });
    containerEntries.forEach((entry) => {
      buildInventoryContainerSection(entry, currentInventory, containerLabels.get(entry.id) || null, containerLabels);
    });
    updateInventoryContainerHeadings();
    if (inventoryAddFormContainer) {
      const preservedContainerId = inventoryAddFormContainer.value || inventoryEditingContainerId || '';
      if (inventoryEditingIsContainer) {
        inventoryAddFormContainer.value = '';
        inventoryAddFormContainer.disabled = true;
      } else {
        buildInventoryContainerOptions(preservedContainerId, inventoryEditingIsContainer);
      }
    }
    const restoredSelection =
      (previouslySelectedEntryId
        ? findInventoryRowById(previouslySelectedEntryId)
        : null) ||
      getInventoryPanelRows()[0] ||
      null;
    setSelectedInventoryRow(restoredSelection);
    updateInventoryTotalWeight();
    updateInventoryActionButtons();
  }

  function updateInventoryActionButtons() {
    const isAddFormOpen = inventoryAddFormOpen || Boolean(inventoryAddForm && !inventoryAddForm.classList.contains('hidden'));
    setInventoryTablesVisible(!isAddFormOpen);
    if (inventoryCloseBtn) {
      inventoryCloseBtn.classList.toggle('hidden', isAddFormOpen);
      inventoryCloseBtn.setAttribute('aria-hidden', isAddFormOpen.toString());
    }
    if (inventoryAddBtn) {
      inventoryAddBtn.disabled = isAddFormOpen;
      inventoryAddBtn.setAttribute('aria-disabled', isAddFormOpen.toString());
    }
  }

  function setInventoryAddFormMode(isContainer, options = {}) {
    const nextIsContainer = Boolean(isContainer);
    const preserveContainerSelection = options.preserveContainerSelection !== false;
    inventoryEditingIsContainer = nextIsContainer;
    if (inventoryAddFormKind) {
      inventoryAddFormKind.value = nextIsContainer ? 'container' : 'item';
    }
    if (inventoryAddFormKindRow) {
      inventoryAddFormKindRow.setAttribute('aria-hidden', 'false');
      inventoryAddFormKindRow.classList.remove('hidden');
    }
    if (inventoryAddFormContainerRow) {
      inventoryAddFormContainerRow.classList.toggle('hidden', nextIsContainer);
      inventoryAddFormContainerRow.setAttribute('aria-hidden', nextIsContainer.toString());
    }
    if (inventoryAddFormTitle) {
      inventoryAddFormTitle.textContent = nextIsContainer ? 'Add Container' : 'Add Item';
    }
    if (inventoryAddFormSaveBtn) {
      inventoryAddFormSaveBtn.textContent = nextIsContainer
        ? `${PARTY_TREASURE_CONTAINER_GLYPH} Add Container`
        : '🗡 Add Item';
    }
    if (nextIsContainer) {
      if (inventoryAddFormContainer) {
        inventoryAddFormContainer.value = '';
        inventoryAddFormContainer.disabled = true;
      }
    } else if (inventoryAddFormContainer) {
      buildInventoryContainerOptions(
        preserveContainerSelection
          ? (inventoryAddFormContainer.value || inventoryEditingContainerId || '')
          : '',
        false
      );
    }
  }

  function populateInventoryAddForm(entry = null) {
    const normalized = entry
      ? normalizeInventoryEntry(entry, inventoryEditingContainerId, inventoryEditingIsContainer)
      : normalizeInventoryEntry({}, inventoryEditingContainerId, inventoryEditingIsContainer);
    if (inventoryAddFormName) inventoryAddFormName.value = normalized.name || '';
    if (inventoryAddFormCategory) inventoryAddFormCategory.value = normalized.category || '';
    setInventoryAddFormMode(inventoryEditingIsContainer, {
      preserveContainerSelection: true
    });
    if (!inventoryEditingIsContainer && inventoryAddFormContainer) {
      buildInventoryContainerOptions(
        inventoryTargetHelpers.resolveInventoryDraftContainerId({
          selectedRowData: getInventoryRowData(inventorySelectedRow),
          chosenContainerId: inventoryEditingContainerId,
          isContainer: inventoryEditingIsContainer
        }) || '',
        false
      );
    }
    if (inventoryAddFormQuantity) inventoryAddFormQuantity.value = String(normalized.quantity ?? 1);
    if (inventoryAddFormValue) inventoryAddFormValue.value = String(normalized.value ?? 0);
    if (inventoryAddFormWeight) inventoryAddFormWeight.value = String(normalized.weight ?? 0);
    if (inventoryAddFormUrl) inventoryAddFormUrl.value = normalized.url || '';
  }

  function setInventoryAddFormOpen(open, entry = null, options = {}) {
    if (!inventoryAddForm) return;
    inventoryAddForm.classList.toggle('hidden', !open);
    inventoryAddForm.setAttribute('aria-hidden', (!open).toString());
    inventoryAddFormOpen = open;
    inventoryEditingEntryId = open && entry ? (entry.id || null) : null;
    inventoryEditingContainerId = open ? (options.containerId ?? null) : null;
    inventoryEditingIsContainer = open ? Boolean(options.isContainer) : false;
    if (inventoryAddFormKindRow) {
      inventoryAddFormKindRow.classList.toggle('hidden', false);
      inventoryAddFormKindRow.setAttribute('aria-hidden', 'false');
    }
    if (open) {
      populateInventoryAddForm(entry);
      applyInventoryPresetToForm(inventoryAddFormName?.value || '');
      refreshInventorySelectedRowIcon();
      if (inventoryAddFormTitle && entry) {
        inventoryAddFormTitle.textContent = inventoryEditingIsContainer ? 'Edit Container' : 'Edit Item';
      }
      if (inventoryAddFormSaveBtn && entry) {
        inventoryAddFormSaveBtn.textContent = 'Save Changes';
      }
    } else {
      inventoryEditingEntryId = null;
      inventoryEditingContainerId = null;
      inventoryEditingIsContainer = false;
      populateInventoryAddForm(null);
    }
    updateInventoryActionButtons();
  }

  function collectInventoryDraftFromForm() {
    const name = (inventoryAddFormName?.value || '').trim();
    const category = (inventoryAddFormCategory?.value || '').trim();
    const quantityRaw = (inventoryAddFormQuantity?.value || '').trim();
    const valueRaw = (inventoryAddFormValue?.value || '').trim();
    const weightRaw = (inventoryAddFormWeight?.value || '').trim();
    const url = (inventoryAddFormUrl?.value || '').trim();
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
    const selectedContainerId = inventoryTargetHelpers.resolveInventoryDraftContainerId({
      selectedRowData: getInventoryRowData(inventorySelectedRow),
      chosenContainerId: inventoryAddFormContainer ? inventoryAddFormContainer.value : null,
      isContainer: inventoryEditingIsContainer
    });
    return {
      id: inventoryEditingEntryId || createInventoryEntryId(),
      name,
      quantity,
      value,
      weight,
      url: url || null,
      category: category || null,
      containerId: inventoryEditingIsContainer ? null : selectedContainerId,
      isContainer: inventoryEditingIsContainer
    };
  }

  function upsertInventoryEntry(items = [], entry = {}) {
    const normalizedEntry = normalizeInventoryEntry(entry, entry.containerId ?? null, Boolean(entry.isContainer));
    const normalizedItems = Array.isArray(items)
      ? items.map((item) => normalizeInventoryEntry(item))
      : [];
    const index = normalizedItems.findIndex((item) => item.id === normalizedEntry.id);
    if (index >= 0) {
      normalizedItems[index] = normalizedEntry;
    } else {
      normalizedItems.push(normalizedEntry);
    }
    return normalizedItems;
  }

  function getSelectedInventoryContainerId() {
    if (!inventorySelectedRow) return null;
    const rowData = getInventoryRowData(inventorySelectedRow) || {};
    if (rowData.isContainer) {
      return rowData.id || null;
    }
    return rowData.containerId || null;
  }

  function addInventoryItemToSelectedSection() {
    const containerId = getSelectedInventoryContainerId();
    setInventoryAddFormOpen(true, null, {
      containerId,
      isContainer: false
    });
    window.requestAnimationFrame(() => {
      inventoryAddFormName?.focus();
      inventoryAddFormName?.select?.();
    });
  }

  function addInventoryContainer() {
    setInventoryAddFormOpen(true, null, {
      containerId: null,
      isContainer: true
    });
    window.requestAnimationFrame(() => {
      inventoryAddFormName?.focus();
      inventoryAddFormName?.select?.();
    });
  }

  function editSelectedInventoryEntry() {
    if (!inventorySelectedRow) return;
    const entry = getInventoryRowEntry(inventorySelectedRow);
    if (!entry) return;
    setInventoryAddFormOpen(true, entry, {
      containerId: entry.containerId || null,
      isContainer: Boolean(entry.isContainer)
    });
    window.requestAnimationFrame(() => {
      inventoryAddFormName?.focus();
      inventoryAddFormName?.select?.();
    });
  }

  function getInventoryRowEntry(row) {
    if (!row) return null;
    const rowData = getInventoryRowData(row) || {};
    const rawEntry = (() => {
      try {
        return row.dataset.inventoryEntry ? JSON.parse(row.dataset.inventoryEntry) : {};
      } catch {
        return {};
      }
    })();
    return normalizeInventoryEntry({
      ...rawEntry,
      id: rowData.id || rawEntry.id || null,
      containerId: rowData.containerId || rawEntry.containerId || null,
      isContainer: rowData.isContainer ?? rawEntry.isContainer
    }, rowData.containerId || rawEntry.containerId || null, rowData.isContainer ?? rawEntry.isContainer);
  }

  async function saveInventoryItems(items) {
    if (!inventoryEditorCharacterId) return null;
    const character = myCharacters.find((entry) => entry.id === inventoryEditorCharacterId);
    if (!character) {
      closeInventoryEditor();
      return null;
    }
    character.inventory = Array.isArray(items) ? items : [];
    const savedCharacter = await saveCharacterEntry(character);
    if (!savedCharacter) {
      return null;
    }
    currentInventory = Array.isArray(savedCharacter.inventory) ? savedCharacter.inventory : character.inventory;
    return savedCharacter;
  }

  async function commitInventoryAddFormItem() {
    if (!inventoryFields) return;
    let entry;
    try {
      entry = collectInventoryDraftFromForm();
    } catch (err) {
      if (statusDiv) {
        statusDiv.textContent = err instanceof Error ? err.message : String(err);
      }
      return;
    }
    const items = upsertInventoryEntry(currentInventory, entry);
    try {
      const savedCharacter = await saveInventoryItems(items);
      if (!savedCharacter) return;
      currentInventory = Array.isArray(savedCharacter.inventory) ? savedCharacter.inventory : items;
      buildInventoryFields(currentInventory);
      setSelectedInventoryRow(findInventoryRowById(entry.id) || getInventoryPanelRows()[0] || null);
      setInventoryAddFormOpen(false);
      if (statusDiv) {
        statusDiv.textContent = `Saved ${entry.name}.`;
      }
    } catch (err) {
      if (statusDiv) {
        statusDiv.textContent = `Inventory save failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
  }

  function findInventoryRowById(entryId) {
    if (!entryId || !inventoryFields) return null;
    return getInventoryPanelRows().find((row) => row.dataset.inventoryEntryId === entryId) || null;
  }

  async function removeSelectedInventoryEntry() {
    if (!inventorySelectedRow) return;
    const rowData = getInventoryRowData(inventorySelectedRow) || {};
    const entry = getInventoryRowEntry(inventorySelectedRow);
    const rowName = (entry?.name || 'Item').trim() || 'Item';
    let moveContainedItems = false;
    if (rowData.isContainer) {
      const removalChoice = await showChoiceDialog({
        title: 'Remove Container?',
        header: rowName,
        message: 'Choose what should happen to the container and the items inside it.',
        option1Label: 'Keep Container and Contents',
        option2Label: 'Keep Contents',
        option3Label: 'Discard Contents',
        option1Value: 'keep-container',
        option2Value: 'keep-contents',
        option3Value: 'discard-contents',
        option3ButtonClass: 'danger',
        initialFocus: 'option1',
        dismissValue: null
      });
      if (removalChoice === 'keep-container' || removalChoice === null) {
        return;
      }
      moveContainedItems = removalChoice === 'keep-contents';
    } else {
      const confirmed = await showConfirmDialog({
        title: 'Remove Inventory Item?',
        header: rowName,
        message: 'Remove this item from inventory? This cannot be undone.',
        confirmLabel: 'Remove Item',
        cancelLabel: 'Keep Item',
        confirmButtonClass: 'danger',
        initialFocus: 'cancel'
      });
      if (!confirmed) return;
    }
    const items = inventoryRemovalHelpers.removeInventoryEntry(currentInventory, rowData.id || '', {
      moveContainedItems
    });
    try {
      const savedCharacter = await saveInventoryItems(items);
      if (!savedCharacter) return;
      currentInventory = Array.isArray(savedCharacter.inventory) ? savedCharacter.inventory : items;
      buildInventoryFields(currentInventory);
      setSelectedInventoryRow(findInventoryRowById(rowData.id || '') || getInventoryPanelRows()[0] || null);
      if (statusDiv) {
        statusDiv.textContent = rowData.isContainer
          ? moveContainedItems
            ? `Removed ${rowName} and kept contained items.`
            : `Removed ${rowName} and deleted contained items.`
          : `Removed ${rowName}.`;
      }
    } catch (err) {
      if (statusDiv) {
        statusDiv.textContent = `Inventory remove failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
  }

  async function sendSelectedInventoryEntryToPartyTreasure() {
    if (!inventorySelectedRow || !currentCampaignId) return;
    const rowData = getInventoryRowData(inventorySelectedRow) || {};
    const entry = getInventoryRowEntry(inventorySelectedRow);
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
      const savedCharacter = await saveInventoryItems(transfer.sourceItems);
      if (!savedCharacter) {
        currentPartyTreasure = originalPartyTreasure;
        await savePartyTreasureItems(originalPartyTreasure);
        await loadState();
        return;
      }
      currentInventory = Array.isArray(savedCharacter.inventory) ? savedCharacter.inventory : transfer.sourceItems;
      currentPartyTreasure = Array.isArray(updatedCampaign?.partyTreasure)
        ? updatedCampaign.partyTreasure
        : transfer.destinationItems;
      buildInventoryFields(currentInventory);
      buildPartyTreasureFields(currentPartyTreasure);
      setSelectedInventoryRow(findInventoryRowById(rowData.id || '') || getInventoryPanelRows()[0] || null);
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

  async function moveInventoryEntryToContainer(entryId, containerId) {
    const normalizedEntryId = typeof entryId === 'string' ? entryId.trim() : '';
    const normalizedContainerId =
      typeof containerId === 'string'
        ? containerId.trim()
        : (containerId === null ? null : '');
    if (!normalizedEntryId || (normalizedContainerId !== null && !normalizedContainerId)) return;
    const entry = currentInventory.find((item) => item && item.id === normalizedEntryId);
    if (!entry || entry.isContainer) return;
    const normalizedTargetContainerId = normalizedContainerId || null;
    if ((entry.containerId || null) === normalizedTargetContainerId) return;
    const targetContainer = normalizedTargetContainerId
      ? currentInventory.find((item) => item && item.isContainer && item.id === normalizedTargetContainerId)
      : null;
    if (normalizedTargetContainerId && !targetContainer) return;
    const transfer = inventoryTransferHelpers.transferEntry({
      sourceItems: currentInventory,
      destinationItems: currentInventory,
      entryId: normalizedEntryId,
      mapTransferredEntry: (item) => ({
        ...item,
        containerId: normalizedTargetContainerId,
        isContainer: item.isContainer
      }),
      removeFromSource: false
    });
    try {
      const savedCharacter = await saveInventoryItems(transfer.destinationItems);
      if (!savedCharacter) return;
      currentInventory = Array.isArray(savedCharacter.inventory) ? savedCharacter.inventory : transfer.destinationItems;
      buildInventoryFields(currentInventory);
      setSelectedInventoryRow(findInventoryRowById(normalizedEntryId) || getInventoryPanelRows()[0] || null);
      if (statusDiv) {
        statusDiv.textContent = normalizedTargetContainerId
          ? `Moved ${entry.name || 'Item'} to ${targetContainer?.name || 'Container'}.`
          : `Equipped ${entry.name || 'Item'}.`;
      }
    } catch (err) {
      if (statusDiv) {
        statusDiv.textContent = `Inventory move failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
  }

  async function openInventoryEditor(character) {
    if (!character || !inventoryFields) return;
    closeCharacterOverflowMenu();
    if (
      currencyEditorDirty &&
      !(await showConfirmDialog({
        title: 'Discard Money Changes?',
        header: 'Unsaved currency edits',
        message: 'Discard money changes? This cannot be undone.',
        confirmLabel: 'Discard Changes',
        cancelLabel: 'Keep Editing',
        confirmButtonClass: 'danger',
        initialFocus: 'cancel'
      }))
    ) {
      return;
    }
    closeCurrencyEditor();
    inventoryEditorCharacterId = character.id;
    if (inventoryDialogTitle) {
      inventoryDialogTitle.textContent = `🎒 Inventory - ${character.name || 'Character'}`;
    }
    await loadEquipmentLibrary();
    setInventoryAddFormOpen(false);
    currentInventory = Array.isArray(character.inventory)
      ? character.inventory.map((entry) => normalizeInventoryEntry(entry)).filter(Boolean)
      : [];
    buildInventoryFields(currentInventory);
    setInventoryPanelOpen(true);
    window.requestAnimationFrame(() => {
      inventoryAddBtn?.focus();
    });
  }

  function closeInventoryEditor() {
    inventoryEditorCharacterId = null;
    inventorySelectedRow = null;
    currentInventory = [];
    if (inventoryDialogTitle) {
      inventoryDialogTitle.textContent = '🎒 Inventory';
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
    setInventoryAddFormOpen(false);
    setInventoryPanelOpen(false);
    setInventoryTablesVisible(true);
    updateInventoryActionButtons();
  }

  function closeCharacterOverflowMenu(exceptMenu = null) {
    document.querySelectorAll('.character-overflow-menu').forEach((menu) => {
      if (menu === exceptMenu) return;
      menu.classList.add('hidden');
      menu.setAttribute('aria-hidden', 'true');
      const toggle = menu._overflowToggle || menu.parentElement?.querySelector('.character-overflow-toggle');
      if (toggle) {
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (closeOpenModalOverlay()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    let handled = false;
    const hasOpenInventoryForm = inventoryAddFormOpen || Boolean(inventoryAddForm && !inventoryAddForm.classList.contains('hidden'));
    const hasOpenInventory = Boolean(inventoryPanel && !inventoryPanel.classList.contains('hidden'));
    const hasOpenOverflow = document.querySelector('.character-overflow-menu:not(.hidden)');
    const hasOpenStats = Boolean(expandedOrderStatsCharacterId);
    const hasOpenInitiative = Boolean(initiativeEditorCharacterId);
    if (hasOpenInventoryForm) {
      setInventoryAddFormOpen(false);
      handled = true;
    } else if (hasOpenInventory) {
      closeInventoryEditor();
      handled = true;
    }
    if (hasOpenOverflow) {
      closeCharacterOverflowMenu();
      handled = true;
    }
    if (hasOpenStats) {
      closeExpandedOrderStats();
      handled = true;
    }
    if (hasOpenInitiative) {
      closeInitiativeEditor();
      handled = true;
    }
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  });

  document.addEventListener('click', (event) => {
    if (
      event.target instanceof Element &&
      (event.target.closest('.character-overflow') || event.target.closest('.character-name-block'))
    ) {
      return;
    }
    closeCharacterOverflowMenu();
  });

  function updatePlayerEntryGate() {
    const ownerName = getOwnerName();
    if (!ownerName) {
      updateRollInitiativeButtonState();
      return;
    }
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
    updateRollInitiativeButtonState();
  }

  function updatePlayerNameDisplay() {
    if (!playerNameInput) return;
    const ownerName = getOwnerName();
    playerNameInput.value = ownerName ? ownerName : 'Player';
    playerNameInput.classList.toggle('player-name-placeholder', !ownerName);
    document.body.classList.toggle('no-player-name', !ownerName);
    updatePlayerEntryGate();
    if (playerCardPlayerName) {
      playerCardPlayerName.textContent = ownerName || 'Player';
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
    if (roundIndicator) {
      roundIndicator.textContent = `Round: ${round || 1}`;
      roundIndicator.classList.toggle('round-indicator-active', encounterState === 'active');
      roundIndicator.classList.toggle('round-indicator-suspended', encounterState === 'suspended');
      roundIndicator.classList.toggle('round-indicator-new', encounterState !== 'active' && encounterState !== 'suspended');
    }
    if (playerEncounterState) {
      playerEncounterState.classList.toggle('player-encounter-state-mine', Boolean(isMineTurn));
      playerEncounterState.textContent = encounterText;
    }
    if (displayEncounterState) {
      displayEncounterState.classList.remove('player-encounter-state-mine');
      displayEncounterState.textContent = encounterText;
    }
  }

  // Admin UI: show/hide IP banner/QR
  if (displayOnly) {
    if (playerNameEdit) playerNameEdit.style.display = 'none';
    document.body.classList.add('display-only');
    showServerIP();
  } else {
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
    detailsToggle.addEventListener('click', async () => {
      const isOpen =
        detailsPanel.classList.contains('details-panel-open') &&
        !detailsPanel.classList.contains('hidden');
      if (isOpen) {
        if (!(await confirmDiscardChanges({
          dirty: formDirty,
          header: 'You have unsaved detail changes.',
          message: 'Choose Discard Changes to lose them, or Keep Editing to continue working.',
          cancelLabel: 'Keep Editing',
          onDiscard: revertSelectedCharacterDetails
        }))) return;
      } else if (conditionsToggle && conditionsPanel && conditionsPanel.classList.contains('conditions-panel-open')) {
        if (!(await confirmDiscardChanges({
          dirty: conditionsDirty,
          header: 'You have unsaved condition changes.',
          message: 'Choose Discard Changes to lose them, or Return to Conditions to keep editing.',
          cancelLabel: 'Return to Conditions',
          onDiscard: revertSelectedConditions
        }))) return;
        setConditionsPanelOpen(false);
      }
      detailsPanel.classList.toggle('hidden', isOpen);
      detailsPanel.classList.toggle('details-panel-open', !isOpen);
      detailsPanel.classList.toggle('details-panel-collapsed', isOpen);
      detailsToggle.setAttribute('aria-expanded', (!isOpen).toString());
      detailsPanel.setAttribute('aria-hidden', isOpen.toString());
      closeCharacterOverflowMenu();
    });
  }

  if (conditionsToggle && conditionsPanel) {
    conditionsToggle.addEventListener('click', async () => {
      const isOpen =
        conditionsPanel.classList.contains('conditions-panel-open') &&
        !conditionsPanel.classList.contains('hidden');
      if (isOpen) {
        if (!(await confirmDiscardChanges({
          dirty: conditionsDirty,
          header: 'You have unsaved condition changes.',
          message: 'Choose Discard Changes to lose them, or Return to Conditions to keep editing.',
          cancelLabel: 'Return to Conditions',
          onDiscard: revertSelectedConditions
        }))) return;
      } else if (detailsToggle && detailsPanel && detailsPanel.classList.contains('details-panel-open')) {
        if (!(await confirmDiscardChanges({
          dirty: formDirty,
          header: 'You have unsaved detail changes.',
          message: 'Choose Discard Changes to lose them, or Keep Editing to continue working.',
          cancelLabel: 'Keep Editing',
          onDiscard: revertSelectedCharacterDetails
        }))) return;
        detailsPanel.classList.remove('details-panel-open');
        detailsPanel.classList.add('details-panel-collapsed');
        detailsPanel.classList.add('hidden');
        detailsToggle.setAttribute('aria-expanded', 'false');
        detailsPanel.setAttribute('aria-hidden', 'true');
      }
      setConditionsPanelOpen(!isOpen);
      closeCharacterOverflowMenu();
    });
  }

  if (conditionsPanel) {
    conditionsPanel.addEventListener('click', async (event) => {
      if (event.target !== conditionsPanel) return;
      if (!(await confirmDiscardChanges({
        dirty: conditionsDirty,
        header: 'You have unsaved condition changes.',
        message: 'Choose Discard Changes to lose them, or Return to Conditions to keep editing.',
        cancelLabel: 'Return to Conditions',
        onDiscard: revertSelectedConditions
      }))) return;
      setConditionsPanelOpen(false);
    });
  }

  function buildStatsFields() {
    statInputs.clear();
    if (statsFields) statsFields.innerHTML = '';
    if (currentStatsInputs) currentStatsInputs.innerHTML = '';
    if (healthHeading) {
      healthHeading.textContent = 'Health';
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
    return {
      id,
      label,
      appliesTo: Array.isArray(entry.appliesTo)
        ? entry.appliesTo
            .map((role) => (typeof role === 'string' ? role.trim() : ''))
            .filter(Boolean)
        : [],
      stats,
      defaultBlock: Boolean(entry.default ?? entry.defaultBlock)
    };
  }

  function normalizeCurrencySystem(entry) {
    return inventoryView.normalizeCurrencySystem ? inventoryView.normalizeCurrencySystem(entry) : null;
  }

  function normalizeEquipmentItem(entry) {
    if (!entry || typeof entry !== 'object') {
      return null;
    }
    const id = typeof entry.id === 'string' ? entry.id.trim() : '';
    const name = typeof entry.name === 'string' ? entry.name.trim() : '';
    if (!name) {
      return null;
    }
    const value = entry.value == null || entry.value === '' ? 0 : Number(entry.value);
    const weight = entry.weight == null || entry.weight === '' ? 0 : Number(entry.weight);
    if (!Number.isFinite(value) || !Number.isFinite(weight)) {
      return null;
    }
    return {
      id: id || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
      name,
      value,
      weight,
      url: typeof entry.url === 'string' && entry.url.trim() ? entry.url.trim() : null,
      source: typeof entry.source === 'string' && entry.source.trim() ? entry.source.trim() : null,
      notes: typeof entry.notes === 'string' && entry.notes.trim() ? entry.notes.trim() : null
    };
  }

  function normalizeEquipmentItems(items) {
    return Array.isArray(items) ? items.map((item) => normalizeEquipmentItem(item)).filter(Boolean) : [];
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

  function inferCharacterStatBlockIdFromStats(stats) {
    const sourceKeys = normalizeStatEntries(stats)
      .map((stat) => stat.key)
      .filter((key) => typeof key === 'string' && key !== 'TempHP');
    if (sourceKeys.length === 0) {
      return null;
    }
    const normalizedSource = sourceKeys.slice().sort().join('|');
    const match = statBlockDefinitions.find((block) => {
      const blockKeys = normalizeStatEntries(
        (Array.isArray(block.stats) ? block.stats : []).map((key) => ({ key, current: 0, max: 0 }))
      ).map((stat) => stat.key)
        .filter((key) => key !== 'TempHP')
        .slice()
        .sort()
        .join('|');
      return blockKeys === normalizedSource;
    });
    return match?.id || null;
  }

  function getCharacterStatKeys(character) {
    const statBlockId = typeof character?.statBlockId === 'string' ? character.statBlockId.trim() : '';
    const inferredStatBlockId = statBlockId || inferCharacterStatBlockIdFromStats(character?.stats);
    const block = inferredStatBlockId ? statBlockLookup.get(inferredStatBlockId) : null;
    const baseKeys = Array.isArray(block?.stats) && block.stats.length > 0
      ? block.stats.slice()
      : (Array.isArray(character?.stats) && character.stats.length > 0
          ? normalizeStatEntries(character.stats).map((stat) => stat.key)
          : statKeys.slice());
    const extras = Array.isArray(character?.stats)
      ? normalizeStatEntries(character.stats)
          .map((stat) => stat?.key)
          .filter((key) => typeof key === 'string' && key === 'TempHP' && !baseKeys.includes(key))
      : [];
    return baseKeys.concat(extras);
  }

  function tempHpVisibilityStorageKey(ownerName) {
    const normalizedOwner = normalizePlayerName(ownerName);
    const campaignKey = currentCampaignName ? currentCampaignName : 'default';
    return `${LOCAL_TEMP_HP_VISIBILITY_PREFIX}${normalizedOwner}:${campaignKey}`;
  }

  function loadTempHpVisibility(ownerName) {
    if (!ownerName) return {};
    try {
      const raw = localStorage.getItem(tempHpVisibilityStorageKey(ownerName));
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (err) {
      console.warn('Failed to load Temp HP visibility state:', err);
      return {};
    }
  }

  function saveTempHpVisibility(ownerName, visibilityState) {
    if (!ownerName) return;
    try {
      localStorage.setItem(tempHpVisibilityStorageKey(ownerName), JSON.stringify(visibilityState || {}));
    } catch (err) {
      console.warn('Failed to save Temp HP visibility state:', err);
    }
  }

  function getTempHpCurrentValue(character) {
    const tempStat = Array.isArray(character?.stats)
      ? character.stats.find((stat) => stat?.key === 'TempHP')
      : null;
    return Number.isFinite(tempStat?.current) ? tempStat.current : 0;
  }

  function shouldShowTempHpForCharacter(character) {
    if (!supportsTempHp || !character) return false;
    if (getTempHpCurrentValue(character) !== 0) return true;
    const ownerName = getOwnerName();
    if (!ownerName || !character.id) return false;
    const visibilityState = loadTempHpVisibility(ownerName);
    return Boolean(visibilityState[character.id]);
  }

  function setTempHpVisibilityForCharacter(character, visible) {
    if (!character?.id || !supportsTempHp) return;
    const ownerName = getOwnerName();
    if (!ownerName) return;
    const visibilityState = loadTempHpVisibility(ownerName);
    if (visible) {
      visibilityState[character.id] = true;
    } else {
      delete visibilityState[character.id];
    }
    saveTempHpVisibility(ownerName, visibilityState);
    renderCharacterList();
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
      initiativeBonus: initiativeBonusInput ? initiativeBonusInput.value.trim() : '0',
      statBlockId: selectedCharacterId
        ? (myCharacters.find((character) => character.id === selectedCharacterId)?.statBlockId || null)
        : null
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
      if (typeof draft.statBlockId === 'string' && draft.statBlockId.trim()) {
        character.statBlockId = draft.statBlockId.trim();
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
      initiativeBonus: Number.isFinite(character.initiativeBonus) ? String(character.initiativeBonus) : '0',
      statBlockId: character.statBlockId || inferCharacterStatBlockIdFromStats(character.stats) || null,
      referenceUrl: typeof character.referenceUrl === 'string' ? character.referenceUrl : null
    };
    saveDrafts(ownerName, drafts);
  }

  function upsertMyCharacter(savedCharacter) {
    if (!savedCharacter?.id) return;
    const index = myCharacters.findIndex((character) => character.id === savedCharacter.id);
    if (index >= 0) {
      myCharacters[index] = {
        ...myCharacters[index],
        ...savedCharacter
      };
      return;
    }
    myCharacters.push(savedCharacter);
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

  async function saveCharacterEntry(character, options = {}) {
    if (!character) return;
    const reloadState = options.reloadState !== false;
    try {
      await ensurePlayerSessionId();
      const payload = {
        id: character.id,
        ownerId: currentPlayerSessionId,
        ownerName: character.ownerName,
        name: character.name,
        statBlockId: character.statBlockId || inferCharacterStatBlockIdFromStats(character.stats) || null,
        initiative: character.initiative,
        stats: Array.isArray(character.stats) ? character.stats : [],
        currency: Array.isArray(character.currency) ? character.currency : null,
        inventory: Array.isArray(character.inventory) ? character.inventory : null,
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
      const savedCharacter = await characterRes.json();
      upsertMyCharacter(savedCharacter);
      updateDraftForCharacter(savedCharacter);
      lastStateJson = null;
      if (reloadState) {
        await loadState();
      }
      return savedCharacter;
    } catch (err) {
      console.error('Failed to auto-save character:', err);
      return null;
    }
  }

  async function editCharacterInitiative(character) {
    if (!character) return;
    openInitiativeEditor(character);
  }

  async function deleteMyCharacter(character) {
    if (!character?.id) return;
    const confirmed = await showConfirmDialog({
      title: 'Delete Character?',
      header: character.name || 'This character',
      message: 'Remove this character from the tracker? This cannot be undone.',
      confirmLabel: 'Delete Character',
      cancelLabel: 'Keep Character',
      confirmButtonClass: 'danger',
      initialFocus: 'cancel'
    });
    if (!confirmed) {
      return;
    }
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
      if (character.id) {
        const ownerName = getOwnerName();
        if (ownerName) {
          const visibilityState = loadTempHpVisibility(ownerName);
          if (visibilityState[character.id]) {
            delete visibilityState[character.id];
            saveTempHpVisibility(ownerName, visibilityState);
          }
        }
      }
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
    currentHealthLabel =
      typeof conditionSet?.healthLabel === 'string' && conditionSet.healthLabel.trim()
        ? conditionSet.healthLabel.trim()
        : 'HP';
    setStatAliases(conditionSet?.statAliases);
    setEncounterHealthLabel(currentHealthLabel);
    currentStandardDie =
      typeof conditionSet?.standardDie === 'string' && conditionSet.standardDie.trim()
        ? conditionSet.standardDie.trim()
        : null;
    statBlockDefinitions = Array.isArray(conditionSet?.statBlocks)
      ? conditionSet.statBlocks.map((entry) => normalizeStatBlockDefinition(entry)).filter(Boolean)
      : [];
    statBlockLookup = new Map(statBlockDefinitions.map((block) => [block.id, block]));
    equipmentLibraryReference =
      conditionSet && conditionSet.equipmentLibrary && typeof conditionSet.equipmentLibrary.file === 'string'
        ? {
            file: conditionSet.equipmentLibrary.file.trim(),
            categoryIcons: typeof conditionSet.equipmentLibrary.categoryIcons === 'object'
              ? conditionSet.equipmentLibrary.categoryIcons
              : {}
          }
        : null;
    equipmentCategoryIcons =
      equipmentLibraryReference && typeof equipmentLibraryReference.categoryIcons === 'object'
        ? equipmentLibraryReference.categoryIcons
        : {};
    equipmentLibraryLoaded = false;
    equipmentLibraryItems = [];
    updateInventoryItemOptions();
    if (partyTreasurePanel && !partyTreasurePanel.classList.contains('hidden')) {
      buildPartyTreasureFields(currentPartyTreasure);
    }
    if (inventoryPanel && !inventoryPanel.classList.contains('hidden')) {
      buildInventoryFields(currentInventory);
      updateInventoryContainerHeadings();
    }
    if (equipmentLibraryReference) {
      void loadEquipmentLibrary();
    }
    currencySystem = normalizeCurrencySystem(conditionSet?.currency);
    if (!currencySystem) {
      closeCurrencyEditor();
    }
    updatePartyTreasureActionButtons();
    updatePartyTreasureMoneySummary();
    if (moneyCharacterBtn) {
      moneyCharacterBtn.classList.add('hidden');
      moneyCharacterBtn.disabled = true;
      moneyCharacterBtn.setAttribute('aria-disabled', 'true');
    }
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
    updateReleaseButtonState();
  }

function getOwnerName() {
    const ownerName = ownerInput ? ownerInput.value.trim() : '';
    return hasRealPlayerName(ownerName) ? ownerName : '';
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
    const displayNameValue = resolvePlayerDisplayName(player, trimmedName);
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
      const displayName = resolvePlayerDisplayName(player);
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
    return sharedGetCharacterControllerName(character);
  }

  function buildCharacterOverflowControls(character, options = {}) {
    const overflow = document.createElement('div');
    overflow.className = 'character-overflow';
    const overflowToggle = document.createElement('button');
    overflowToggle.type = 'button';
    overflowToggle.className = 'character-overflow-toggle';
    overflowToggle.setAttribute('aria-label', `Manage ${character.name || 'character'}`);
    overflowToggle.setAttribute('aria-haspopup', 'menu');
    overflowToggle.setAttribute('aria-expanded', 'false');
    overflowToggle.textContent = 'MENU';
    const overflowMenu = document.createElement('div');
    overflowMenu.className = 'character-overflow-menu hidden';
    overflowMenu.setAttribute('role', 'menu');
    overflowMenu.setAttribute('aria-hidden', 'true');
    overflowMenu.style.position = 'fixed';
    overflowMenu.style.zIndex = '10000';
    overflowMenu._overflowToggle = overflowToggle;
    document.body.appendChild(overflowMenu);

    const overflowTitle = document.createElement('div');
    overflowTitle.className = 'character-overflow-title';
    overflowTitle.textContent = character.name || 'Character';
    overflowMenu.appendChild(overflowTitle);

    const openOverflowMenu = () => {
      closeCharacterOverflowMenu(overflowMenu);
      overflowMenu.classList.remove('hidden');
      overflowMenu.setAttribute('aria-hidden', 'false');
      const centered = isNarrowPopupViewport();
      overflowMenu.classList.toggle('popup-centered', centered);
      overflowMenu.style.left = centered ? '' : '';
      overflowMenu.style.right = centered ? '' : '';
      overflowMenu.style.top = centered ? '' : '';
      overflowMenu.style.bottom = '';
      overflowMenu.style.transform = '';
      overflowToggle.setAttribute('aria-expanded', 'true');
      if (!centered) {
        const anchorElement = options.anchorElement || overflowToggle;
        const toggleRect = anchorElement.getBoundingClientRect();
        overflowMenu.style.top = `${toggleRect.bottom + 6}px`;
        overflowMenu.style.left = `${toggleRect.left}px`;
        overflowMenu.style.right = 'auto';
        window.requestAnimationFrame(() => {
          const menuRect = overflowMenu.getBoundingClientRect();
          const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
          const overflowRight = menuRect.right > viewportWidth - 8;
          const overflowLeft = menuRect.left < 8;
          if (overflowRight && !overflowLeft) {
            overflowMenu.style.left = 'auto';
            overflowMenu.style.right = '0';
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
        closeCharacterOverflowMenu();
        await handler();
      });
      overflowMenu.appendChild(button);
      return button;
    };

    const currencyTotal = formatCharacterCurrencyTotal(character);
    const menuGroups = options.claimOnly
      ? [
          [
            {
              label: '🏷️ Claim Character',
              handler: async () => {
                await claimCharacter(character);
              }
            }
          ]
        ]
      : [
          [
            {
              label: '🎒 Inventory',
              handler: async () => {
                await openInventoryEditor(character);
              }
            },
            {
              label: currencyTotal ? `🪙 Money: ${currencyTotal}` : '🪙 Money',
              handler: () => openCurrencyEditor(character),
              options: {
                hidden: !(currencySystem && currencySystem.units.length > 0)
              }
            },
            {
              label: '💰 Party Treasure',
              handler: async () => {
                openPartyTreasureEditor(character);
              }
            }
          ],
          [
            {
              label: '✏️ Edit Character',
              handler: () => {
                void openDetailsEditorForCharacter(character);
              }
            },
            {
              label: '↩️ Release Character',
              handler: async () => {
                if (character.claimedSessionId !== currentPlayerSessionId) return;
                await releaseClaimForCharacter(character);
              },
              options: {
                hidden: character.claimedSessionId !== currentPlayerSessionId
              }
            },
            {
              label: '🗑️ Remove Character',
              handler: async () => {
                await deleteMyCharacter(character);
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
        closeCharacterOverflowMenu();
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

  function renderCharacterList() {
    if (!characterList) return;
    characterList.innerHTML = '';

    if (myCharacters.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'subtitle';
      empty.textContent = 'No characters yet.';
      characterList.appendChild(empty);
      if (removeCharacterBtn) {
        removeCharacterBtn.disabled = true;
        removeCharacterBtn.setAttribute('aria-disabled', 'true');
      }
      updateTurnCompleteButtonState();
      updateRollInitiativeButtonState();
      return;
    }

    myCharacters.forEach((character) => {
      const item = document.createElement('div');
      item.className = 'character-item';
      if (character.id === currentTurnId) {
        item.classList.add('current-turn');
      }

      const row = document.createElement('div');
      row.className = 'character-row';

      const nameWrap = document.createElement('div');
      nameWrap.className = 'character-name-wrap';
      const nameHeader = document.createElement('div');
      nameHeader.className = 'character-name-row';
      const nameBlock = document.createElement('div');
      nameBlock.className = 'character-name-block';
      const name = document.createElement('div');
      name.className = 'character-name';
      name.textContent = character.name;
      const meta = document.createElement('div');
      meta.className = 'character-meta';
      nameBlock.appendChild(name);
      nameBlock.addEventListener('click', (event) => {
        if (event.target instanceof Element && event.target.closest('button')) return;
        event.stopPropagation();
        openOverflowMenu();
      });
      const { overflow, openOverflowMenu } = buildCharacterOverflowControls(character);
      nameHeader.appendChild(overflow);
      nameHeader.appendChild(nameBlock);
      nameWrap.appendChild(nameHeader);
      nameWrap.appendChild(meta);
      row.appendChild(nameWrap);

      const statsWrap = document.createElement('div');
      statsWrap.className = 'character-stats';
      const stats = Array.isArray(character.stats) ? character.stats : [];
      const statsByKey = new Map(stats.map((stat) => [stat.key, stat]));

      const displayStatKeys = getCharacterStatKeys(character).filter((key) => key !== 'TempHP');
      if (supportsTempHp && shouldShowTempHpForCharacter(character)) {
        displayStatKeys.push('TempHP');
      }

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
        statsWrap.appendChild(line);
      });

      row.appendChild(statsWrap);

      item.appendChild(row);

      const conditionsList = buildEncounterConditionsList(character.conditions, conditionLookup);
      const conditionsCell = document.createElement('div');
      conditionsCell.className = 'character-card-conditions';
      if (conditionsList) {
        conditionsCell.appendChild(conditionsList);
      } else {
        conditionsCell.textContent = '—';
      }
      item.appendChild(conditionsCell);

      characterList.appendChild(item);
    });

    if (removeCharacterBtn) {
      const canRemove = Boolean(selectedCharacterId);
      removeCharacterBtn.disabled = !canRemove;
      removeCharacterBtn.setAttribute('aria-disabled', (!canRemove).toString());
    }
    updateReleaseButtonState();
    updateTurnCompleteButtonState();
    updateRollInitiativeButtonState();
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
        currency: Array.isArray(match.currency) ? match.currency : character.currency,
        inventory: Array.isArray(match.inventory) ? match.inventory : character.inventory,
        statBlockId: match.statBlockId || character.statBlockId || inferCharacterStatBlockIdFromStats(match.stats || character.stats),
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
    if (
      lastEncounterSnapshot &&
      Array.isArray(lastEncounterSnapshot.players) &&
      lastEncounterSnapshot.players.some((player) => player.id === character.id)
    ) {
      renderEncounterRows(lastEncounterSnapshot);
    }
    updateDraftForCharacter(character);
    scheduleCharacterSave(character);
    skipRefresh = true;
  }

  function closeExpandedOrderStats() {
    if (!expandedOrderStatsCharacterId) return;
    expandedOrderStatsCharacterId = null;
    if (lastEncounterSnapshot) {
      renderEncounterRows(lastEncounterSnapshot);
    }
  }

  function toggleExpandedOrderStats(characterId) {
    expandedOrderStatsCharacterId =
      expandedOrderStatsCharacterId === characterId ? null : characterId;
    if (lastEncounterSnapshot) {
      renderEncounterRows(lastEncounterSnapshot);
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

    if (supportsTempHp) {
      const tempHpCurrent = getTempHpCurrentValue(character);
      const tempHpVisible = shouldShowTempHpForCharacter(character);
      const tempToggleLabel = document.createElement('label');
      tempToggleLabel.className = 'player-row-stats-toggle player-row-stats-toggle-bottom';
      const tempToggle = document.createElement('input');
      tempToggle.type = 'checkbox';
      tempToggle.checked = tempHpVisible;
      tempToggle.disabled = tempHpCurrent !== 0;
      tempToggle.addEventListener('click', (event) => {
        event.stopPropagation();
      });
      tempToggle.addEventListener('change', (event) => {
        event.stopPropagation();
        setTempHpVisibilityForCharacter(character, tempToggle.checked);
        if (lastEncounterSnapshot) {
          renderEncounterRows(lastEncounterSnapshot);
        }
      });
      const tempToggleText = document.createElement('span');
      tempToggleText.textContent = 'Show TempHP';
      tempToggleLabel.appendChild(tempToggle);
      tempToggleLabel.appendChild(tempToggleText);
      popover.appendChild(tempToggleLabel);
    }

    return popover;
  }

  function createEncounterIcon(emoji, className, placeholder = false) {
    const icon = document.createElement('span');
    icon.className = `encounter-icon ${className || ''} ${placeholder ? 'encounter-icon-placeholder' : ''}`.trim();
    icon.textContent = emoji;
    icon.setAttribute('aria-hidden', 'true');
    return icon;
  }

  function renderEncounterRows(snapshot) {
    if (!playersBody || !snapshot) return;
    const { players, currentTurnId, encounterState, currentTurnPlayer, round, isMineTurn } = snapshot;
    playersBody.innerHTML = '';

    if (players.length === 0) {
      const hasConditions = conditionLibrary.length > 0;
      playersBody.appendChild(createEmptyEncounterRow(hasConditions ? 4 : 3));
      return;
    }

    for (const p of players) {
      const tr = document.createElement('tr');
      tr.classList.add('player-row');

      const initTd = document.createElement('td');
      const nameTd = document.createElement('td');
      const hpTd = document.createElement('td');
      const conditionsTd = document.createElement('td');
      conditionsTd.classList.add('conditions-cell');

      initTd.textContent = formatInitiative(p.initiative);
      const isClaimablePoolCharacter = sharedIsClaimablePoolCharacter(p);
      if (isClaimablePoolCharacter) {
        initTd.classList.add('init-claimable');
        tr.classList.add('player-row-claimable');
      } else if (p.isReferee) {
        initTd.classList.add('init-referee');
      }
      const isMine =
        !displayOnly &&
        Boolean(currentPlayerSessionId) &&
        p.claimedSessionId === currentPlayerSessionId;
      if (isMine) {
        initTd.classList.add('init-mine');
        tr.classList.add('player-row-owned');
        initTd.style.cursor = 'pointer';
        initTd.setAttribute('role', 'button');
        initTd.setAttribute('aria-label', `Set initiative for ${p.name || 'character'}`);
        initTd.addEventListener('click', (event) => {
          event.stopPropagation();
          openInitiativeEditor(p);
        });
      }

      const nameWrap = document.createElement('div');
      nameWrap.className = 'player-row-name-wrap';
      if (isMine) {
        const { overflow, openOverflowMenu } = buildCharacterOverflowControls(p);
        overflow.classList.add('player-row-overflow');
        nameTd.classList.add('player-row-owned-name-cell');
        const nameButton = document.createElement('button');
        nameButton.type = 'button';
        nameButton.className = 'player-row-name-button';
        nameButton.setAttribute('aria-label', `Manage ${p.name || 'character'}`);
        const nameText = document.createElement('div');
        nameText.className = 'player-row-name-text';
        const nameLine = document.createElement('div');
        nameLine.textContent = p.name;
        nameText.appendChild(nameLine);
        nameWrap.appendChild(nameText);
        nameButton.appendChild(nameWrap);
        nameButton.addEventListener('click', (event) => {
          event.stopPropagation();
          closeExpandedOrderStats();
          openOverflowMenu();
        });
        nameTd.appendChild(nameButton);
        nameTd.appendChild(overflow);
      } else {
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
        if (isClaimablePoolCharacter && !displayOnly) {
          tr.classList.add('player-row-claimable');
          nameTd.classList.add('player-row-claimable-name-cell');
          const { openOverflowMenu } = buildCharacterOverflowControls(p, {
            claimOnly: true,
            anchorElement: nameTd
          });
          const nameButton = document.createElement('button');
          nameButton.type = 'button';
          nameButton.className = 'player-row-name-button player-row-claimable-name-button';
          nameButton.setAttribute('aria-label', `Manage ${p.name || 'character'}`);
          nameButton.appendChild(nameWrap);
          nameButton.addEventListener('click', (event) => {
            event.stopPropagation();
            closeExpandedOrderStats();
            openOverflowMenu();
          });
          nameTd.appendChild(nameButton);
        } else {
          nameTd.appendChild(nameWrap);
        }
      }

      const stats = Array.isArray(p.stats) ? p.stats : [];
      const displayStatKeys = getCharacterStatKeys(p).filter((key) => key !== 'TempHP');
      if (supportsTempHp && shouldShowTempHpForCharacter(p)) {
        displayStatKeys.push('TempHP');
      }
      const orderedStats = orderedEncounterStats(stats, displayStatKeys);
      const statusInfo = encounterStatusInfo(stats, displayStatKeys);

      if (statusInfo) {
        applyEncounterHealthClasses(hpTd, statusInfo);
        hpTd.classList.add('player-row-stats-cell');
        hpTd.innerHTML = '';
        const statsContent = document.createElement('div');
        statsContent.className = 'stats-cell-content';
        const statsInner = document.createElement('div');
        statsInner.className = 'stats-cell-text';
        const canReveal = isMine || p.revealStats;
        const statItems = formatEncounterStatsItems(orderedStats, displayStatKeys);
        if (!displayOnly) {
          statsContent.appendChild(createEncounterIcon('❤️', 'encounter-icon-health', !isMine));
        }
        if (!canReveal) {
          hpTd.classList.add('stats-cell-status-only');
          const statusLabel = healthStatusLabel(statusInfo.ratio, statusInfo.isDead);
          const statusLine = document.createElement('div');
          statusLine.textContent = statusLabel;
          statsInner.appendChild(statusLine);
        }
        if (canReveal) {
          if (displayOnly) {
            const valueLine = document.createElement('div');
            valueLine.textContent = formatEncounterStatsText(orderedStats, displayStatKeys);
            statsInner.appendChild(valueLine);
          } else {
            statItems.forEach((stat) => {
              const valueLine = document.createElement('div');
              valueLine.textContent = formatEncounterStatLine(stat);
              statsInner.appendChild(valueLine);
            });
          }
        }
        statsContent.appendChild(statsInner);
        hpTd.appendChild(statsContent);
        if (isMine) {
          hpTd.setAttribute('role', 'button');
          hpTd.setAttribute('tabindex', '0');
          hpTd.setAttribute('aria-label', `Edit health for ${p.name || 'character'}`);
          hpTd.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            event.stopPropagation();
            toggleExpandedOrderStats(p.id);
          });
        }
        if (isMine && p.id === expandedOrderStatsCharacterId) {
          const statsPopover = buildOrderStatsPopover(p, displayStatKeys);
          hpTd.appendChild(statsPopover);
        }
      } else {
        hpTd.textContent = '—';
      }

      if (isMine && statusInfo) {
        hpTd.style.cursor = 'pointer';
        hpTd.addEventListener('click', (event) => {
          event.stopPropagation();
          toggleExpandedOrderStats(p.id);
        });
      }

      const list = buildEncounterConditionsList(p.conditions, conditionLookup);
      const conditionsContent = document.createElement('div');
      conditionsContent.className = 'conditions-cell-content';
      const conditionsInner = document.createElement('div');
      conditionsInner.className = 'conditions-cell-text';
      if (!displayOnly) {
        const conditionIcon = createEncounterIcon('🩸', 'encounter-icon-conditions', !isMine);
        conditionsContent.appendChild(conditionIcon);
      }
      if (list) {
        conditionsInner.appendChild(list);
      } else {
        conditionsInner.textContent = '—';
      }
      conditionsContent.appendChild(conditionsInner);
      conditionsTd.appendChild(conditionsContent);
      if (isMine) {
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
    queueDisplayRosterLayoutUpdate();
  }

  function selectCharacter(id) {
    const found = myCharacters.find((character) => character.id === id);
    if (!found) return;
    if (currencyEditorCharacterId && currencyEditorCharacterId !== found.id) {
      closeCurrencyEditor();
    }
    if (inventoryEditorCharacterId && inventoryEditorCharacterId !== found.id) {
      closeInventoryEditor();
    }
    if (partyTreasureEditorCharacterId && partyTreasureEditorCharacterId !== found.id) {
      closePartyTreasureEditor();
    }

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
    updateConditionsDialogTitle(found.name || 'this character');
  }

  function clearCharacterSelection() {
    selectedCharacterId = null;
    closeCharacterOverflowMenu();
    closeCurrencyEditor();
    closeInventoryEditor();
    closePartyTreasureEditor();
    setDetailsPanelOpen(false);
    setConditionsPanelOpen(false);
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
    if (conditionsCharacter) {
      conditionsCharacter.textContent = 'this character';
    }
    updateConditionsDialogTitle('this character');
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
    return (
      Boolean(character) &&
      encounterState === 'active' &&
      (character.initiative === null || character.initiative === undefined)
    );
  }

  async function handleInitiativeAction(character) {
    if (!character) return;
    if (character.initiative !== null && character.initiative !== undefined) return;
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

  async function handleRollInitiativeForAllCharacters() {
    if (displayOnly || encounterState !== 'active') return;
    const charactersToRoll = myCharacters.filter((character) => needsInitiativeAction(character));
    for (const character of charactersToRoll) {
      await handleInitiativeAction(character);
    }
    renderCharacterList();
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
    updateConditionsDialogTitle(addNameInput ? addNameInput.value.trim() || 'this character' : 'this character');
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
    updateConditionsDialogTitle('this character');
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
      updateRollInitiativeButtonState();
    } catch (err) {
      console.error('Failed to load characters:', err);
    }
  }

  async function refreshCharacterState(ownerName) {
    await loadCharactersForOwner(ownerName);
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
      await loadState();
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
      await loadState();
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
          currentPartyTreasure = [];
          currentPartyTreasureCurrency = [];
          updatePartyTreasureMoneySummary();
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
      currentPartyTreasure = Array.isArray(campaign.partyTreasure) ? campaign.partyTreasure : [];
      currentPartyTreasureCurrency = Array.isArray(campaign.currency) ? campaign.currency : [];
      if (partyTreasurePanel && !partyTreasurePanel.classList.contains('hidden')) {
        buildPartyTreasureFields(currentPartyTreasure);
      }
      updatePartyTreasureMoneySummary();
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
      currentPartyTreasure = [];
      currentPartyTreasureCurrency = [];
      updatePartyTreasureMoneySummary();
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
    playerNameEdit.setAttribute('aria-hidden', (!show).toString());
    if (playerNameEditBtn) {
      playerNameEditBtn.classList.toggle('hidden', show);
    }
    if (playerNameInput) {
      playerNameInput.readOnly = !show;
    }
  }

  async function logoutPlayerSession() {
    const confirmed = await showConfirmDialog({
      title: 'Log Out?',
      header: 'Return to the join page',
      message: 'Log out and return to the join page?',
      confirmLabel: 'Log Out',
      cancelLabel: 'Stay Signed In',
      confirmButtonClass: 'danger',
      initialFocus: 'cancel'
    });
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
    currentPlayerSessionId = '';
    if (ownerInput) ownerInput.value = '';
    if (playerNameInput) playerNameInput.value = '';
    updatePlayerNameDisplay();
    window.location.replace('/index.html');
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

  if (detailsPanel) {
    detailsPanel.addEventListener('click', (event) => {
      if (event.target !== detailsPanel) return;
      if (detailsCancelBtn) {
        detailsCancelBtn.click();
      } else {
        setDetailsPanelOpen(false);
      }
    });
  }

  if (addForm) {
    addForm.addEventListener('click', (event) => {
      if (event.target !== addForm) return;
      if (addCancelBtn) {
        addCancelBtn.click();
      } else {
        hideAddForm();
      }
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

  if (playerNameLogoutBtn) {
    playerNameLogoutBtn.addEventListener('click', () => {
      void logoutPlayerSession();
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

  if (moneyCharacterBtn) {
    moneyCharacterBtn.addEventListener('click', () => {
      const selected = selectedCharacterId
        ? myCharacters.find((character) => character.id === selectedCharacterId)
        : null;
      if (!selected || !currencySystem) return;
      openCurrencyEditor(selected);
    });
  }

  if (inventoryCharacterBtn) {
    inventoryCharacterBtn.addEventListener('click', async () => {
      const selected = selectedCharacterId
        ? myCharacters.find((character) => character.id === selectedCharacterId)
        : null;
      if (!selected) return;
      await openInventoryEditor(selected);
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

  if (currencySaveBtn) {
    currencySaveBtn.addEventListener('click', async () => {
      await saveCurrencyFromEditor();
    });
  }

  if (currencyCancelBtn) {
    currencyCancelBtn.addEventListener('click', async () => {
      if (
        currencyEditorDirty &&
        !(await showConfirmDialog({
          title: 'Discard Money Changes?',
          header: 'Unsaved currency edits',
          message: 'Discard money changes? This cannot be undone.',
          confirmLabel: 'Discard Changes',
          cancelLabel: 'Keep Editing',
          confirmButtonClass: 'danger',
          initialFocus: 'cancel'
        }))
      ) {
        return;
      }
      closeCurrencyEditor();
    });
  }

  if (currencyPanel) {
    currencyPanel.addEventListener('click', async (event) => {
      if (event.target !== currencyPanel) return;
      if (
        currencyEditorDirty &&
        !(await showConfirmDialog({
          title: 'Discard Money Changes?',
          header: 'Unsaved currency edits',
          message: 'Discard money changes? This cannot be undone.',
          confirmLabel: 'Discard Changes',
          cancelLabel: 'Keep Editing',
          confirmButtonClass: 'danger',
          initialFocus: 'cancel'
        }))
      ) {
        return;
      }
      closeCurrencyEditor();
    });
  }

  if (partyTreasureAddBtn) {
    partyTreasureAddBtn.addEventListener('click', () => {
      addPartyTreasureItem();
    });
  }
  if (partyTreasureMoneyBtn) {
    partyTreasureMoneyBtn.addEventListener('click', () => {
      openPartyTreasureMoneyEditor();
    });
  }
  if (partyTreasureDisburseBtn) {
    partyTreasureDisburseBtn.addEventListener('click', () => {
      openPartyTreasureDisburseEditor();
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
      refreshPartyTreasureSelectedRowIcon();
    });
    partyTreasureAddFormName.addEventListener('change', () => {
      applyPartyTreasurePresetToForm(partyTreasureAddFormName.value);
      refreshPartyTreasureSelectedRowIcon();
    });
  }
  if (partyTreasureAddFormCategory) {
    partyTreasureAddFormCategory.addEventListener('input', () => {
      refreshPartyTreasureSelectedRowIcon();
    });
    partyTreasureAddFormCategory.addEventListener('change', () => {
      refreshPartyTreasureSelectedRowIcon();
    });
  }

  if (partyTreasureRemoveBtn) {
    partyTreasureRemoveBtn.addEventListener('click', () => {
      removeSelectedPartyTreasureItem();
    });
  }

  if (partyTreasureClaimBtn) {
    partyTreasureClaimBtn.addEventListener('click', async () => {
      await claimSelectedPartyTreasureItem();
    });
  }

  if (partyTreasureMoneySaveBtn) {
    partyTreasureMoneySaveBtn.addEventListener('click', async () => {
      await savePartyTreasureMoneyFromEditor();
    });
  }

  if (partyTreasureMoneyCancelBtn) {
    partyTreasureMoneyCancelBtn.addEventListener('click', () => {
      closePartyTreasureMoneyEditor();
    });
  }
  if (partyTreasureDisburseSaveBtn) {
    partyTreasureDisburseSaveBtn.addEventListener('click', async () => {
      await savePartyTreasureDisburseFromEditor();
    });
  }
  if (partyTreasureDisburseCancelBtn) {
    partyTreasureDisburseCancelBtn.addEventListener('click', () => {
      closePartyTreasureDisburseEditor();
    });
  }

  if (partyTreasureCancelBtn) {
    partyTreasureCancelBtn.addEventListener('click', () => {
      closePartyTreasureEditor();
    });
  }

  if (partyTreasureMoneyPanel) {
    partyTreasureMoneyPanel.addEventListener('click', (event) => {
      if (event.target !== partyTreasureMoneyPanel) return;
      closePartyTreasureMoneyEditor();
    });
  }
  if (partyTreasureDisbursePanel) {
    partyTreasureDisbursePanel.addEventListener('click', (event) => {
      if (event.target !== partyTreasureDisbursePanel) return;
      closePartyTreasureDisburseEditor();
    });
  }
  if (partyTreasureDisburseAmountInput) {
    partyTreasureDisburseAmountInput.addEventListener('input', () => {
      updatePartyTreasureDisburseSummary();
    });
  }

  if (partyTreasurePanel) {
    partyTreasurePanel.addEventListener('click', (event) => {
      if (event.target !== partyTreasurePanel) return;
      closePartyTreasureEditor();
    });
  }

  if (inventoryCloseBtn) {
    inventoryCloseBtn.addEventListener('click', () => {
      closeInventoryEditor();
    });
  }

  if (inventoryAddBtn) {
    inventoryAddBtn.addEventListener('click', () => {
      addInventoryItemToSelectedSection();
    });
  }

  if (inventoryAddFormSaveBtn) {
    inventoryAddFormSaveBtn.addEventListener('click', async () => {
      await commitInventoryAddFormItem();
    });
  }

  if (inventoryAddFormCancelBtn) {
    inventoryAddFormCancelBtn.addEventListener('click', () => {
      setInventoryAddFormOpen(false);
    });
  }

  if (inventoryAddFormName) {
    inventoryAddFormName.addEventListener('input', () => {
      applyInventoryPresetToForm(inventoryAddFormName.value);
      refreshInventorySelectedRowIcon();
    });
    inventoryAddFormName.addEventListener('change', () => {
      applyInventoryPresetToForm(inventoryAddFormName.value);
      refreshInventorySelectedRowIcon();
    });
  }
  if (inventoryAddFormCategory) {
    inventoryAddFormCategory.addEventListener('input', () => {
      refreshInventorySelectedRowIcon();
    });
    inventoryAddFormCategory.addEventListener('change', () => {
      refreshInventorySelectedRowIcon();
    });
  }

  if (inventoryAddFormKind) {
    inventoryAddFormKind.addEventListener('change', () => {
      const isContainer = inventoryAddFormKind.value === 'container';
      setInventoryAddFormMode(isContainer, { preserveContainerSelection: false });
    });
  }

  if (inventoryAddFormContainer) {
    inventoryAddFormContainer.addEventListener('change', () => {
      inventoryEditingContainerId = inventoryAddFormContainer.value || null;
    });
  }

  if (inventoryPanel) {
    inventoryPanel.addEventListener('click', (event) => {
      if (event.target !== inventoryPanel) return;
      closeInventoryEditor();
    });
  }

  document.addEventListener('click', () => {
    closeCharacterOverflowMenu();
    closeExpandedOrderStats();
  });

  if (displayOnly) {
    window.addEventListener('resize', queueDisplayRosterLayoutUpdate);
    window.addEventListener('orientationchange', queueDisplayRosterLayoutUpdate);
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
        statBlockId: inferCharacterStatBlockIdFromStats(statsPayload) || null,
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
      upsertMyCharacter(savedCharacter);
      hideAddForm();
      await refreshCharacterState(ownerName);
      await loadState();
    } catch (err) {
      statusDiv.textContent = 'Error: ' + err.message;
    }
  }

  async function initApp() {
    const hadPlayerSession = await bootstrapPlayerSession();
    try {
      updatePlayerEntryGate();
      updatePlayerNameDisplay();
    } catch (err) {
      console.error('Failed to initialize player header:', err);
    }
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
          updateRollInitiativeButtonState();
          if (playersBody) {
            playersBody.innerHTML = '';
            playersBody.appendChild(createEmptyEncounterRow(conditionLibrary.length > 0 ? 4 : 3));
          }
          queueDisplayRosterLayoutUpdate();
          updateEncounterStateDisplay(1);
          updateConditionsAvailability();
          updateTurnCompleteButtonState();
          return;
        }
        throw new Error('Server returned ' + res.status);
      }

      const state = await res.json();
      const players = state.players || [];
      const round = state.round || 1;
      encounterState = state.encounterState || 'new';
      currentTurnId = state.currentTurnId || null;
      updateRollInitiativeButtonState();
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
      const isMineTurn = Boolean(
        currentTurnId && myCharacters.some((character) => character.id === currentTurnId)
      );
      lastEncounterSnapshot = {
        players,
        round,
        currentTurnId,
        currentTurnPlayer,
        encounterState,
        isMineTurn
      };

      if (currentJson === lastStateJson) {
        // No change → no DOM update → no blinking
        // Still need to update "Turn Complete" visibility, because it
        // depends on local saved name (but that rarely changes)
      } else {
        lastStateJson = currentJson;
        updateEncounterStateDisplay(round, currentTurnPlayer, isMineTurn);

        renderEncounterRows(lastEncounterSnapshot);

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
      updateTurnCompleteButtonState();
      updateRollInitiativeButtonState();

    } catch (err) {
      statusDiv.textContent = 'Error loading state: ' + err.message;
    } finally {
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
      upsertMyCharacter(savedCharacter);

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
      return false;
    }
    const selectedCharacter = myCharacters.find((character) => character.id === selectedCharacterId);
    let stats;
    try {
      stats = collectStatPayloadFromInputs(statInputs, selectedCharacter?.stats, {
        allowNegativeHealth
      });
    } catch (err) {
      statusDiv.textContent = err.message;
      return false;
    }
    const initiative = selectedCharacter ? selectedCharacter.initiative : null;
    const initiativeBonusRaw = initiativeBonusInput ? initiativeBonusInput.value.trim() : '0';
    const initiativeBonus = initiativeBonusRaw === '' ? 0 : Number(initiativeBonusRaw);
    if (!Number.isFinite(initiativeBonus)) {
      statusDiv.textContent = 'Initiative bonus must be a valid number.';
      return false;
    }
    const payload = {
      id: selectedCharacterId,
      ownerId: currentPlayerSessionId,
      ownerName,
      name,
      initiative,
      stats,
      currency: Array.isArray(selectedCharacter?.currency) ? selectedCharacter.currency : null,
      inventory: Array.isArray(selectedCharacter?.inventory) ? selectedCharacter.inventory : null,
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
    if (!savedCharacter) return false;
    upsertMyCharacter(savedCharacter);
    formDirty = false;
    updateDraftFromForm();
    return true;
  }

  async function saveCharacterConditions({ showStatus = true } = {}) {
    const ownerName = getOwnerName();
    const selectedCharacter = myCharacters.find((character) => character.id === selectedCharacterId);
    if (!ownerName || !selectedCharacter || !selectedCharacterId) {
      statusDiv.textContent = 'Player and character are required.';
      return false;
    }
    const conditionList = Array.from(selectedConditions);
    const payload = {
      id: selectedCharacterId,
      ownerId: currentPlayerSessionId,
      ownerName,
      name: selectedCharacter.name,
      initiative: selectedCharacter.initiative,
      stats: Array.isArray(selectedCharacter.stats) ? selectedCharacter.stats : [],
      currency: Array.isArray(selectedCharacter.currency) ? selectedCharacter.currency : null,
      inventory: Array.isArray(selectedCharacter.inventory) ? selectedCharacter.inventory : null,
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
    if (!savedCharacter) return false;
    conditionsDirty = false;
    lastConditionsSignatureFromState = conditionsSignature(conditionList);
    return true;
  }

  // --- Clear all players (admin-only) --------------------------------------

  async function handleClear() {
    if (!displayOnly) {
      statusDiv.textContent = 'Clear is only available on localhost.';
      return;
    }

    const sure = await showConfirmDialog({
      title: 'Clear Player List?',
      header: 'All players will be removed',
      message: 'Really clear the entire player list? This cannot be undone.',
      confirmLabel: 'Clear List',
      cancelLabel: 'Keep Players',
      confirmButtonClass: 'danger',
      initialFocus: 'cancel'
    });
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
  if (rollInitiativeAllBtn) {
    rollInitiativeAllBtn.addEventListener('click', handleRollInitiativeForAllCharacters);
  }
  if (turnCompleteBtn) {
    turnCompleteBtn.addEventListener('click', handleTurnComplete);
  }
  if (detailsSaveBtn) {
    detailsSaveBtn.addEventListener('click', async () => {
      const saved = await saveCharacterDetails({ showStatus: true });
      if (!saved) return;
      setDetailsPanelOpen(false);
    });
  }
  if (detailsCancelBtn) {
    detailsCancelBtn.addEventListener('click', async () => {
      if (!(await confirmDiscardChanges({
        dirty: formDirty,
        header: 'You have unsaved detail changes.',
        message: 'Choose Discard Changes to lose them, or Keep Editing to continue working.',
        cancelLabel: 'Keep Editing',
        onDiscard: revertSelectedCharacterDetails
      }))) return;
      setDetailsPanelOpen(false);
    });
  }
  if (conditionsSaveBtn) {
    conditionsSaveBtn.addEventListener('click', async () => {
      const saved = await saveCharacterConditions({ showStatus: true });
      if (saved) {
        setConditionsPanelOpen(false);
      }
    });
  }
  if (conditionsCancelBtn) {
    conditionsCancelBtn.addEventListener('click', async () => {
      if (!(await confirmDiscardChanges({
        dirty: conditionsDirty,
        header: 'You have unsaved condition changes.',
        message: 'Choose Discard Changes to lose them, or Return to Conditions to keep editing.',
        cancelLabel: 'Return to Conditions',
        onDiscard: revertSelectedConditions
      }))) return;
      setConditionsPanelOpen(false);
    });
  }

  if (initiativeSaveBtn) {
    initiativeSaveBtn.addEventListener('click', async () => {
      await saveInitiativeFromEditor(false);
    });
  }

  if (initiativeCancelBtn) {
    initiativeCancelBtn.addEventListener('click', () => {
      closeInitiativeEditor();
    });
  }

  if (initiativeRollBtn) {
    initiativeRollBtn.addEventListener('click', async () => {
      if (!initiativeEditorCharacterId || !initiativeEditorInput) return;
      const character = myCharacters.find((entry) => entry.id === initiativeEditorCharacterId);
      if (!character) return;
      const rolled = rollStandardDie(currentStandardDie, character.initiativeBonus);
      if (!Number.isFinite(rolled)) {
        statusDiv.textContent = 'Unable to roll initiative.';
        return;
      }
      initiativeEditorInput.value = String(rolled);
      await saveInitiativeFromEditor(false);
    });
  }

  if (initiativeEditorInput) {
    initiativeEditorInput.addEventListener('keydown', async (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        await saveInitiativeFromEditor(false);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
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
      updateConditionsDialogTitle(addNameInput.value.trim() || 'this character');
    });
  }
  if (addCancelBtn) {
    addCancelBtn.addEventListener('click', async () => {
      const hasAddDraft =
        Boolean(addNameInput?.value.trim()) ||
        Array.from(addStatInputs.values()).some((entry) =>
          Boolean(entry.currentInput?.value.trim()) || Boolean(entry.maxInput?.value.trim())
        ) ||
        Boolean(addInitiativeBonusInput?.value.trim()) ||
        Boolean(addRevealStatsInput?.checked) ||
        Boolean(addAutoSkipTurnInput?.checked) ||
        (addUseAppInitiativeRollInput ? addUseAppInitiativeRollInput.checked === false : false);
      if (
        hasAddDraft &&
        !(await showConfirmDialog({
          title: 'Discard New Character?',
          header: 'Unsaved character changes',
          message: 'Discard new character changes? This cannot be undone.',
          confirmLabel: 'Discard Changes',
          cancelLabel: 'Keep Editing',
          confirmButtonClass: 'danger',
          initialFocus: 'cancel'
        }))
      ) {
        return;
      }
      hideAddForm();
    });
  }

  function setInitiativePanelOpen(open) {
    if (!initiativePanel) return;
    initiativePanel.classList.toggle('hidden', !open);
    initiativePanel.classList.toggle('popup-centered', open && isNarrowPopupViewport());
    initiativePanel.setAttribute('aria-hidden', (!open).toString());
  }

  function openInitiativeEditor(character) {
    if (!character || !initiativePanel || !initiativeEditorInput) return;
    initiativeEditorCharacterId = character.id;
    if (initiativeDialogTitle) {
      initiativeDialogTitle.textContent = `🎲 Set Initiative for ${character.name}`;
    }
    if (initiativeRollBtn) {
      const hasInitiative = Number.isFinite(character.initiative);
      initiativeRollBtn.classList.toggle('hidden', hasInitiative);
      initiativeRollBtn.setAttribute('aria-hidden', hasInitiative.toString());
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

  // Initial load + auto-refresh
  
});
