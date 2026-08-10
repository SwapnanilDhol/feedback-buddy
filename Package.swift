// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "FeedbackLoop",
    platforms: [
        .iOS(.v17),
        .macOS(.v14),
    ],
    products: [
        .library(name: "FeedbackCore", targets: ["FeedbackCore"]),
    ],
    targets: [
        .target(name: "FeedbackCore"),
        .testTarget(
            name: "FeedbackCoreTests",
            dependencies: ["FeedbackCore"]
        ),
    ]
)
