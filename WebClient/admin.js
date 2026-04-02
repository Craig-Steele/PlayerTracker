function isAdminHost() {
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    throw new Error(`Server returned ${res.status}`);
  }
  return res.json();
}

window.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('campaign-form');
  const nameInput = document.getElementById('campaign-name');
  const rulesetSelect = document.getElementById('ruleset-select');
  const statusDiv = document.getElementById('campaign-status');
  const summaryDiv = document.getElementById('campaign-summary');

  function setStatus(message, isError = false) {
    if (!statusDiv) return;
    statusDiv.textContent = message;
    statusDiv.style.color = isError ? '#b00020' : '';
  }

  function setSummary(campaign) {
    if (!summaryDiv) return;
    if (!campaign) {
      summaryDiv.textContent = '';
      return;
    }
    const label = campaign.rulesetLabel ? campaign.rulesetLabel : 'No Conditions';
    summaryDiv.textContent = `Current: ${campaign.name} - ${label}`;
  }

  function disableForm(message) {
    if (nameInput) nameInput.disabled = true;
    if (rulesetSelect) rulesetSelect.disabled = true;
    if (form) form.querySelector('button[type="submit"]').disabled = true;
    setStatus(message, true);
  }

  if (!isAdminHost()) {
    disableForm('Admin-only. Use localhost to manage campaigns.');
    return;
  }

  async function loadData() {
    try {
      const [rulesets, campaign] = await Promise.all([
        fetchJson('/rulesets'),
        fetchJson('/campaign')
      ]);

      rulesetSelect.innerHTML = '';
      if (Array.isArray(rulesets) && rulesets.length > 0) {
        rulesets.forEach((ruleset) => {
          const option = document.createElement('option');
          option.value = ruleset.id;
          option.textContent = ruleset.label || ruleset.id;
          rulesetSelect.appendChild(option);
        });
      } else {
        const option = document.createElement('option');
        option.value = 'none';
        option.textContent = 'No Conditions';
        rulesetSelect.appendChild(option);
      }

      if (campaign) {
        nameInput.value = campaign.name || '';
        if (campaign.rulesetId) {
          rulesetSelect.value = campaign.rulesetId;
        }
        setSummary(campaign);
      }
    } catch (err) {
      setStatus(`Failed to load campaign data: ${err.message}`, true);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const name = nameInput.value.trim();
    const rulesetId = rulesetSelect.value;

    if (!name) {
      setStatus('Campaign name is required.', true);
      return;
    }

    try {
      setStatus('Saving...');
      const campaign = await fetchJson('/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, rulesetId })
      });
      setSummary(campaign);
      setStatus('Campaign updated.');
    } catch (err) {
      setStatus(`Failed to update campaign: ${err.message}`, true);
    }
  }

  if (form) {
    form.addEventListener('submit', handleSubmit);
  }

  loadData();
});
