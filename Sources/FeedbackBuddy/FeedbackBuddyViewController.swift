import FeedbackBuddyCore
import Foundation

#if canImport(UIKit)
import SwiftUI
import UIKit

/// UIKit host for the feedback form. Use ``FeedbackBuddy/present(from:source:onDismiss:)``
/// for the standard sheet, or push this controller yourself.
public final class FeedbackBuddyViewController: UIHostingController<AnyView> {
    public var onDismiss: (@MainActor () -> Void)?
    private let showsCloseButton: Bool
    private var didFinish = false

    public init(source: String = "settings", showsCloseButton: Bool = true) {
        self.showsCloseButton = showsCloseButton
        let box = FinishBox()
        super.init(rootView: AnyView(
            FeedbackBuddyView(source: source) { _ in box.finish?() }
                .tint(FeedbackBuddy.appearance.accentColor)
        ))
        box.finish = { [weak self] in self?.finish() }
    }

    @available(*, unavailable)
    @MainActor dynamic required init?(coder aDecoder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    public override func viewDidLoad() {
        super.viewDidLoad()
        if showsCloseButton {
            navigationItem.leftBarButtonItem = UIBarButtonItem(
                systemItem: .close,
                primaryAction: UIAction { [weak self] _ in self?.finish() }
            )
            navigationItem.leftBarButtonItem?.accessibilityIdentifier = "feedbackCloseButton"
        }
    }

    private func finish() {
        guard !didFinish else { return }
        didFinish = true
        if let navigation = navigationController,
           navigation.viewControllers.first === self,
           navigation.presentingViewController != nil {
            navigation.dismiss(animated: true) { [weak self] in self?.onDismiss?() }
        } else if let navigation = navigationController, navigation.viewControllers.count > 1 {
            navigation.popViewController(animated: true)
            onDismiss?()
        } else if presentingViewController != nil {
            dismiss(animated: true) { [weak self] in self?.onDismiss?() }
        } else {
            onDismiss?()
        }
    }

    @MainActor
    private final class FinishBox {
        var finish: (@MainActor () -> Void)?
    }
}

extension FeedbackBuddyViewController: UIAdaptivePresentationControllerDelegate {
    public func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        guard !didFinish else { return }
        didFinish = true
        onDismiss?()
    }
}
#endif
