import SafariServices

/// Receives `browser.runtime.sendNativeMessage` calls from the extension.
final class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    func beginRequest(with context: NSExtensionContext) {
        let request = context.inputItems.first as? NSExtensionItem
        let message = request?.userInfo?[SFExtensionMessageKey]
        let response = NSExtensionItem()
        response.userInfo = [SFExtensionMessageKey: Bridge.handle(message)]
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }
}
