const test = require('node:test');
const assert = require('node:assert/strict');

const { createCampaignLiveStream } = require('./live-stream.js');

function flushMicrotasks() {
  return new Promise((resolve) => setImmediate(resolve));
}

function createFakeEventSourceFactory() {
  const instances = [];

  class FakeEventSource {
    constructor(url) {
      this.url = url;
      this.listeners = new Map();
      this.closed = false;
      instances.push(this);
    }

    addEventListener(name, handler) {
      this.listeners.set(name, handler);
    }

    emit(name) {
      const handler = this.listeners.get(name);
      if (handler) {
        handler({ type: name });
      }
    }

    close() {
      this.closed = true;
    }
  }

  return { FakeEventSource, instances };
}

test('opens a campaign event stream and refreshes on stream events', async () => {
  const previousEventSource = global.EventSource;
  const { FakeEventSource, instances } = createFakeEventSourceFactory();
  global.EventSource = FakeEventSource;

  try {
    let refreshCount = 0;
    let encounterStartCount = 0;
    const liveStream = createCampaignLiveStream({
      getCampaignId: () => 'campaign-a',
      onEncounterStart: () => {
        encounterStartCount += 1;
      },
      refresh: async () => {
        refreshCount += 1;
      }
    });

    liveStream.start();
    assert.equal(instances.length, 1);
    assert.equal(instances[0].url, '/campaigns/campaign-a/events');

    instances[0].emit('snapshot');
    await flushMicrotasks();
    assert.equal(refreshCount, 1);

    instances[0].emit('encounter-start');
    await flushMicrotasks();
    assert.equal(refreshCount, 2);
    assert.equal(encounterStartCount, 1);

    instances[0].emit('turn-changed');
    await flushMicrotasks();
    assert.equal(refreshCount, 3);

    instances[0].emit('update');
    await flushMicrotasks();
    assert.equal(refreshCount, 4);

    liveStream.stop();
    assert.equal(instances[0].closed, true);
  } finally {
    global.EventSource = previousEventSource;
  }
});

test('coalesces refreshes while one refresh is already in flight', async () => {
  const previousEventSource = global.EventSource;
  const { FakeEventSource, instances } = createFakeEventSourceFactory();
  global.EventSource = FakeEventSource;

  try {
    let refreshCount = 0;
    let releaseRefresh;
    const firstRefresh = new Promise((resolve) => {
      releaseRefresh = resolve;
    });

    const liveStream = createCampaignLiveStream({
      getCampaignId: () => 'campaign-a',
      refresh: async () => {
        refreshCount += 1;
        if (refreshCount === 1) {
          await firstRefresh;
        }
      }
    });

    liveStream.start();
    instances[0].emit('snapshot');
    await flushMicrotasks();
    assert.equal(refreshCount, 1);

    instances[0].emit('campaign-updated');
    instances[0].emit('turn-changed');
    await flushMicrotasks();
    assert.equal(refreshCount, 1);

    releaseRefresh();
    await flushMicrotasks();
    await flushMicrotasks();
    assert.equal(refreshCount, 2);

    liveStream.stop();
  } finally {
    global.EventSource = previousEventSource;
  }
});

test('switches to a new campaign stream when the campaign changes', async () => {
  const previousEventSource = global.EventSource;
  const { FakeEventSource, instances } = createFakeEventSourceFactory();
  global.EventSource = FakeEventSource;

  try {
    let currentCampaignId = 'campaign-a';
    const liveStream = createCampaignLiveStream({
      getCampaignId: () => currentCampaignId,
      refresh: async () => {}
    });

    liveStream.start();
    assert.equal(instances.length, 1);
    assert.equal(instances[0].url, '/campaigns/campaign-a/events');
    assert.equal(instances[0].closed, false);

    currentCampaignId = 'campaign-b';
    liveStream.sync();

    assert.equal(instances.length, 2);
    assert.equal(instances[0].closed, true);
    assert.equal(instances[1].url, '/campaigns/campaign-b/events');
    assert.equal(instances[1].closed, false);

    liveStream.stop();
    assert.equal(instances[1].closed, true);
  } finally {
    global.EventSource = previousEventSource;
  }
});

test('skips refresh when requested and consumes the skip flag', async () => {
  const previousEventSource = global.EventSource;
  const { FakeEventSource, instances } = createFakeEventSourceFactory();
  global.EventSource = FakeEventSource;

  try {
    let refreshCount = 0;
    let skipCount = 0;
    const liveStream = createCampaignLiveStream({
      getCampaignId: () => 'campaign-a',
      refresh: async () => {
        refreshCount += 1;
      },
      shouldSkipRefresh: () => true,
      consumeSkipRefresh: () => {
        skipCount += 1;
      }
    });

    liveStream.start();
    instances[0].emit('snapshot');
    await flushMicrotasks();
    assert.equal(refreshCount, 0);
    assert.equal(skipCount, 1);
    liveStream.stop();
  } finally {
    global.EventSource = previousEventSource;
  }
});
