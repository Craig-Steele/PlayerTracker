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
    ],
    targets: [
        .executableTarget(
            name: "PlayerTracker",
            dependencies: [
                .product(name: "Vapor", package: "vapor")
            ],
            path: "Server-Vapor",
            exclude: [
                "PlayerTracker.code-workspace"
            ]
        ),
    ]
)
