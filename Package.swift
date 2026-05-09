// swift-tools-version: 6.2
// The swift-tools-version declares the minimum version of Swift required to build this package.

import PackageDescription

let package = Package(
    name: "PlayerTracker",
    platforms: [
        .macOS(.v13)
    ],
    dependencies: [
        .package(url: "https://github.com/vapor/vapor.git", from: "4.90.0"),
        .package(url: "https://github.com/vapor/fluent.git", from: "4.13.0"),
        .package(url: "https://github.com/vapor/fluent-sqlite-driver.git", from: "4.9.0"),
    ],
    targets: [
        .executableTarget(
            name: "PlayerTracker",
            dependencies: [
                .product(name: "Vapor", package: "vapor"),
                .product(name: "Fluent", package: "fluent"),
                .product(name: "FluentSQLiteDriver", package: "fluent-sqlite-driver"),
            ],
            path: "Server-Vapor",
            exclude: [
                "PlayerTracker.code-workspace"
            ]
        ),
        .testTarget(
            name: "PlayerTrackerTests",
            dependencies: [
                "PlayerTracker",
                .product(name: "XCTVapor", package: "vapor")
            ]
        ),
    ]
)
