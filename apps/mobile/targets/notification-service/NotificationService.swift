import CryptoKit
import Foundation
import Security
import UserNotifications

/// Opens the push content the server sealed for this device and puts it into
/// the notification before iOS shows it.
///
/// APNs carries `gp` = base64(nonce 12 ‖ ciphertext ‖ tag 16), AES-256-GCM with
/// the key the app generated and stored in the shared keychain group. Whatever
/// fails (no key, wrong key, unknown version, timeout), the constant fallback
/// alert from the server stays — never an empty or half-filled notification.
class NotificationService: UNNotificationServiceExtension {
  // Must match apps/mobile/services/push/pushKeyStore.ts. expo-secure-store
  // appends ":no-auth" to the service and stores the key name as UTF-8 Data in
  // kSecAttrAccount (node_modules/expo-secure-store/ios/SecureStoreModule.swift).
  private static let keychainService = "gruenerator-push:no-auth"
  private static let keychainAccount = Data("push_device_key".utf8)
  private static let accessGroup = "P74W7SGX8R.de.gruenerator.app.push"

  private var contentHandler: ((UNNotificationContent) -> Void)?
  private var fallback: UNNotificationContent?

  override func didReceive(
    _ request: UNNotificationRequest,
    withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
  ) {
    self.contentHandler = contentHandler
    fallback = request.content

    guard
      let content = request.content.mutableCopy() as? UNMutableNotificationContent,
      let sealed = request.content.userInfo["gp"] as? String,
      let payload = Self.open(sealed)
    else {
      contentHandler(request.content)
      return
    }

    content.title = payload.title
    content.body = payload.body ?? ""
    var data: [String: Any] = ["id": payload.id]
    if let url = payload.url { data["url"] = url }
    var userInfo = content.userInfo
    userInfo.removeValue(forKey: "gp")
    // expo-notifications exposes userInfo["body"] as `content.data` for remote
    // notifications (NotificationRecords.swift, serializedNotificationData).
    userInfo["body"] = data
    content.userInfo = userInfo
    contentHandler(content)
  }

  override func serviceExtensionTimeWillExpire() {
    if let contentHandler, let fallback {
      contentHandler(fallback)
    }
  }

  private struct Payload: Decodable {
    let v: Int
    let id: String
    let title: String
    let body: String?
    let url: String?
  }

  private static func open(_ sealed: String) -> Payload? {
    guard
      let key = loadKey(),
      let combined = Data(base64Encoded: sealed),
      let box = try? AES.GCM.SealedBox(combined: combined),
      let plain = try? AES.GCM.open(box, using: SymmetricKey(data: key)),
      let payload = try? JSONDecoder().decode(Payload.self, from: plain),
      payload.v == 1
    else { return nil }
    return payload
  }

  private static func loadKey() -> Data? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: keychainService,
      kSecAttrAccount as String: keychainAccount,
      kSecAttrAccessGroup as String: accessGroup,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var item: CFTypeRef?
    guard
      SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
      let stored = item as? Data,
      let base64 = String(data: stored, encoding: .utf8),
      let key = Data(base64Encoded: base64),
      key.count == 32
    else { return nil }
    return key
  }
}
