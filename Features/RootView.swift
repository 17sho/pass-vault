import SwiftUI
import UIKit

enum AuthenticationTransitionStep: Equatable {
    case gateExit
    case vaultEntry
    case immediate
}

enum AuthenticationPresentationPhase: Equatable {
    case gate
    case gateExit
    case vaultEntry
    case vault
}

struct AuthenticationPresentationPolicy: Equatable {
    private(set) var phase: AuthenticationPresentationPhase = .gate
    private(set) var transitionCount = 0

    mutating func begin(reduceMotion: Bool) -> [AuthenticationTransitionStep] {
        guard phase == .gate else { return [] }
        transitionCount += 1
        if reduceMotion {
            phase = .vault
            return [.immediate]
        }
        phase = .gateExit
        return [.gateExit, .vaultEntry]
    }

    mutating func showVaultEntry() {
        guard phase == .gateExit else { return }
        phase = .vaultEntry
    }

    mutating func finish() {
        guard phase == .vaultEntry else { return }
        phase = .vault
    }
}

enum AuthenticationTransitionPlan {
    static func plan(reduceMotion: Bool) -> [AuthenticationTransitionStep] {
        reduceMotion ? [.immediate] : [.gateExit, .vaultEntry]
    }
}

private enum RootPresentationPhase: Equatable {
    case gate
    case gateExit
    case vaultEntry
    case vault
}

private struct PVWebModalMessage: Identifiable {
    let id = UUID()
    let text: String
}

struct RootView: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var languageStore: AppLanguageStore
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var presentationPhase: RootPresentationPhase = .gate
    @State private var gateMode: PasswordGateView.Mode = .setup
    @State private var transitionTask: Task<Void, Never>?
    @State private var errorModal: PVWebModalMessage?
    @State private var noticeModal: PVWebModalMessage?
    @EnvironmentObject private var fileImporter: FileImportCoordinator
    private func t(_ key: L10nKey) -> String { L10n.text(key, language: languageStore.language) }

    var body: some View {
        ZStack {
            if SensitiveContentPolicy.mayRenderVault(state: model.state) {
                presentedContent
            } else {
                PasswordGateView(mode: model.state == .needsSetup ? .setup : .unlock)
                    .accessibilityIdentifier("password-gate")
            }
        }
        .tint(PVTheme.accent)
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardDidShowNotification)) { _ in model.recordActivity() }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillChangeFrameNotification)) { _ in model.recordActivity() }
        .onReceive(NotificationCenter.default.publisher(for: UITextField.textDidChangeNotification)) { _ in model.recordActivity() }
        .onReceive(NotificationCenter.default.publisher(for: UITextView.textDidChangeNotification)) { _ in model.recordActivity() }
        .onAppear { synchronizePresentation(with: model.state, animateUnlock: false) }
        .onChange(of: model.state) { _, state in synchronizePresentation(with: state, animateUnlock: true) }
        .onChange(of: scenePhase) { _, phase in model.sceneDidChange(to: phase) }
        .onDisappear { transitionTask?.cancel() }
        .onChange(of: model.errorMessage) { _, message in
            if let message { errorModal = PVWebModalMessage(text: message); model.errorMessage = nil }
        }
        .onChange(of: model.noticeMessage) { _, message in
            if let message { noticeModal = PVWebModalMessage(text: message); model.noticeMessage = nil }
        }
        .onReceive(NotificationCenter.default.publisher(for: .passVaultRequestAttachmentImport)) { _ in
            fileImporter.request(.attachment)
        }
        .pvWebModal(item: $errorModal, maxWidth: 440, verticalInset: 28, sizing: .fit, dismissOnBackdrop: false) { message in
            messageModal(message.text)
        }
        .pvWebModal(item: $noticeModal, maxWidth: 440, verticalInset: 28, sizing: .fit, dismissOnBackdrop: false) { message in
            messageModal(message.text)
        }
    }


    private func messageModal(_ message: String) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Image("Logo").resizable().scaledToFit().frame(width: 30, height: 30)
                Text(t(.appName)).font(.title3.bold())
                Spacer()
            }
            .padding(16).background(PVTheme.surface)
            .overlay(alignment: .bottom) { Rectangle().fill(PVTheme.line).frame(height: 1) }
            Text(message).font(.body).frame(maxWidth: .infinity, alignment: .leading).padding(20)
            PVModalFooter {
                Button(t(.ok)) { errorModal = nil; noticeModal = nil }
                    .buttonStyle(PVButtonStyle(role: .primary, fillsWidth: true))
            }
        }
    }

    @ViewBuilder
    private var presentedContent: some View {
        ZStack {
            if presentationPhase == .gate || presentationPhase == .gateExit {
                PasswordGateView(mode: gateMode)
                    .accessibilityIdentifier(presentationPhase == .gateExit ? "password-gate-exit" : "password-gate")
                    .opacity(presentationPhase == .gateExit ? 0 : 1)
                    .scaleEffect(presentationPhase == .gateExit ? 0.985 : 1)
            }
            if presentationPhase == .vaultEntry || presentationPhase == .vault {
                VaultHomeView()
                    .transition(.opacity.combined(with: .scale(scale: 0.985)))
            }
        }
    }

    private func synchronizePresentation(with state: AppModel.State, animateUnlock: Bool) {
        transitionTask?.cancel()
        switch state {
        case .needsSetup:
            model.privacyShielded = false
            gateMode = .setup
            presentationPhase = .gate
        case .locked:
            model.privacyShielded = false
            gateMode = .unlock
            presentationPhase = .gate
        case .unlocked:
            transitionTask?.cancel()
            withTransaction(Transaction(animation: reduceMotion ? nil : .easeOut(duration: 0.18))) {
                presentationPhase = .vault
            }
        }
    }
}

