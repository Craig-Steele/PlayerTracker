# Client-Android

Native Android client scaffold for the Roll4Initiative/PlayerTracker Vapor server.

## Current scope

- opens directly in Android Studio Panda 3 / 2025.3.3 Patch 1
- uses Android Gradle Plugin 9.1.0 with Gradle 9.3.1
- targets the locally installed Android 16 QPR2 SDK platform (`android-36.1`)
- starts as a dependency-light Java Android app, with no AndroidX or Compose dependencies yet
- allows cleartext HTTP for local-network development against the Vapor server on port `8080`
- includes a first connection screen that calls the server's `/campaign` endpoint

## Open in Android Studio

Open this directory:

```text
Client-Android
```

Then let Android Studio sync the Gradle project. If Android Studio prompts for missing SDK pieces, install:

- Android SDK Platform 36.1
- Android SDK Build-Tools 36.x or newer

## Local server URLs

Use one of these depending on where the server is running:

- Android emulator talking to the Mac host: `http://10.0.2.2:8080`
- Physical device on the same Wi-Fi: `http://<mac-lan-ip>:8080`

Run the server from the repository root with:

```bash
swift run
```

## Notes

- This is intentionally a minimal importable Android Studio project, not a full feature-equivalent client yet.
- The next useful step is to port the iOS DTOs/API client shape into Java or Kotlin and add player character screens.
