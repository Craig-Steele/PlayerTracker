import Foundation
#if os(Linux)
import FoundationNetworking
import Glibc
#elseif canImport(Darwin)
import Darwin
#endif

func getLocalIPv4Address() -> String {
    var address: String = "unknown"

    var ifaddr: UnsafeMutablePointer<ifaddrs>?
    guard getifaddrs(&ifaddr) == 0, let firstAddr = ifaddr else {
        return address
    }

    for ptr in sequence(first: firstAddr, next: { $0.pointee.ifa_next }) {
        let flags = Int32(ptr.pointee.ifa_flags)
        let addr = ptr.pointee.ifa_addr.pointee

        // Only IPv4
        if Int32(addr.sa_family) == AF_INET {

            // Ignore loopback interface
            if (flags & Int32(IFF_LOOPBACK)) == 0 {

                var hostname = [CChar](repeating: 0, count: Int(NI_MAXHOST))
                #if os(Linux)
                let addressLength = socklen_t(MemoryLayout<sockaddr_in>.size)
                #else
                let addressLength = socklen_t(ptr.pointee.ifa_addr.pointee.sa_len)
                #endif
                let result = getnameinfo(
                    ptr.pointee.ifa_addr,
                    addressLength,
                    &hostname,
                    socklen_t(hostname.count),
                    nil,
                    0,
                    NI_NUMERICHOST
                )

                if result == 0 {
                    let bytes: [UInt8] = hostname.prefix { $0 != 0 }.map {
                        UInt8(bitPattern: $0)
                    }
                    let ip = String(decoding: bytes, as: UTF8.self)
                    if ip != "127.0.0.1" {
                        address = ip
                        break
                    }
                }
            }
        }
    }

    freeifaddrs(ifaddr)
    return address
}

private struct PublicIPResponse: Decodable {
    let ip: String
}

func getPublicIPv4Address() async -> String? {
    guard let url = URL(string: "https://api.ipify.org?format=json") else {
        return nil
    }

    var request = URLRequest(url: url)
    request.timeoutInterval = 5
    request.cachePolicy = .reloadIgnoringLocalCacheData

    do {
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse,
              (200 ..< 300).contains(httpResponse.statusCode) else {
            return nil
        }

        let decoded = try JSONDecoder().decode(PublicIPResponse.self, from: data)
        let trimmed = decoded.ip.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    } catch {
        return nil
    }
}
