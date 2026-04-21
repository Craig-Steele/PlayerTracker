# Client-Android

Native Android player client for the Roll4Initiative/PlayerTracker Vapor server, built with Jetpack Compose and modern Android architecture.

## Current scope

- **Feature Parity:** Matches the iOS client's functionality, including initiative tracking, character management, and health status monitoring.
- **Adaptive Layout:** Supports both portrait and landscape (split-view) orientations, optimized for tablets and phones.
- **Health Status:** Color-coded health badges based on HP ratios (Full, Slight Damage, Some Damage, Bloodied, Heavily Blooded, Dead).
- **Jetpack Compose:** Fully declarative UI using Material 3.
- **Networking:** Uses Retrofit and Kotlinx Serialization for efficient communication with the Vapor backend.
- **Security:** Initiative editing is restricted to characters owned by the current player (based on `ownerId`).

## Requirements

- Android Studio (Ladybug or newer recommended)
- Android SDK Platform 35
- Gradle 8.x+

## Local server URLs

Use one of these depending on where the server is running:

- **Android emulator** talking to the Mac host: `http://10.0.2.2:8080`
- **Physical device** on the same Wi-Fi: `http://<mac-lan-ip>:8080`

Run the server from the repository root with:

```bash
swift run
```

## Implementation Details

- **MainScreen.kt:** Contains the primary UI logic, including the adaptive layout and the `HealthBadge` logic synced with iOS.
- **Models.kt:** DTOs that match the Vapor server's API structure.
- **PlayerAppViewModel.kt:** Manages the state and networking for the app.
