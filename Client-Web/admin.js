const REFRESH_INTERVAL_MS = 5000;

const { updateRulesetIcons, updateRulesetLinks, updateRulesetLicenses } = window.PlayerTrackerRuleset || {
  updateRulesetIcons: () => {},
  updateRulesetLinks: () => {},
  updateRulesetLicenses: () => {}
};

window.addEventListener('DOMContentLoaded', () => {
  const adminCampaignName = document.getElementById('admin-campaign-name');
  const adminRulesetLink = document.getElementById('admin-ruleset-link');
  const adminRulesetLicense = document.getElementById('admin-ruleset-license');
  const adminRulesetLicenseWrap = document.getElementById('admin-ruleset-license-wrap');
  const adminRulesetIcon = document.getElementById('admin-ruleset-icon');
  const adminActiveSummary = document.getElementById('admin-active-summary');

  const campaignList = document.getElementById('admin-campaign-list');
  const campaignStatusDiv = document.getElementById('admin-campaign-status');
  const editSelectedBtn = document.getElementById('admin-campaign-edit');
  const newCampaignBtn = document.getElementById('admin-campaign-new');

  const modal = document.getElementById('admin-campaign-modal');
  const modalTitle = document.getElementById('admin-campaign-dialog-title');
  const modalSummary = document.getElementById('admin-campaign-modal-summary');
  const modalStatus = document.getElementById('admin-campaign-modal-status');
  const modalCancelBtn = document.getElementById('admin-campaign-cancel');
  const modalSaveBtn = document.getElementById('admin-campaign-save');
  const campaignNameInput = document.getElementById('admin-campaign-name-input');
  const campaignRulesetSelect = document.getElementById('admin-ruleset-select');

  let availableRulesets = [];
  let campaignSummaries = [];
  let activeCampaignId = null;
  let selectedCampaignId = null;
  let editorMode = null;
  let editorCampaignId = null;
  let editorOriginalName = '';
  let editorOriginalRulesetId = '';
  let refreshToken = 0;

  function fetchJson(url, options) {
    return fetch(url, options).then(async (res) => {
      if (!res.ok) {
        const message = await res.text().catch(() => '');
        throw new Error(message || `Server returned ${res.status}`);
      }
      return res.json();
    });
  }

  function setStatus(message, isError = false) {
    if (!campaignStatusDiv) return;
    campaignStatusDiv.textContent = message;
    campaignStatusDiv.style.color = isError ? '#b00020' : '';
  }

  function setModalStatus(message, isError = false) {
    if (!modalStatus) return;
    modalStatus.textContent = message;
    modalStatus.style.color = isError ? '#b00020' : '';
  }

  function setRulesetLink(labelText, baseUrl) {
    updateRulesetLinks([adminRulesetLink], labelText, baseUrl);
  }

  function setRulesetLicense(licenseUrl) {
    updateRulesetLicenses([{ linkEl: adminRulesetLicense, wrapEl: adminRulesetLicenseWrap }], licenseUrl);
  }

  function setRulesetIcon(iconUrl, labelText) {
    updateRulesetIcons([adminRulesetIcon], iconUrl, labelText);
  }

  function updateHeader(activeCampaign, library) {
    if (!activeCampaign) {
      if (adminCampaignName) {
        adminCampaignName.textContent = 'Campaign Admin';
      }
      if (adminActiveSummary) {
        adminActiveSummary.textContent = 'No campaign selected.';
      }
      setRulesetLink('', null);
      setRulesetLicense(null);
      setRulesetIcon(null, '');
      return;
    }

    const label = activeCampaign.rulesetLabel || library?.label || activeCampaign.rulesetId || 'No Conditions';
    if (adminCampaignName) {
      adminCampaignName.textContent = activeCampaign.name || 'Campaign Admin';
    }
    if (adminActiveSummary) {
      adminActiveSummary.textContent = `Active: ${activeCampaign.name} - ${label}`;
    }
    setRulesetLink(library?.label || activeCampaign.rulesetLabel || '', library?.rulesBaseUrl || null);
    setRulesetLicense(library?.license || null);
    setRulesetIcon(library?.icon || null, library?.label || activeCampaign.rulesetLabel || '');
  }

  function populateRulesetSelect(rulesets) {
    if (!campaignRulesetSelect) return;
    campaignRulesetSelect.innerHTML = '';
    if (Array.isArray(rulesets) && rulesets.length > 0) {
      rulesets.forEach((ruleset) => {
        const option = document.createElement('option');
        option.value = ruleset.id;
        option.textContent = ruleset.label || ruleset.id;
        campaignRulesetSelect.appendChild(option);
      });
    } else {
      const option = document.createElement('option');
      option.value = 'none';
      option.textContent = 'No Conditions';
      campaignRulesetSelect.appendChild(option);
    }
  }

  function getCampaignLabel(campaign) {
    if (!campaign) return 'Campaign';
    return campaign.name || 'Campaign';
  }

  function renderCampaignList() {
    if (!campaignList) return;
    campaignList.innerHTML = '';

    if (!campaignSummaries.length) {
      const empty = document.createElement('div');
      empty.className = 'subtitle';
      empty.textContent = 'No campaigns yet.';
      campaignList.appendChild(empty);
      updateEditButtonState();
      return;
    }

    const list = document.createElement('ul');
    list.className = 'admin-campaign-list-items';

    campaignSummaries.forEach((campaign) => {
      const li = document.createElement('li');
      li.className = 'admin-campaign-list-item';
      li.dataset.campaignId = campaign.id;
      li.classList.toggle('selected', campaign.id === selectedCampaignId);
      li.classList.toggle('active', campaign.id === activeCampaignId);

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'admin-campaign-row';
      button.addEventListener('click', () => {
        selectedCampaignId = campaign.id;
        updateCampaignListSelection();
        updateEditButtonState();
        updateSelectionStatus();
      });
      button.addEventListener('dblclick', () => {
        selectedCampaignId = campaign.id;
        activateCampaign(campaign.id);
      });

      const name = document.createElement('span');
      name.className = 'admin-campaign-name';
      name.textContent = campaign.name;

      const meta = document.createElement('span');
      meta.className = 'admin-campaign-meta';
      const ruleset = campaign.rulesetLabel || campaign.rulesetId || 'No Conditions';
      meta.textContent = `${ruleset}${campaign.isActive ? ' · Active' : ''}`;

      button.appendChild(name);
      button.appendChild(meta);
      li.appendChild(button);
      list.appendChild(li);
    });

    campaignList.appendChild(list);
    updateEditButtonState();
  }

  function updateCampaignListSelection() {
    if (!campaignList) return;
    campaignList.querySelectorAll('.admin-campaign-list-item').forEach((item) => {
      const campaignId = item.dataset.campaignId || '';
      item.classList.toggle('selected', campaignId === selectedCampaignId);
      item.classList.toggle('active', campaignId === activeCampaignId);
    });
  }

  function updateSelectionStatus() {
    const selected = campaignSummaries.find((campaign) => campaign.id === selectedCampaignId) || null;
    if (!selected) {
      setStatus(activeCampaignId ? 'Select a campaign to edit or double-click to activate it.' : 'Create or activate a campaign.');
      return;
    }
    const label = selected.rulesetLabel || selected.rulesetId || 'No Conditions';
    setStatus(`Selected ${selected.name} - ${label}.`);
  }

  function updateEditButtonState() {
    if (!editSelectedBtn) return;
    editSelectedBtn.disabled = !selectedCampaignId;
  }

  function openModal(mode, campaign = null) {
    if (!modal || !campaignNameInput || !campaignRulesetSelect) return;
    editorMode = mode;
    editorCampaignId = campaign?.id || null;
    editorOriginalName = campaign?.name || '';
    editorOriginalRulesetId = campaign?.rulesetId || '';

    if (modalTitle) {
      modalTitle.textContent = mode === 'new' ? 'New Campaign' : 'Edit Campaign Details';
    }

    if (modalSummary) {
      modalSummary.textContent = mode === 'new'
        ? 'Create a new campaign record. Activate it later from the list.'
        : `Editing ${campaign?.name || 'Campaign'}.`;
    }

    campaignNameInput.value = campaign?.name || '';
    campaignRulesetSelect.value = campaign?.rulesetId || availableRulesets[0]?.id || 'none';

    setModalStatus('');
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    validateModal();
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    editorMode = null;
    editorCampaignId = null;
    editorOriginalName = '';
    editorOriginalRulesetId = '';
    setModalStatus('');
    validateModal();
  }

  function normalizeName(name) {
    return (name || '').trim();
  }

  function nameExists(name, ignoreId = null) {
    const normalized = normalizeName(name).toLowerCase();
    return campaignSummaries.some((campaign) => {
      if (ignoreId && campaign.id === ignoreId) return false;
      return campaign.name.trim().toLowerCase() === normalized;
    });
  }

  function hasEditorChanges() {
    if (!campaignNameInput || !campaignRulesetSelect) return false;
    const name = normalizeName(campaignNameInput.value);
    const rulesetId = campaignRulesetSelect.value;
    if (editorMode === 'new') {
      return Boolean(name);
    }
    return name !== editorOriginalName || rulesetId !== editorOriginalRulesetId;
  }

  function isEditorValid() {
    if (!campaignNameInput || !campaignRulesetSelect) return false;
    const name = normalizeName(campaignNameInput.value);
    const rulesetId = campaignRulesetSelect.value;
    if (!name) return false;
    if (campaignRulesetSelect.options.length > 0 && !rulesetId) return false;
    if (editorMode === 'new') {
      return !nameExists(name);
    }
    return !nameExists(name, editorCampaignId) || name.toLowerCase() === editorOriginalName.toLowerCase();
  }

  function validateModal() {
    if (!modalSaveBtn) return;
    const valid = isEditorValid();
    const changed = hasEditorChanges();
    modalSaveBtn.disabled = !(valid && changed);
  }

  async function fetchHeader() {
    const [campaign, library] = await Promise.all([
      fetch('/campaign').then(async (res) => {
        if (res.status === 409) return null;
        if (!res.ok) {
          const message = await res.text().catch(() => '');
          throw new Error(message || `Server returned ${res.status}`);
        }
        return res.json();
      }),
      fetchJson('/conditions-library')
    ]);
    return { campaign, library };
  }

  async function fetchCampaigns() {
    const campaigns = await fetchJson('/campaigns');
    return Array.isArray(campaigns) ? campaigns : [];
  }

  async function fetchRulesets() {
    const rulesets = await fetchJson('/rulesets');
    return Array.isArray(rulesets) ? rulesets : [];
  }

  async function refreshAll() {
    const token = ++refreshToken;
    try {
      const [rulesets, campaigns, header] = await Promise.all([
        fetchRulesets(),
        fetchCampaigns(),
        fetchHeader()
      ]);
      if (token !== refreshToken) return;
      availableRulesets = rulesets;
      populateRulesetSelect(availableRulesets);
      campaignSummaries = campaigns;
      activeCampaignId = header.campaign?.id || null;
      updateHeader(header.campaign, header.library);
      if (!campaignSummaries.some((campaign) => campaign.id === selectedCampaignId)) {
        selectedCampaignId = activeCampaignId;
      }
      renderCampaignList();
      updateCampaignListSelection();
      updateSelectionStatus();
    } catch (err) {
      setStatus(`Failed to load campaign data: ${err.message}`, true);
    }
  }

  async function activateCampaign(campaignId) {
    try {
      const selected = await fetchJson(`/campaigns/${campaignId}/select`, {
        method: 'POST'
      });
      selectedCampaignId = selected.id;
      await refreshAll();
      setStatus(`Activated ${selected.name}.`);
    } catch (err) {
      setStatus(`Failed to activate campaign: ${err.message}`, true);
    }
  }

  async function saveCampaign() {
    if (!campaignNameInput || !campaignRulesetSelect) return;

    const name = normalizeName(campaignNameInput.value);
    const rulesetId = campaignRulesetSelect.value;

    if (editorMode === 'new') {
      try {
        const created = await fetchJson('/campaigns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, rulesetId })
        });
        selectedCampaignId = created.id;
        closeModal();
        await refreshAll();
        setStatus(`Created ${created.name}.`);
      } catch (err) {
        setModalStatus(`Failed to create campaign: ${err.message}`, true);
      }
      return;
    }

    if (editorMode === 'edit' && editorCampaignId) {
      try {
        const updated = await fetchJson(`/campaigns/${editorCampaignId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, rulesetId })
        });
        selectedCampaignId = updated.id;
        closeModal();
        await refreshAll();
        setStatus(`Updated ${updated.name}.`);
      } catch (err) {
        setModalStatus(`Failed to update campaign: ${err.message}`, true);
      }
    }
  }

  if (newCampaignBtn) {
    newCampaignBtn.addEventListener('click', () => {
      openModal('new');
    });
  }

  if (editSelectedBtn) {
    editSelectedBtn.addEventListener('click', () => {
      const selected = campaignSummaries.find((campaign) => campaign.id === selectedCampaignId) || null;
      if (!selected) return;
      openModal('edit', selected);
    });
  }

  if (modalCancelBtn) {
    modalCancelBtn.addEventListener('click', () => {
      closeModal();
    });
  }

  if (modalSaveBtn) {
    modalSaveBtn.addEventListener('click', () => {
      saveCampaign();
    });
  }

  if (modal) {
    modal.addEventListener('click', (event) => {
      if (event.target !== modal) return;
      closeModal();
    });
  }

  if (campaignNameInput) {
    campaignNameInput.addEventListener('input', () => {
      validateModal();
    });
  }

  if (campaignRulesetSelect) {
    campaignRulesetSelect.addEventListener('change', () => {
      validateModal();
    });
  }

  refreshAll();
  setInterval(refreshAll, REFRESH_INTERVAL_MS);
});
