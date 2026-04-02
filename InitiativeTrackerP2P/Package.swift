// swift-tools-version: 6.2

import PackageDescription

let package = Package(
    name: "InitiativeTrackerP2P",
    platforms: [
        .iOS(.v17),
        .macOS(.v14)
    ],
    products: [
        .library(
            name: "InitiativeCore",
            targets: ["InitiativeCore"]
        ),
        .library(
            name: "InitiativeHostTransport",
            targets: ["InitiativeHostTransport"]
        )
    ],
    targets: [
        .target(
            name: "InitiativeCore"
        ),
        .target(
            name: "InitiativeHostTransport",
            dependencies: ["InitiativeCore"]
        ),
        .testTarget(
            name: "InitiativeCoreTests",
            dependencies: ["InitiativeCore"]
        )
    ]
)
