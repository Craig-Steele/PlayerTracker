import SwiftUI

@main
struct PlayerTrackeriOSApp: App {
    @State private var model = PlayerAppModel()

    var body: some Scene {
        WindowGroup {
            ContentView(model: model)
        }
    }
}
