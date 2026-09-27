# Map authoring browser tests

Install JavaScript dependencies and Playwright's WebKit runtime once:

```sh
npm ci
npx playwright install webkit
```

Run the browser suite with `npm run test:map-authoring`. It serves the authoring page locally in a touch-enabled, iPhone-sized WebKit context and covers blank-map color/draft/package workflows, painting/erase/undo, and two-pointer pinch/pan. Synthetic touch pointers exercise the editor's gesture handlers; retain a physical iPhone Safari smoke test for native gesture behavior.

Run the existing Node tests with `npm run test:web`.
