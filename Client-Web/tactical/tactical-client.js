const TacticalClient = (() => {
  function createClient(host) {
    const baseURL = host || window.location.origin;

    async function request(path) {
      const response = await fetch(new URL(path, baseURL), {
        credentials: 'include',
        headers: { Accept: 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`Tactical request failed (${response.status})`);
      }

      return response.json();
    }

    return {
      host: baseURL,
      connect() {
        return Promise.resolve();
      },
      fetchMap() {
        return request('/tactical/map');
      },
      fetchTokens() {
        return request('/tactical/tokens');
      },
      fetchPlayerSession() {
        return request('/player/session');
      },
      fetchCharacters() {
        return request('/tactical/characters');
      },
      placeToken(characterId, x, y) {
        return fetch(new URL('/tactical/tokens/place', baseURL), {
          method: 'POST',
          credentials: 'include',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ characterId, x, y })
        }).then(async (response) => {
          if (!response.ok) {
            let reason = `Placement failed (${response.status})`;
            try {
              const body = await response.json();
              reason = body.reason || reason;
            } catch (_) {
              // Keep the status-based message when the server has no JSON body.
            }
            throw new Error(reason);
          }
          return response.json();
        });
      },
      subscribeToEvents(onTokenUpdated) {
        const events = new EventSource(new URL('/tactical/events', baseURL), { withCredentials: true });
        events.addEventListener('token-updated', (event) => {
          onTokenUpdated(JSON.parse(event.data).token);
        });
        return events;
      },
      subscribeToCampaignEvents(campaignID, onCampaignUpdated) {
        const events = new EventSource(
          new URL(`/campaigns/${encodeURIComponent(campaignID)}/events`, baseURL),
          { withCredentials: true }
        );
        const refresh = (event) => {
          let snapshot = null;
          try { snapshot = event?.data ? JSON.parse(event.data).snapshot : null; } catch (_) { /* refresh still applies */ }
          onCampaignUpdated(snapshot);
        };
        events.addEventListener('snapshot', refresh);
        events.addEventListener('campaign-updated', refresh);
        events.addEventListener('turn-changed', refresh);
        events.addEventListener('map-changed', refresh);
        return events;
      },
      imageURL(cacheBust = '') {
        const url = new URL('/tactical/map/image', baseURL);
        if (cacheBust) url.searchParams.set('v', cacheBust);
        return url.toString();
      }
    };
  }

  return { createClient };
})();
