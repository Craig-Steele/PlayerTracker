const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildCampaignSettingsPageUrl,
  normalizeCampaignSettingsSource
} = require('./campaign-settings.js');

test('normalizes the campaign settings source', () => {
  assert.equal(normalizeCampaignSettingsSource('admin'), 'admin');
  assert.equal(normalizeCampaignSettingsSource('referee'), 'referee');
  assert.equal(normalizeCampaignSettingsSource('anything-else'), 'referee');
});

test('builds campaign settings page urls for both entry points', () => {
  assert.equal(
    buildCampaignSettingsPageUrl('1234', 'admin'),
    'campaign-settings.html?campaignId=1234&source=admin'
  );
  assert.equal(
    buildCampaignSettingsPageUrl('1234', 'referee'),
    'campaign-settings.html?campaignId=1234&source=referee'
  );
  assert.equal(
    buildCampaignSettingsPageUrl('', 'admin', 'new'),
    'campaign-settings.html?source=admin&mode=new'
  );
  assert.equal(buildCampaignSettingsPageUrl('', 'admin'), 'campaign-settings.html');
});
