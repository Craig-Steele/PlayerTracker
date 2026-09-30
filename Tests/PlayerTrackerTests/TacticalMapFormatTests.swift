import Foundation
import Testing
@testable import PlayerTracker

struct TacticalMapFormatTests {
    @Test
    func legacyMapMetadataDefaultsToCurrentFormatAndVersion() throws {
        let map = try JSONDecoder().decode(TacticalMapState.self, from: mapJSON())

        #expect(map.format == TacticalMapState.formatIdentifier)
        #expect(map.version == TacticalMapState.currentFormatVersion)
        #expect(TacticalMapValidator.validationError(for: map) == nil)
    }

    @Test
    func currentMapMetadataEncodesExplicitFormatAndVersion() throws {
        let map = try JSONDecoder().decode(TacticalMapState.self, from: mapJSON())
        let object = try #require(JSONSerialization.jsonObject(with: JSONEncoder().encode(map)) as? [String: Any])

        #expect(object["format"] as? String == "TacticalTableTop.Map")
        #expect(object["version"] as? Int == 1)
    }

    @Test
    func blankMapBackgroundColorRoundTripsInMapPresentation() throws {
        var object = try #require(JSONSerialization.jsonObject(with: mapJSON()) as? [String: Any])
        object["mapPresentation"] = [
            "sideWallColor": ["r": 0, "g": 0, "b": 0, "a": 1],
            "blankBackgroundColor": "#7cba5b"
        ]
        let map = try JSONDecoder().decode(TacticalMapState.self, from: JSONSerialization.data(withJSONObject: object))
        #expect(map.mapPresentation.blankBackgroundColor == "#7cba5b")

        let encoded = try JSONSerialization.jsonObject(with: JSONEncoder().encode(map)) as? [String: Any]
        let presentation = try #require(encoded?["mapPresentation"] as? [String: Any])
        #expect(presentation["blankBackgroundColor"] as? String == "#7cba5b")
    }

    @Test
    func unsupportedMapFormatVersionHasUsefulValidationError() throws {
        let map = try JSONDecoder().decode(TacticalMapState.self, from: mapJSON(version: 2))

        #expect(TacticalMapValidator.validationError(for: map) == "Unsupported Tactical Table Top map version 2. This app supports version 1.")
    }

    @Test
    func unsupportedMapFormatIdentifierHasUsefulValidationError() throws {
        let map = try JSONDecoder().decode(TacticalMapState.self, from: mapJSON(format: "TacticalTableTop.Character"))

        #expect(TacticalMapValidator.validationError(for: map) == "Unsupported map format 'TacticalTableTop.Character'. Expected TacticalTableTop.Map.")
    }

    @Test
    func secretDoorIsAValidMapEdge() throws {
        var object = try #require(JSONSerialization.jsonObject(with: mapJSON()) as? [String: Any])
        object["edges"] = [["axis": "vertical", "x": 1, "y": 0, "type": "secretDoor"]]
        let map = try JSONDecoder().decode(TacticalMapState.self, from: JSONSerialization.data(withJSONObject: object))

        #expect(map.edges?.first?.type == "secretDoor")
        #expect(TacticalMapValidator.validationError(for: map) == nil)
    }

    @Test
    func fenceIsAValidMapEdgeWithoutDoorStateOrWidth() throws {
        var object = try #require(JSONSerialization.jsonObject(with: mapJSON()) as? [String: Any])
        object["edges"] = [["axis": "horizontal", "x": 0, "y": 1, "type": "fence"]]
        let map = try JSONDecoder().decode(TacticalMapState.self, from: JSONSerialization.data(withJSONObject: object))

        #expect(map.edges?.first?.type == "fence")
        #expect(TacticalMapValidator.validationError(for: map) == nil)
    }

