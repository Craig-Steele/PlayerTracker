import SwiftUI

struct ConnectionSheetView: View {
    @Binding var serverURLString: String
    let statusMessage: String
    let errorMessage: String?
    let onConnect: () -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section("Server") {
                    TextField("Server URL", text: $serverURLString)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                        .autocorrectionDisabled()
                    Button("Connect") {
                        onConnect()
                    }
                }

                Section {
                    if let errorMessage {
                        Text(errorMessage)
                            .foregroundStyle(.red)
                            .font(.footnote)
                    } else {
                        Text(statusMessage)
                            .foregroundStyle(.secondary)
                            .font(.footnote)
                    }
                }
            }
            .navigationTitle("Connect")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") {
                        dismiss()
                    }
                }
            }
        }
        .interactiveDismissDisabled(serverURLString.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    }
}

struct PlayerIdentitySheetView: View {
    @Binding var playerName: String
    let ownerId: UUID
    let onSave: () -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Player name", text: $playerName)
                    Text(ownerId.uuidString)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                } header: {
                    Text("Player")
                } footer: {
                    Text("This name is shown as the owner of your characters.")
                }
            }
            .navigationTitle("Player Identity")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") {
                        dismiss()
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        onSave()
                        dismiss()
                    }
                    .disabled(playerName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }
}

struct SettingsView: View {
    let serverURL: String
    let playerName: String
    let ownerId: UUID
    let onChangeConnection: () -> Void
    let onChangePlayer: () -> Void

    var body: some View {
        NavigationStack {
            List {
                Section("Server") {
                    Text(serverURL.isEmpty ? "Not set" : serverURL)
                        .foregroundStyle(serverURL.isEmpty ? .secondary : .primary)
                    Button("Change Connection", action: onChangeConnection)
                }

                Section("Player") {
                    Text(playerName.isEmpty ? "Not set" : playerName)
                        .foregroundStyle(playerName.isEmpty ? .secondary : .primary)
                    Button("Change Name", action: onChangePlayer)
                }

                Section("Player ID") {
                    Text(ownerId.uuidString)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                }
            }
            .navigationTitle("Settings")
        }
    }
}
