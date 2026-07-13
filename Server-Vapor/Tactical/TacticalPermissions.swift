import Foundation

enum TacticalPermission {
    case referee
    case player
    case display
}

struct TacticalPermissionSet {
    let role: TacticalPermission

    var canEditEncounter: Bool {
        role == .referee
    }

    var canViewHiddenTokens: Bool {
        role == .referee
    }
}
