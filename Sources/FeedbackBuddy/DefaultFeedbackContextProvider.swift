import FeedbackBuddyCore
import Foundation

#if canImport(UIKit)
import UIKit

/// Reads version, build, OS, locale, idiom and hardware model from the app
/// and device.
public struct DefaultFeedbackContextProvider: FeedbackContextProviding {
    public init() {}

    public func context() async -> FeedbackContext {
        await MainActor.run { Self.current() }
    }

    @MainActor
    public static func current(bundle: Bundle = .main) -> FeedbackContext {
        let info = bundle.infoDictionary ?? [:]
        let device = UIDevice.current
        return FeedbackContext(
            appVersion: nonEmpty(info["CFBundleShortVersionString"] as? String) ?? "Unknown",
            buildNumber: nonEmpty(info["CFBundleVersion"] as? String) ?? "Unknown",
            osVersion: device.systemVersion,
            locale: Locale.current.identifier,
            deviceFamily: deviceFamily(for: device.userInterfaceIdiom),
            deviceModel: hardwareModel()
        )
    }

    static func deviceFamily(for idiom: UIUserInterfaceIdiom) -> String {
        switch idiom {
        case .pad: "iPad"
        case .mac: "Mac"
        case .tv: "Apple TV"
        case .vision: "Apple Vision"
        default: "iPhone"
        }
    }

    static func hardwareModel() -> String? {
        var systemInfo = utsname()
        uname(&systemInfo)
        let machine = withUnsafeBytes(of: &systemInfo.machine) { buffer -> String in
            let bytes = buffer.prefix { $0 != 0 }
            return String(decoding: bytes, as: UTF8.self)
        }
        #if targetEnvironment(simulator)
        if let simulated = ProcessInfo.processInfo.environment["SIMULATOR_MODEL_IDENTIFIER"] {
            return nonEmpty(simulated)
        }
        #endif
        return nonEmpty(machine)
    }

    private static func nonEmpty(_ value: String?) -> String? {
        guard let value = value?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty else {
            return nil
        }
        return value
    }
}
#endif