struct PasswordGateView: View {
    enum Mode { case setup, unlock }
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var languageStore: AppLanguageStore
    let mode: Mode
    @State private var password = ""
    @State private var confirmation = ""
    @State private var revealPassword = false

    private func t(_ key: L10nKey) -> String { L10n.text(key, language: languageStore.language) }

    var body: some View {
        GeometryReader { proxy in
            PVCard(radius: PVTheme.authCornerRadius) {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(spacing: 7) {
                        Image("Logo").resizable().scaledToFit().frame(width: 64, height: 64)
                        Text("PASS VAULT").font(.caption.bold()).tracking(1.8).foregroundStyle(PVTheme.accent)
                    }
                    .frame(maxWidth: .infinity, alignment: .center)
                    VStack(alignment: .leading, spacing: 7) {
                        Text(mode == .setup ? t(.createMasterPassword) : t(.unlock))
                            .font(.system(size: 30, weight: .bold))
                        Text(t(.brandSubtitle)).foregroundStyle(PVTheme.muted)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)

                    PVField(title: t(.masterPassword)) {
                        HStack(spacing: 0) {
                            Group {
                                if revealPassword { TextField(t(.masterPassword), text: $password) }
                                else { SecureField(t(.masterPassword), text: $password) }
                            }
                            .accessibilityIdentifier("master-password")
                            .textContentType(mode == .setup ? .newPassword : .password)
                            Button { revealPassword.toggle() } label: {
                                Image(systemName: revealPassword ? "eye.slash" : "eye")
                                    .frame(width: 44, height: 44)
                            }
                            .accessibilityLabel(revealPassword ? t(.hidePassword) : t(.showPassword))
                        }
                    }
                    if mode == .setup {
                        PVField(title: t(.confirmPassword)) {
                            SecureField(t(.confirmPassword), text: $confirmation)
                                .textContentType(.newPassword)
                        }
                    }
                    Button(mode == .setup ? t(.createVault) : t(.unlock)) { submit() }
                        .accessibilityIdentifier(mode == .setup ? "create-vault" : "unlock-vault")
                        .buttonStyle(PVButtonStyle(role: .primary, fillsWidth: true))
                        .disabled(password.isEmpty || (mode == .setup && confirmation.isEmpty))
                    if mode == .unlock && model.quickUnlockEnabled {
                        Button { Task { await model.quickUnlockNow() } } label: {
                            Label(t(.quickUnlock), systemImage: "faceid")
                        }
                        .buttonStyle(PVButtonStyle(role: .secondary, fillsWidth: true))
                    }
                    Text(t(.recoveryWarning)).font(.footnote).foregroundStyle(PVTheme.muted)
                }
            }
            .padding(20)
            .frame(maxWidth: 440)
            .position(x: proxy.size.width / 2, y: proxy.size.height / 2)
        }
        .pvScreen()

    }

    private func submit() {
        let succeeded: Bool
        if mode == .setup {
            guard password == confirmation else { model.errorMessage = t(.passwordsDoNotMatch); return }
            succeeded = model.setup(password: password)
        } else {
            succeeded = model.unlock(password: password)
        }
        guard succeeded else { return }
        password = ""; confirmation = ""; revealPassword = false
    }
}
