(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.PlayerTrackerLiveStream = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function createCampaignLiveStream({
    getCampaignId,
    refresh,
    shouldSkipRefresh = () => false,
    consumeSkipRefresh = () => {}
  }) {
    let eventSource = null;
    let eventSourceCampaignId = null;
    let refreshInFlight = false;
    let refreshQueued = false;

    function closeEventStream() {
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      eventSourceCampaignId = null;
    }

    function syncEventStream() {
      const campaignId = getCampaignId ? getCampaignId() : '';
      if (!campaignId || typeof EventSource === 'undefined') {
        closeEventStream();
        return;
      }
      if (eventSource && eventSourceCampaignId === campaignId) {
        return;
      }

      closeEventStream();
      const source = new EventSource(`/campaigns/${encodeURIComponent(campaignId)}/events`);
      eventSource = source;
      eventSourceCampaignId = campaignId;

      const requestRefresh = () => {
        refreshNow();
      };

      source.addEventListener('snapshot', requestRefresh);
      source.addEventListener('campaign-updated', requestRefresh);
      source.addEventListener('turn-changed', requestRefresh);
      source.addEventListener('update', requestRefresh);
      source.onerror = () => {
        // EventSource retries automatically; reconnect refresh comes from the initial snapshot.
      };
    }

    async function refreshNow() {
      if (shouldSkipRefresh()) {
        consumeSkipRefresh();
        return;
      }
      if (refreshInFlight) {
        refreshQueued = true;
        return;
      }

      refreshInFlight = true;
      try {
        await refresh();
        syncEventStream();
      } finally {
        refreshInFlight = false;
        if (refreshQueued) {
          refreshQueued = false;
          refreshNow();
        }
      }
    }

    function start() {
      syncEventStream();
    }

    function stop() {
      closeEventStream();
    }

    return {
      start,
      stop,
      refresh: refreshNow,
      sync: syncEventStream,
      close: closeEventStream
    };
  }

  return {
    createCampaignLiveStream
  };
});
