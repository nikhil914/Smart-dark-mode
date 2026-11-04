import Foundation

/// Commands from Shortcuts wait here until the extension collects them.
/// Shared by the app and the extension through an App Group.
enum Bridge {
    static let appGroup = "group.io.github.nikhil914.smartdarkmode"
    private static let pendingKey = "pendingCommands"
    private static let stateKey = "extensionState"
    private static let maxPending = 20

    private static var defaults: UserDefaults? { UserDefaults(suiteName: appGroup) }

    static func enqueue(type: String, value: String) {
        guard let defaults else { return }
        var list = defaults.array(forKey: pendingKey) as? [[String: String]] ?? []
        list.append(["type": type, "value": value])
        if list.count > maxPending { list.removeFirst(list.count - maxPending) }
        defaults.set(list, forKey: pendingKey)
    }

    /// Whether dark mode was on when the extension last reported. Defaults to on.
    static var enabled: Bool {
        (defaults?.dictionary(forKey: stateKey)?["enabled"] as? Bool) ?? true
    }

    /// Answers a message from the extension. Unknown messages get `ok: false`.
    static func handle(_ message: Any?) -> [String: Any] {
        guard let body = message as? [String: Any], let type = body["type"] as? String else {
            return ["ok": false]
        }
        switch type {
        case "poll":
            let list = defaults?.array(forKey: pendingKey) as? [[String: String]] ?? []
            defaults?.removeObject(forKey: pendingKey)
            return ["ok": true, "commands": list]
        case "state":
            var state: [String: Any] = [:]
            if let enabled = body["enabled"] as? Bool { state["enabled"] = enabled }
            if let theme = body["theme"] as? String, theme.count <= 64 { state["theme"] = theme }
            defaults?.set(state, forKey: stateKey)
            return ["ok": true]
        default:
            return ["ok": false]
        }
    }
}
