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

    private var shouldShield: Bool {
        SensitiveContentPolicy.shouldShield(state: model.state, privacyShielded: model.privacyShielded)
    }

    var body: some View {
        ZStack {
            PVTheme.background.ignoresSafeArea()
            PVCard(radius: 18) {
                VStack(spacing: 12) {
                    Image("Logo").resizable().scaledToFit().frame(width: 64, height: 64)
                    Text(L10n.text(.passVaultLocked, language: language)).font(.title2.bold())
                    Text(L10n.text(.contentLocalOnly, language: language)).font(.subheadline).foregroundStyle(PVTheme.muted)
                }.frame(maxWidth: .infinity)
            }.padding(24).frame(maxWidth: 430)
        }
        .opacity(visible ? 1 : 0)
        .scaleEffect(visible || reduceMotion ? 1 : 0.992)
        .allowsHitTesting(visible)
        .accessibilityHidden(!visible)
        .onAppear { visible = shouldShield }
        .onChange(of: shouldShield) { _, shield in
            if shield { visible = true }
            else { withAnimation(.easeOut(duration: reduceMotion ? 0.10 : 0.24)) { visible = false } }
        }
    }
}
