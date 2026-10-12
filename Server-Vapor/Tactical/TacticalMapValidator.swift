enum TacticalMapValidator {
    static func validationError(for map: TacticalMapState) -> String? {
        guard map.format == TacticalMapState.formatIdentifier else {
            return "Unsupported map format '\(map.format)'. Expected \(TacticalMapState.formatIdentifier)."
        }
        guard map.version == TacticalMapState.currentFormatVersion else {
            return "Unsupported Tactical Table Top map version \(map.version). This app supports version \(TacticalMapState.currentFormatVersion)."
        }

        let columns = map.grid.eastWestSquareCount
        let rows = map.grid.northSouthSquareCount
        guard columns > 0, rows > 0, map.grid.squareSizeFt > 0 else {
            return "The map grid dimensions and square size must be positive."
        }

        for tile in map.blockedTiles where tile.x < 0 || tile.x >= columns || tile.y < 0 || tile.y >= rows {
            return "An obstacle square is outside the map grid."
        }
        for sticker in map.stickers ?? [] {
            guard sticker.x.isFinite, sticker.y.isFinite,
                  sticker.x >= 0, sticker.x <= Double(columns),
                  sticker.y >= 0, sticker.y <= Double(rows) else {
                return "A map sticker must be positioned within the southwest (0, 0) and northeast grid corners."
            }
            if sticker.shape == "circle" {
                guard let radius = sticker.radius, radius.isFinite, radius > 0 else { return "A circular map sticker must have a positive radius." }
            } else if sticker.shape == "rectangle" {
                guard let x1 = sticker.x1, let y1 = sticker.y1, let x2 = sticker.x2, let y2 = sticker.y2,
                      x1.isFinite, y1.isFinite, x2.isFinite, y2.isFinite,
                      x1 >= 0, x1 <= Double(columns), x2 >= 0, x2 <= Double(columns),
                      y1 >= 0, y1 <= Double(rows), y2 >= 0, y2 <= Double(rows), x1 != x2, y1 != y2 else {
                    return "A rectangular map sticker must have two distinct corners."
                }
            } else if sticker.shape == nil {
                guard let size = sticker.sizePercent, (33...500).contains(size) else {
                    return "A map sticker size must be between 33% and 500% of a square."
                }
            } else {
                return "A map sticker must define a circle, rectangle, or valid legacy size."
            }
            if let opacity = sticker.opacityPercent, !(0...100).contains(opacity) {
                return "A map sticker opacity must be between 0% and 100%."
            }
            if let rotation = sticker.rotationDegrees, !rotation.isFinite || !(0.0...360.0).contains(rotation) {
                return "A map sticker rotation must be between 0 and 360 degrees."
            }
            guard !sticker.emoji.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                  sticker.emoji.count <= 8 else {
                return "A map sticker must contain an emoji."
            }
        }
        for tile in map.terrain.overrides where !contains(tile.x, tile.y, tile.width, tile.height, columns: columns, rows: rows) {
            return "A terrain override is outside the map grid or has invalid dimensions."
        }
        for tile in map.elevation.overrides where !contains(tile.x, tile.y, tile.width, tile.height, columns: columns, rows: rows) {
            return "An elevation override is outside the map grid or has invalid dimensions."
        }
        if let bounds = map.playerPlacement?.defaultBounds,
           bounds.west < 0 || bounds.south < 0 || bounds.east >= columns || bounds.north >= rows || bounds.west > bounds.east || bounds.south > bounds.north {
            return "The default player starting zone is outside the map grid or has invalid bounds."
        }

        var edgeLocations = Set<String>()
        for edge in map.edges ?? [] {
            let location = "\(edge.axis):\(edge.x):\(edge.y)"
            guard edgeLocations.insert(location).inserted else {
                return "The map defines more than one feature on the same grid edge."
            }
            let validPosition: Bool
            switch edge.axis {
            case "vertical": validPosition = edge.x >= 0 && edge.x <= columns && edge.y >= 0 && edge.y < rows
            case "horizontal": validPosition = edge.x >= 0 && edge.x < columns && edge.y >= 0 && edge.y <= rows
            default: validPosition = false
            }
            guard validPosition else { return "An edge feature is outside the map grid or has an invalid axis." }
            guard ["wall", "fence", "door", "secretDoor", "window"].contains(edge.type) else {
                return "An edge feature must be a wall, fence, door, secret door, or window."
            }
            if let width = edge.widthFt, !width.isFinite || width <= 0 {
                return "Door and window widths must be positive."
            }
            if ["door", "window"].contains(edge.type), edge.widthFt == nil {
                return "Each door or window must define its opening width."
            }
            if let state = edge.initialState, edge.type == "door", !["open", "closed"].contains(state) {
                return "A door's initial state must be open or closed."
            }
            if edge.type == "window", let state = edge.initialState, !["uninspected", "inspected", "open"].contains(state) {
                return "A window's initial state must be uninspected, inspected, or open."
            }
            if edge.type == "window", edge.initialState == nil {
                return "Each window must define an initial state."
            }
        }
        return nil
    }

    private static func contains(_ x: Int, _ y: Int, _ width: Int, _ height: Int, columns: Int, rows: Int) -> Bool {
        width > 0 && height > 0 && x >= 0 && y >= 0 && x + width <= columns && y + height <= rows
    }
}
