import AppIntents

enum DarkModeState: String, AppEnum {
    case on, off, toggle

    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Dark mode"
    static var caseDisplayRepresentations: [DarkModeState: DisplayRepresentation] = [
        .on: "On",
        .off: "Off",
        .toggle: "Toggle",
    ]
}

/// Theme ids match `BUILT_IN_THEME_IDS` in packages/settings.
enum ThemeChoice: String, AppEnum {
    case dark, amoled, dim, sepia, contrast, grayscale, protan, deutan, tritan

    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Theme"
    static var caseDisplayRepresentations: [ThemeChoice: DisplayRepresentation] = [
        .dark: "Dark",
        .amoled: "AMOLED black",
        .dim: "Dim",
        .sepia: "Sepia",
        .contrast: "High contrast",
        .grayscale: "Grayscale",
        .protan: "Red-weak friendly",
        .deutan: "Green-weak friendly",
        .tritan: "Blue-weak friendly",
    ]
}

struct SetDarkModeIntent: AppIntent {
    static var title: LocalizedStringResource = "Set Smart Dark Mode"
    static var description = IntentDescription(
        "Turns dark mode on or off for every site in Safari. Safari applies it within a minute, or at once when you switch tabs."
    )

    @Parameter(title: "Dark mode", default: .toggle)
    var state: DarkModeState

    static var parameterSummary: some ParameterSummary {
        Summary("Turn Smart Dark Mode \(\.$state)")
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let target: Bool
        switch state {
        case .on: target = true
        case .off: target = false
        case .toggle: target = !Bridge.enabled
        }
        Bridge.enqueue(type: "enabled", value: target ? "true" : "false")
        let dialog: IntentDialog = target ? "Dark mode is turning on." : "Dark mode is turning off."
        return .result(dialog: dialog)
    }
}

struct SetThemeIntent: AppIntent {
    static var title: LocalizedStringResource = "Set Smart Dark Mode theme"
    static var description = IntentDescription("Chooses the dark theme used in Safari.")

    @Parameter(title: "Theme", default: .dark)
    var theme: ThemeChoice

    static var parameterSummary: some ParameterSummary {
        Summary("Use the \(\.$theme) theme")
    }

    func perform() async throws -> some IntentResult {
        Bridge.enqueue(type: "theme", value: theme.rawValue)
        return .result()
    }
}

struct SmartDarkModeShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: SetDarkModeIntent(),
            phrases: [
                "Toggle \(.applicationName)",
                "Switch \(.applicationName)",
            ]
        )
        AppShortcut(
            intent: SetThemeIntent(),
            phrases: ["Change \(.applicationName) theme"]
        )
    }
}
