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
    func unsupportedMapFormatVersionHasUsefulValidationError() throws {
        let map = try JSONDecoder().decode(TacticalMapState.self, from: mapJSON(version: 2))

        #expect(TacticalMapValidator.validationError(for: map) == "Unsupported Tactical Table Top map version 2. This app supports version 1.")
    }

    @Test
    func unsupportedMapFormatIdentifierHasUsefulValidationError() throws {
        let map = try JSONDecoder().decode(TacticalMapState.self, from: mapJSON(format: "TacticalTableTop.Character"))

        #expect(TacticalMapValidator.validationError(for: map) == "Unsupported map format 'TacticalTableTop.Character'. Expected TacticalTableTop.Map.")
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
