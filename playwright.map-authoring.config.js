const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './Client-Web/tests',
  testMatch: 'map-authoring.spec.js',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'webkit',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    hasTouch: true
  },
  webServer: {
    command: 'node Client-Web/tests/map-authoring-server.js',
    url: 'http://127.0.0.1:4173/map-authoring.html',
    reuseExistingServer: false,
    timeout: 10_000
  }
});
