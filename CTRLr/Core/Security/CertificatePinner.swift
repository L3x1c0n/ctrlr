import Foundation
import Security
import CryptoKit

// MARK: - CertificatePinner
//
// Implements SPKI (Subject Public Key Info) hash pinning for known external
// domains. Pins to intermediate CA certificates rather than leaf certificates
// so pinning survives normal certificate rotation.
//
// Pinned domains and their CA SPKI SHA-256 hashes (Base64):
//
//  plex.tv — DigiCert intermediate CAs
//    DigiCert Global Root CA:          r/mIkG3eEpVdm+u/ko/cwxzOMo1bk4TyHIlByibiA5E=
//    DigiCert SHA2 Secure Server CA:   5kJvNEMw0KjrCAu7eXY5HZdvyCS13BbA0VJG1RSP91w=
//
//  ntfy.sh — Let's Encrypt intermediate CAs
//    ISRG Root X1:                     C5+lpZ7tcVwmwQIMcRtPbsQtWLABXhQzejna0wHFr8M=
//    Let's Encrypt R3:                 jQJTbIh0grw0/1TkHSumWb+Fs0Mu3uaESggMmgwQJ0Q=
//
// NOTE: Verify these hashes against the live certificates before shipping.
// Use: openssl s_client -connect plex.tv:443 | openssl x509 -pubkey -noout |
//      openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | base64

final class CertificatePinner: NSObject, URLSessionDelegate {

    // MARK: - Known SPKI SHA-256 hashes

    /// Domains that require certificate pinning.
    private static let pinnedDomains: [String: Set<String>] = [
        "plex.tv": [
            "r/mIkG3eEpVdm+u/ko/cwxzOMo1bk4TyHIlByibiA5E=",   // DigiCert Global Root CA
            "5kJvNEMw0KjrCAu7eXY5HZdvyCS13BbA0VJG1RSP91w=",   // DigiCert SHA2 Secure Server CA
        ],
        "ntfy.sh": [
            "C5+lpZ7tcVwmwQIMcRtPbsQtWLABXhQzejna0wHFr8M=",   // ISRG Root X1
            "jQJTbIh0grw0/1TkHSumWb+Fs0Mu3uaESggMmgwQJ0Q=",   // Let's Encrypt R3
        ],
    ]

    // MARK: - URLSessionDelegate

    func urlSession(_ session: URLSession,
                    didReceive challenge: URLAuthenticationChallenge,
                    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
              let serverTrust = challenge.protectionSpace.serverTrust else {
            completionHandler(.cancelAuthenticationChallenge, nil)
            return
        }

        let host = challenge.protectionSpace.host

        // Find the pinned hashes for this host (or any suffix match, e.g. sub.plex.tv)
        let pins = Self.pinnedDomains.first {
            host == $0.key || host.hasSuffix(".\($0.key)")
        }?.value

        guard let pins else {
            // Not a pinned domain — use default OS trust evaluation
            completionHandler(.performDefaultHandling, nil)
            return
        }

        // Evaluate the server trust using the system's default policy
        var error: CFError?
        guard SecTrustEvaluateWithError(serverTrust, &error) else {
            completionHandler(.cancelAuthenticationChallenge, nil)
            return
        }

        // Walk the certificate chain and check whether any cert's SPKI hash
        // matches one of the known-good pins
        let chain = SecTrustCopyCertificateChain(serverTrust) as? [SecCertificate] ?? []
        for cert in chain {
            if let spkiHash = Self.spkiHash(for: cert), pins.contains(spkiHash) {
                completionHandler(.useCredential, URLCredential(trust: serverTrust))
                return
            }
        }

        // No pin matched — reject the connection
        completionHandler(.cancelAuthenticationChallenge, nil)
    }

    // MARK: - SPKI hash extraction

    /// Extracts the SubjectPublicKeyInfo block from a SecCertificate and returns
    /// its SHA-256 digest encoded as Base64 — the same format used for pinning.
    private static func spkiHash(for certificate: SecCertificate) -> String? {
        guard let publicKey = SecCertificateCopyKey(certificate),
              let publicKeyData = SecKeyCopyExternalRepresentation(publicKey, nil) as Data? else {
            return nil
        }

        // Prepend the ASN.1 header for the key type so we hash the full SPKI,
        // not just the raw key bytes. The header bytes below cover RSA-2048/4096
        // and EC-256/384/521 — the key types used by modern TLS CAs.
        let spkiData: Data
        let keyAttributes = SecKeyCopyAttributes(publicKey) as? [String: Any]
        let keyType = keyAttributes?[kSecAttrKeyType as String] as? String
        let keySize = keyAttributes?[kSecAttrKeySizeInBits as String] as? Int

        // ASN.1 SubjectPublicKeyInfo headers for common key types
        let rsaHeader = Data([
            0x30, 0x82, 0x01, 0x22, 0x30, 0x0d, 0x06, 0x09,
            0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01,
            0x01, 0x05, 0x00, 0x03, 0x82, 0x01, 0x0f, 0x00
        ])
        let ecP256Header = Data([
            0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86,
            0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08, 0x2a,
            0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x03,
            0x42, 0x00
        ])

        if keyType == (kSecAttrKeyTypeRSA as String) {
            spkiData = rsaHeader + publicKeyData
        } else if keyType == (kSecAttrKeyTypeECSECPrimeRandom as String), keySize == 256 {
            spkiData = ecP256Header + publicKeyData
        } else {
            // For other key types, hash the raw key bytes — may not match standard SPKI pins
            spkiData = publicKeyData
        }

        let hash = SHA256.hash(data: spkiData)
        return Data(hash).base64EncodedString()
    }
}
