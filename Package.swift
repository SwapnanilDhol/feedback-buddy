// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "FeedbackBuddy",
    defaultLocalization: "en",
    platforms: [
        .iOS(.v17),
        .macOS(.v14),
    ],
    products: [
        .library(name: "FeedbackBuddy", targets: ["FeedbackBuddy"]),
        .library(name: "FeedbackBuddyCore", targets: ["FeedbackBuddyCore"]),
    ],
    targets: [
        .target(name: "FeedbackBuddyCore"),
        .target(
            name: "FeedbackBuddy",
            dependencies: ["FeedbackBuddyCore"],
            resources: [.process("Resources")]
        ),
        .testTarget(
            name: "FeedbackBuddyCoreTests",
            dependencies: ["FeedbackBuddyCore"]
        ),
        .testTarget(
            name: "FeedbackBuddyTests",
            dependencies: ["FeedbackBuddy", "FeedbackBuddyCore"]
        ),
    ],
    swiftLanguageModes: [.v6]
)
