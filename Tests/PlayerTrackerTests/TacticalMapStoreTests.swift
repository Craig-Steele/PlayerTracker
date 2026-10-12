import Foundation
import Testing
@testable import PlayerTracker

@Suite(.serialized)
struct TacticalMapStoreTests {
    @Test("loads the Arcane Library map source and referenced image")
    func loadsArcaneLibraryMapSourceAndReferencedImage() throws {
        let map = try TacticalMapStore().load()

        #expect(map.version == 1)
        #expect(map.imagePath == "Arcane Library PZO30084E.png")
        #expect(map.grid.eastWestSquareCount == 24)
        #expect(map.grid.northSouthSquareCount == 30)
        #expect(map.grid.squareSizeFt == 5.0)
        #expect(map.grid.coordinateConvention.origin == "southwest")
        #expect(map.blockedTiles.count == 197)
        #expect(map.elevation.overrides.count == 112)
        #expect(map.terrain.defaultType == "normal")

        let imageURL = try TacticalMapStore().imageURL(for: map)
        #expect(FileManager.default.fileExists(atPath: imageURL.path))
    }

    @Test("rejects a missing map source")
    func rejectsMissingMapSource() {
        let sourceURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("roll4initiative-missing-map-(UUID().uuidString).json")

        do {
            _ = try TacticalMapStore(mapSourceURL: sourceURL).load()
            Issue.record("Expected the missing map source to be rejected.")
        } catch let error as TacticalMapStoreError {
            #expect(error == .mapSourceNotFound(sourceURL))
        } catch {
            Issue.record("Unexpected error: \(error)")
        }
    }

    @Test("rejects a map whose referenced image is missing")
    func rejectsMissingMapImage() throws {
        let sourceURL = try writeTemporaryMapSource(imagePath: "missing.png")
        defer { try? FileManager.default.removeItem(at: sourceURL.deletingLastPathComponent()) }

        let expectedImageURL = sourceURL
            .deletingLastPathComponent()
            .appendingPathComponent("missing.png")

        do {
            _ = try TacticalMapStore(mapSourceURL: sourceURL).load()
            Issue.record("Expected the missing map image to be rejected.")
        } catch let error as TacticalMapStoreError {
            #expect(error == .mapImageNotFound(expectedImageURL))
        } catch {
            Issue.record("Unexpected error: \(error)")
        }
    }

    @Test("rejects a map with an empty image path")
    func rejectsEmptyImagePath() throws {
        let sourceURL = try writeTemporaryMapSource(imagePath: "")
        defer { try? FileManager.default.removeItem(at: sourceURL.deletingLastPathComponent()) }

        do {
            _ = try TacticalMapStore(mapSourceURL: sourceURL).load()
            Issue.record("Expected the empty image path to be rejected.")
        } catch let error as TacticalMapStoreError {
            #expect(error == .imagePathMissing)
        } catch {
            Issue.record("Unexpected error: \(error)")
        }
    }

    @Test("rejects invalid map JSON")
    func rejectsInvalidMapJSON() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("roll4initiative-invalid-map-(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }

        let sourceURL = directory.appendingPathComponent("map.json")
        try Data("{ invalid map json".utf8).write(to: sourceURL)

        do {
            _ = try TacticalMapStore(mapSourceURL: sourceURL).load()
            Issue.record("Expected invalid JSON to be rejected.")
        } catch is DecodingError {
            // Expected: the map source must decode as TacticalMapState.
        } catch {
            Issue.record("Unexpected error: \(error)")
        }
    }

    private func writeTemporaryMapSource(imagePath: String) throws -> URL {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("roll4initiative-map-(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)

        let sourceURL = directory.appendingPathComponent("map.json")
        let json = """
        {
          "version": 1,
          "imagePath": "\(imagePath)",
          "grid": {
            "eastWestSquareCount": 2,
            "northSouthSquareCount": 2,
            "squareSizeFt": 5.0,
            "coordinateConvention": { "origin": "southwest" }
          },
          "blockedTiles": [],
          "terrain": { "defaultType": "normal", "overrides": [] },
          "elevation": { "defaultHeightFt": 0.0, "overrides": [] },
          "mapPresentation": {
            "sideWallColor": { "r": 0.1, "g": 0.1, "b": 0.1, "a": 0.5 }
          }
        }
        """
        try Data(json.utf8).write(to: sourceURL)
        return sourceURL
    }
}
