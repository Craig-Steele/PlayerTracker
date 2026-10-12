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
    onEncounterStart = () => {},
    shouldSkipRefresh = () => false,
    consumeSkipRefresh = () => {},
    skipInitialSnapshot = false
  }) {
    let eventSource = null;
    let eventSourceCampaignId = null;
    let refreshInFlight = false;
    let refreshQueued = false;
    let lastEventData = null;
    let hasOpenedEventStream = false;

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
      const ignoreSnapshot = skipInitialSnapshot && !hasOpenedEventStream;
      hasOpenedEventStream = true;

      const requestRefresh = (event) => {
        // A stream connection can deliver its initial snapshot immediately
        // before the update that caused the connection to be observed. If
        // both events contain the same snapshot, one refresh is sufficient.
        if (event?.data && event.data === lastEventData) {
          return;
        }
        if (event?.data) {
          lastEventData = event.data;
        }
        refreshNow(event);
      };

      source.addEventListener('snapshot', (event) => {
        if (ignoreSnapshot) return;
        requestRefresh(event);
      });
      const handleEncounterStateChange = (event) => {
        onEncounterStart(event);
        requestRefresh(event);
      };
      source.addEventListener('encounter-start', handleEncounterStateChange);
      source.addEventListener('encounter-resume', handleEncounterStateChange);
      source.addEventListener('campaign-updated', requestRefresh);
      source.addEventListener('state-updated', requestRefresh);
      source.addEventListener('turn-changed', requestRefresh);
      source.addEventListener('update', requestRefresh);
      source.onerror = () => {
        // EventSource retries automatically; reconnect refresh comes from the initial snapshot.
      };
    }

    async function refreshNow(event) {
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
        await refresh(event);
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
