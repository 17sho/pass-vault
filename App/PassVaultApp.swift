import SwiftUI
import UIKit

@MainActor
final class PassVaultApplication: UIApplication {
    weak var activityModel: AppModel?
    private var lastActivityAt = Date.distantPast

    override func sendEvent(_ event: UIEvent) {
        super.sendEvent(event)
        guard let touches = event.allTouches,
              touches.contains(where: { $0.phase == .began || $0.phase == .moved }) else { return }
        let now = Date()
        guard now.timeIntervalSince(lastActivityAt) >= 0.25 else { return }
        lastActivityAt = now
        activityModel?.recordActivity()
    }
}

@main
struct PassVaultApp: App {
    @StateObject private var languageStore: AppLanguageStore
    @StateObject private var preferences: LocalVaultPreferences
    @StateObject private var model: AppModel
    @StateObject private var fileImporter: FileImportCoordinator

    init() {
        let languageStore = AppLanguageStore()
        let preferences = LocalVaultPreferences()
        _languageStore = StateObject(wrappedValue: languageStore)
        _preferences = StateObject(wrappedValue: preferences)
        let appModel: AppModel
#if DEBUG
        if let testingModel = UITestingHarness.makeModel(languageStore: languageStore, preferences: preferences) {
            appModel = testingModel
        } else {
            appModel = AppModel.live(languageStore: languageStore, preferences: preferences)
        }
#else
        appModel = AppModel.live(languageStore: languageStore, preferences: preferences)
#endif
        _model = StateObject(wrappedValue: appModel)
        _fileImporter = StateObject(wrappedValue: FileImportCoordinator(model: appModel, languageStore: languageStore))
        (UIApplication.shared as? PassVaultApplication)?.activityModel = appModel
    }

    var body: some Scene {
        WindowGroup {
            ZStack {
                PVTheme.surface.ignoresSafeArea()
                PVChoiceOverlayContainer {
                    RootView()
                        .id(languageStore.language)
                }
                .environmentObject(model)
                .environmentObject(languageStore)
                .environmentObject(preferences)
                .environmentObject(fileImporter)
                .environment(\.locale, languageStore.language.locale)
                FileImportHost(coordinator: fileImporter)
                    .frame(width: 0, height: 0)
                    .allowsHitTesting(false)
                PrivacyShieldOverlay(model: model, language: languageStore.language)
                    .zIndex(100_000)
            }
            .preferredColorScheme(preferences.theme == .system ? nil : (preferences.theme == .dark ? .dark : .light))
            .animation(.easeInOut(duration: 0.24), value: preferences.theme)
            .onChange(of: model.state) { _, state in if state != .unlocked { fileImporter.cancelForLock() } }
        }
    }
}

private struct PrivacyShieldOverlay: View {
    @ObservedObject var model: AppModel
    let language: AppLanguage
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var visible = false
    @State private var dismissalTask: Task<Void, Never>?

    private var shouldShield: Bool {
        SensitiveContentPolicy.shouldShield(state: model.state, privacyShielded: model.privacyShielded)
    }

    var body: some View {
        ZStack {
            PVTheme.background.ignoresSafeArea()

            GeometryReader { proxy in
                ZStack {
                    Circle()
                        .fill(PVTheme.accent.opacity(0.10))
                        .frame(width: min(proxy.size.width * 0.92, 430))
                        .blur(radius: 2)
                        .offset(x: proxy.size.width * 0.30, y: -proxy.size.height * 0.31)

                    Circle()
                        .fill(PVTheme.selected.opacity(0.42))
                        .frame(width: min(proxy.size.width * 0.72, 340))
                        .offset(x: -proxy.size.width * 0.38, y: proxy.size.height * 0.37)

                    VStack(spacing: 0) {
                        HStack(spacing: 12) {
                            Image("Logo")
                                .resizable()
                                .scaledToFit()
                                .frame(width: 42, height: 42)
                                .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Pass Vault")
                                    .font(.headline.bold())
                                    .foregroundStyle(PVTheme.ink)
                                Text(L10n.text(.brandSubtitle, language: language))
                                    .font(.caption)
                                    .foregroundStyle(PVTheme.muted)
                            }
                            Spacer()
                            Image(systemName: "lock.fill")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(PVTheme.accentPressed)
                                .frame(width: 36, height: 36)
                                .background(PVTheme.selected)
                                .clipShape(Circle())
                        }
                        .padding(.horizontal, 24)
                        .padding(.top, max(proxy.safeAreaInsets.top + 18, 30))

                        Spacer(minLength: 24)

                        VStack(spacing: 22) {
                            ZStack {
                                Circle()
                                    .fill(PVTheme.selected)
                                    .frame(width: 118, height: 118)
                                Circle()
                                    .stroke(PVTheme.selectedLine, lineWidth: 1)
                                    .frame(width: 118, height: 118)
                                Image(systemName: "lock.shield.fill")
                                    .font(.system(size: 48, weight: .medium))
                                    .foregroundStyle(PVTheme.accentPressed)
                            }
                            .shadow(color: Color.black.opacity(0.16), radius: 22, y: 12)

                            VStack(spacing: 10) {
                                Text(L10n.text(.passVaultLocked, language: language))
                                    .font(.system(size: 27, weight: .bold, design: .rounded))
                                    .foregroundStyle(PVTheme.ink)
                                    .multilineTextAlignment(.center)
                                Text(L10n.text(.contentLocalOnly, language: language))
                                    .font(.subheadline)
                                    .foregroundStyle(PVTheme.muted)
                                    .multilineTextAlignment(.center)
                            }
                        }
                        .padding(.horizontal, 32)

                        Spacer(minLength: 24)

                        HStack(spacing: 12) {
                            Image(systemName: "wifi.slash")
                                .font(.system(size: 18, weight: .semibold))
                                .foregroundStyle(PVTheme.accentPressed)
                                .frame(width: 42, height: 42)
                                .background(PVTheme.selected)
                                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                            VStack(alignment: .leading, spacing: 3) {
                                Text(L10n.text(.security, language: language))
                                    .font(.subheadline.bold())
                                    .foregroundStyle(PVTheme.ink)
                                Text(L10n.text(.localCapabilityBoundary, language: language))
                                    .font(.caption)
                                    .foregroundStyle(PVTheme.muted)
                                    .lineLimit(2)
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(16)
                        .background(PVTheme.surface.opacity(0.88))
                        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(PVTheme.line, lineWidth: 1))
                        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                        .padding(.horizontal, 24)
                        .padding(.bottom, max(proxy.safeAreaInsets.bottom + 24, 34))
                    }
                }
            }
        }
        .accessibilityIdentifier("privacy-shield")
        .opacity(visible ? 1 : 0)
        .allowsHitTesting(visible)
        .accessibilityHidden(!visible)
        .onAppear { visible = shouldShield }
        .onDisappear { dismissalTask?.cancel() }
        .onChange(of: shouldShield) { _, shield in
            dismissalTask?.cancel()
            if shield {
                var transaction = Transaction()
                transaction.disablesAnimations = true
                withTransaction(transaction) { visible = true }
            } else {
                dismissalTask = Task { @MainActor in
                    // Keep the opaque shield for one rendered frame while the vault
                    // finishes its foreground layout, then perform one cheap fade.
                    await Task.yield()
                    guard !Task.isCancelled, !shouldShield else { return }
                    withAnimation(reduceMotion ? nil : .linear(duration: 0.16)) {
                        visible = false
                    }
                }
            }
        }
    }
}
