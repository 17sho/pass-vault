import SwiftUI
import UIKit

/// Product-owned visual contract shared by every native Pass Vault screen.
enum PVTheme {
    static let accentHex = "176B57"
    static let accentPressedHex = "0F5645"
    static let backgroundHex = "F4F6F8"
    static let surfaceHex = "FFFFFF"
    static let inkHex = "17202A"
    static let mutedHex = "647080"
    static let lineHex = "DCE2E8"
    static let dangerHex = "B42318"

    static let cornerRadius: CGFloat = 12
    static let authCornerRadius: CGFloat = 16
    static let minimumControlHeight: CGFloat = 44

    static let accent = Color(lightHex: accentHex, darkHex: "2B9A7D")
    static let accentPressed = Color(lightHex: accentPressedHex, darkHex: "72D0B6")
    static let background = Color(lightHex: backgroundHex, darkHex: "0D141A")
    static let surface = Color(lightHex: surfaceHex, darkHex: "172129")
    static let ink = Color(lightHex: inkHex, darkHex: "E7EDF2")
    static let muted = Color(lightHex: mutedHex, darkHex: "9BA9B7")
    static let line = Color(lightHex: lineHex, darkHex: "34414C")
    static let danger = Color(lightHex: dangerHex, darkHex: "FF8F86")
    static let selected = Color(lightHex: "E3F1ED", darkHex: "173E35")
    static let selectedLine = Color(lightHex: "A8CFC4", darkHex: "2D7564")
    static let inputLine = Color(lightHex: "B8C3CC", darkHex: "52616E")
    static let surfaceSoft = Color(lightHex: "F7F9FA", darkHex: "202C35")
}

enum WebVaultCategory: String, CaseIterable, Identifiable {
    case account, website, note, totp, attachment
    var id: String { rawValue }

    var kind: VaultItemKind {
        switch self {
        case .account: .account
        case .website: .website
        case .note: .secureNote
        case .totp: .totp
        case .attachment: .attachment
        }
    }

    var icon: String {
        switch self {
        case .account: "person.crop.circle"
        case .website: "globe"
        case .note: "note.text"
        case .totp: "timer"
        case .attachment: "paperclip"
        }
    }
}

enum PVButtonRole {
    case primary, secondary, destructive

    var backgroundHex: String {
        switch self {
        case .primary: PVTheme.accentHex
        case .secondary, .destructive: PVTheme.surfaceHex
        }
    }

    var foregroundHex: String {
        switch self {
        case .primary: PVTheme.surfaceHex
        case .secondary: PVTheme.inkHex
        case .destructive: PVTheme.dangerHex
        }
    }
}

extension Color {
    init(hex: String) {
        let value = UInt64(hex, radix: 16) ?? 0
        self.init(
            .sRGB,
            red: Double((value >> 16) & 0xff) / 255,
            green: Double((value >> 8) & 0xff) / 255,
            blue: Double(value & 0xff) / 255,
            opacity: 1
        )
    }

    init(lightHex: String, darkHex: String) {
        self.init(UIColor { traits in
            UIColor(pvHex: traits.userInterfaceStyle == .dark ? darkHex : lightHex)
        })
    }
}

private extension UIColor {
    convenience init(pvHex hex: String) {
        let value = UInt64(hex, radix: 16) ?? 0
        self.init(
            red: CGFloat((value >> 16) & 0xff) / 255,
            green: CGFloat((value >> 8) & 0xff) / 255,
            blue: CGFloat(value & 0xff) / 255,
            alpha: 1
        )
    }
}

struct PVButtonStyle: ButtonStyle {
    let role: PVButtonRole
    var fillsWidth = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 15, weight: role == .primary ? .semibold : .medium))
            .foregroundStyle(role == .primary ? PVTheme.surface : (role == .secondary ? PVTheme.ink : PVTheme.danger))
            .frame(maxWidth: fillsWidth ? .infinity : nil, minHeight: PVTheme.minimumControlHeight)
            .padding(.horizontal, 13)
            .background((role == .primary ? PVTheme.accent : PVTheme.surface).opacity(configuration.isPressed ? 0.88 : 1))
            .overlay(
                RoundedRectangle(cornerRadius: 9)
                    .stroke(role == .primary ? PVTheme.accent : PVTheme.line)
            )
            .clipShape(RoundedRectangle(cornerRadius: 9))
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

struct PVIconButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(PVTheme.accentPressed)
            .frame(width: PVTheme.minimumControlHeight, height: PVTheme.minimumControlHeight)
            .background(configuration.isPressed ? PVTheme.selected : PVTheme.surface)
            .overlay(RoundedRectangle(cornerRadius: 9).stroke(PVTheme.line))
            .clipShape(RoundedRectangle(cornerRadius: 9))
    }
}

struct PVCard<Content: View>: View {
    var radius: CGFloat = PVTheme.cornerRadius
    @ViewBuilder let content: Content

    var body: some View {
        content
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(PVTheme.surface)
            .overlay(RoundedRectangle(cornerRadius: radius).stroke(PVTheme.line))
            .clipShape(RoundedRectangle(cornerRadius: radius))
    }
}

struct PVField<Content: View>: View {
    let title: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(PVTheme.ink)
            content
                .frame(maxWidth: .infinity, minHeight: PVTheme.minimumControlHeight, alignment: .leading)
                .padding(.horizontal, 12)
                .background(PVTheme.surface)
                .overlay(RoundedRectangle(cornerRadius: 9).stroke(PVTheme.inputLine))
                .clipShape(RoundedRectangle(cornerRadius: 9))
                .environment(\.pvChoiceEmbedded, true)
        }
    }
}

struct PVSectionTitle: View {
    let title: String
    var body: some View {
        Text(title.uppercased())
            .font(.caption.weight(.bold))
            .tracking(0.7)
            .foregroundStyle(PVTheme.muted)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

extension View {
    func pvScreen() -> some View {
        foregroundStyle(PVTheme.ink)
            .tint(PVTheme.accent)
            .background(PVTheme.background.ignoresSafeArea())
    }
}