    @Test
    func windowEdgesRequireAndAcceptSupportedInitialStates() throws {
        var object = try #require(JSONSerialization.jsonObject(with: mapJSON()) as? [String: Any])
        object["edges"] = [
            ["axis": "vertical", "x": 0, "y": 0, "type": "window", "widthFt": 3, "initialState": "uninspected"],
            ["axis": "vertical", "x": 1, "y": 0, "type": "window", "widthFt": 4, "initialState": "inspected"],
            ["axis": "horizontal", "x": 0, "y": 0, "type": "window", "widthFt": 5, "initialState": "open"]
        ]
        let map = try JSONDecoder().decode(TacticalMapState.self, from: JSONSerialization.data(withJSONObject: object))
        #expect(map.edges?.map(\.initialState) == ["uninspected", "inspected", "open"])
        #expect(TacticalMapValidator.validationError(for: map) == nil)

        object["edges"] = [["axis": "vertical", "x": 1, "y": 0, "type": "window", "widthFt": 5, "initialState": "broken"]]
        let invalidMap = try JSONDecoder().decode(TacticalMapState.self, from: JSONSerialization.data(withJSONObject: object))
        #expect(TacticalMapValidator.validationError(for: invalidMap) == "A window's initial state must be uninspected, inspected, or open.")

        object["edges"] = [["axis": "vertical", "x": 1, "y": 0, "type": "window", "widthFt": 5]]
        let missingStateMap = try JSONDecoder().decode(TacticalMapState.self, from: JSONSerialization.data(withJSONObject: object))
        #expect(TacticalMapValidator.validationError(for: missingStateMap) == "Each window must define an initial state.")

        object["edges"] = [["axis": "vertical", "x": 1, "y": 0, "type": "window", "initialState": "open"]]
        let missingWidthMap = try JSONDecoder().decode(TacticalMapState.self, from: JSONSerialization.data(withJSONObject: object))
        #expect(TacticalMapValidator.validationError(for: missingWidthMap) == "Each door or window must define its opening width.")
    }

    @Test
    func decorativeEmojiStickersDecodeEncodeAndValidate() throws {
        var object = try #require(JSONSerialization.jsonObject(with: mapJSON()) as? [String: Any])
        object["stickers"] = [["x": 1, "y": 0, "emoji": "🌳", "sizePercent": 300, "opacityPercent": 50]]
        let map = try JSONDecoder().decode(TacticalMapState.self, from: JSONSerialization.data(withJSONObject: object))
        let sticker = try #require(map.stickers?.first)

        #expect(sticker.emoji == "🌳")
        #expect(sticker.sizePercent == 300)
        #expect(sticker.opacityPercent == 50)
        #expect(TacticalMapValidator.validationError(for: map) == nil)

        let encoded = try JSONSerialization.jsonObject(with: JSONEncoder().encode(map)) as? [String: Any]
        let encodedSticker = try #require((encoded?["stickers"] as? [[String: Any]])?.first)
        #expect(encodedSticker["emoji"] as? String == "🌳")
        #expect(encodedSticker["sizePercent"] as? Int == 300)
        #expect(encodedSticker["opacityPercent"] as? Int == 50)
    }

    @Test
    func circularAndRectangularStickersDecodeAndValidate() throws {
        var object = try #require(JSONSerialization.jsonObject(with: mapJSON()) as? [String: Any])
        object["stickers"] = [
            ["shape": "circle", "x": 0.5, "y": 0.5, "radius": 0.25, "emoji": "🌳"],
            ["shape": "rectangle", "x": 0.5, "y": 0.5, "x1": 0.25, "y1": 0.25, "x2": 0.75, "y2": 0.75, "emoji": "🪑"]
        ]
        let map = try JSONDecoder().decode(TacticalMapState.self, from: JSONSerialization.data(withJSONObject: object))
        #expect(map.stickers?.count == 2)
        #expect(map.stickers?.first?.radius == 0.25)
        #expect(map.stickers?.last?.x1 == 0.25)
        #expect(TacticalMapValidator.validationError(for: map) == nil)
    }

    @Test
    func stickerMirroringAndRotationDecodeEncodeAndValidate() throws {
        var object = try #require(JSONSerialization.jsonObject(with: mapJSON()) as? [String: Any])
        object["stickers"] = [[
            "x": 0.5, "y": 0.5, "emoji": "🌳", "sizePercent": 100,
            "rotationDegrees": 360, "flipHorizontal": true, "flipVertical": false
        ]]
        let map = try JSONDecoder().decode(TacticalMapState.self, from: JSONSerialization.data(withJSONObject: object))
        let sticker = try #require(map.stickers?.first)
        #expect(sticker.rotationDegrees == 360)
        #expect(sticker.flipHorizontal == true)
        #expect(sticker.flipVertical == false)
        #expect(TacticalMapValidator.validationError(for: map) == nil)

        let encoded = try JSONSerialization.jsonObject(with: JSONEncoder().encode(map)) as? [String: Any]
        let encodedSticker = try #require((encoded?["stickers"] as? [[String: Any]])?.first)
        #expect(encodedSticker["rotationDegrees"] as? Double == 360)
        #expect(encodedSticker["flipHorizontal"] as? Bool == true)
        #expect(encodedSticker["flipVertical"] as? Bool == false)
    }

