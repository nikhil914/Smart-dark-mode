import SwiftUI
#if os(macOS)
import SafariServices
#endif

@main
struct SmartDarkModeApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}

/// The app only explains how to turn the extension on; everything else happens in Safari.
struct ContentView: View {
    static let extensionId = "io.github.nikhil914.SmartDarkMode.Extension"

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Smart Dark Mode")
                .font(.largeTitle.bold())
            Text("Dark mode for every website, with your choice of theme, per-site settings and a dark PDF viewer.")
            #if os(macOS)
            Text("Turn it on in Safari > Settings > Extensions, then allow it on all websites.")
            Button("Open Safari Extension Settings") {
                SFSafariApplication.showPreferencesForExtension(withIdentifier: Self.extensionId) { _ in }
            }
            .buttonStyle(.borderedProminent)
            #else
            Text("Turn it on in Settings > Apps > Safari > Extensions, then allow it on all websites.")
            #endif
            Text("Shortcuts: use “Set Smart Dark Mode” and “Set Smart Dark Mode theme” in the Shortcuts app, for example in a Focus or time-of-day automation.")
                .foregroundStyle(.secondary)
            Text("Nothing you browse is collected or sent anywhere.")
                .foregroundStyle(.secondary)
        }
        .padding(32)
        .frame(maxWidth: 560, alignment: .leading)
    }
}