    @Test
    func stickerRejectsInvalidRotation() throws {
        var object = try #require(JSONSerialization.jsonObject(with: mapJSON()) as? [String: Any])
        object["stickers"] = [["x": 1, "y": 1, "emoji": "🌳", "sizePercent": 100, "rotationDegrees": 361]]
        let map = try JSONDecoder().decode(TacticalMapState.self, from: JSONSerialization.data(withJSONObject: object))
        #expect(TacticalMapValidator.validationError(for: map) == "A map sticker rotation must be between 0 and 360 degrees.")
    }

    @Test
    func decorativeStickersUseContinuousSouthwestGridCoordinatesIncludingMapCorners() throws {
        var object = try #require(JSONSerialization.jsonObject(with: mapJSON()) as? [String: Any])
        var grid = try #require(object["grid"] as? [String: Any])
        grid["northSouthSquareCount"] = 3
        object["grid"] = grid
        object["stickers"] = [
            ["x": 1.5, "y": 2.5, "emoji": "🌳", "sizePercent": 100],
            ["x": 0, "y": 0, "emoji": "✨", "sizePercent": 100],
            ["x": 2, "y": 3, "emoji": "⭐", "sizePercent": 100]
        ]
        let map = try JSONDecoder().decode(TacticalMapState.self, from: JSONSerialization.data(withJSONObject: object))

        #expect(map.stickers?.first?.x == 1.5)
        #expect(map.stickers?.first?.y == 2.5)
        #expect(TacticalMapValidator.validationError(for: map) == nil)
    }

    @Test
    func decorativeStickersRejectOutOfBoundsCoordinates() throws {
        var object = try #require(JSONSerialization.jsonObject(with: mapJSON()) as? [String: Any])
        object["stickers"] = [["x": 2.1, "y": 0.5, "emoji": "✨", "sizePercent": 100]]
        let map = try JSONDecoder().decode(TacticalMapState.self, from: JSONSerialization.data(withJSONObject: object))

        #expect(TacticalMapValidator.validationError(for: map) == "A map sticker must be positioned within the southwest (0, 0) and northeast grid corners.")
    }

    @Test
    func legacyDecorativeStickerWithoutOpacityRemainsValid() throws {
        var object = try #require(JSONSerialization.jsonObject(with: mapJSON()) as? [String: Any])
        object["stickers"] = [["x": 0, "y": 0, "emoji": "✨", "sizePercent": 100]]
        let map = try JSONDecoder().decode(TacticalMapState.self, from: JSONSerialization.data(withJSONObject: object))

        #expect(map.stickers?.first?.opacityPercent == nil)
        #expect(TacticalMapValidator.validationError(for: map) == nil)
    }

    @Test
    func decorativeStickerRejectsInvalidSize() throws {
        var object = try #require(JSONSerialization.jsonObject(with: mapJSON()) as? [String: Any])
        object["stickers"] = [["x": 0, "y": 0, "emoji": "✨", "sizePercent": 501]]
        let map = try JSONDecoder().decode(TacticalMapState.self, from: JSONSerialization.data(withJSONObject: object))

        #expect(TacticalMapValidator.validationError(for: map) == "A map sticker size must be between 33% and 500% of a square.")
    }

    @Test
    func decorativeStickerRejectsInvalidOpacity() throws {
        var object = try #require(JSONSerialization.jsonObject(with: mapJSON()) as? [String: Any])
        object["stickers"] = [["x": 0, "y": 0, "emoji": "✨", "sizePercent": 100, "opacityPercent": 101]]
        let map = try JSONDecoder().decode(TacticalMapState.self, from: JSONSerialization.data(withJSONObject: object))

        #expect(TacticalMapValidator.validationError(for: map) == "A map sticker opacity must be between 0% and 100%.")
    }

    private func mapJSON(format: String? = nil, version: Int? = nil) throws -> Data {
        var object: [String: Any] = [
            "imagePath": "test.png",
            "grid": [
                "eastWestSquareCount": 2,
                "northSouthSquareCount": 1,
                "squareSizeFt": 5,
                "coordinateConvention": ["origin": "southwest"]
            ],
            "blockedTiles": [],
            "terrain": ["defaultType": "normal", "overrides": []],
            "elevation": ["defaultHeightFt": 0, "overrides": []],
            "mapPresentation": ["sideWallColor": ["r": 0, "g": 0, "b": 0, "a": 1]]
        ]
        if let format { object["format"] = format }
        if let version { object["version"] = version }
        return try JSONSerialization.data(withJSONObject: object)
    }
}

func makeStoredMapArchive(sidecar: Data, image: Data) -> Data {
    let files: [(String, Data)] = [("Example.png", image), ("Example.map.json", sidecar)]
    var archive = Data()
    var centralDirectory = Data()
    let utf8Flag: UInt16 = 0x0800

    for (name, bytes) in files {
        let nameData = Data(name.utf8)
        let checksum = mapArchiveCRC32(bytes)
        let localOffset = UInt32(archive.count)

        archive.appendMapArchiveUInt32(0x04034b50)
        archive.appendMapArchiveUInt16(20)
        archive.appendMapArchiveUInt16(utf8Flag)
        archive.appendMapArchiveUInt16(0)
        archive.appendMapArchiveUInt16(0)
        archive.appendMapArchiveUInt16(0)
        archive.appendMapArchiveUInt32(checksum)
        archive.appendMapArchiveUInt32(UInt32(bytes.count))
        archive.appendMapArchiveUInt32(UInt32(bytes.count))
        archive.appendMapArchiveUInt16(UInt16(nameData.count))
        archive.appendMapArchiveUInt16(0)
        archive.append(nameData)
        archive.append(bytes)

        centralDirectory.appendMapArchiveUInt32(0x02014b50)
        centralDirectory.appendMapArchiveUInt16(20)
        centralDirectory.appendMapArchiveUInt16(20)
        centralDirectory.appendMapArchiveUInt16(utf8Flag)
        centralDirectory.appendMapArchiveUInt16(0)
        centralDirectory.appendMapArchiveUInt16(0)
        centralDirectory.appendMapArchiveUInt16(0)
        centralDirectory.appendMapArchiveUInt32(checksum)
        centralDirectory.appendMapArchiveUInt32(UInt32(bytes.count))
        centralDirectory.appendMapArchiveUInt32(UInt32(bytes.count))
        centralDirectory.appendMapArchiveUInt16(UInt16(nameData.count))
        centralDirectory.appendMapArchiveUInt16(0)
        centralDirectory.appendMapArchiveUInt16(0)
        centralDirectory.appendMapArchiveUInt16(0)
        centralDirectory.appendMapArchiveUInt16(0)
        centralDirectory.appendMapArchiveUInt32(0)
        centralDirectory.appendMapArchiveUInt32(localOffset)
        centralDirectory.append(nameData)
    }

    let directoryOffset = UInt32(archive.count)
    archive.append(centralDirectory)
    archive.appendMapArchiveUInt32(0x06054b50)
    archive.appendMapArchiveUInt16(0)
    archive.appendMapArchiveUInt16(0)
    archive.appendMapArchiveUInt16(UInt16(files.count))
    archive.appendMapArchiveUInt16(UInt16(files.count))
    archive.appendMapArchiveUInt32(UInt32(centralDirectory.count))
    archive.appendMapArchiveUInt32(directoryOffset)
    archive.appendMapArchiveUInt16(0)
    return archive
}

private func mapArchiveCRC32(_ data: Data) -> UInt32 {
    var crc: UInt32 = 0xffffffff
    for byte in data {
        crc ^= UInt32(byte)
        for _ in 0..<8 { crc = (crc & 1) == 1 ? (crc >> 1) ^ 0xedb88320 : crc >> 1 }
    }
    return crc ^ 0xffffffff
}

private extension Data {
    mutating func appendMapArchiveUInt16(_ value: UInt16) {
        append(UInt8(value & 0xff))
        append(UInt8((value >> 8) & 0xff))
    }

    mutating func appendMapArchiveUInt32(_ value: UInt32) {
        append(UInt8(value & 0xff))
        append(UInt8((value >> 8) & 0xff))
        append(UInt8((value >> 16) & 0xff))
        append(UInt8((value >> 24) & 0xff))
    }
}
