import SwiftUI

struct CharacterEditorView: View {
    @Binding var draft: CharacterDraft
    let ruleSet: RuleSetLibraryDTO?
    let onManageConditions: () -> Void
    let onSave: () -> Void
    let onDelete: (() -> Void)?

    @Environment(\.dismiss) private var dismiss
    @State private var showingDeleteConfirmation = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Identity") {
                    TextField("Character name", text: $draft.name)
                    TextField("Initiative", text: $draft.initiative)
                        .keyboardType(.numberPad)
                    Toggle("Share stats with others", isOn: $draft.revealStats)
                    Toggle("Automatically skip this character's turn", isOn: $draft.autoSkipTurn)
                }

                Section("Stats") {
                    ForEach($draft.stats) { $stat in
                        LabeledContent(stat.key) {
                            VStack(alignment: .trailing, spacing: 8) {
                                TextField("Current", text: $stat.current)
                                    .keyboardType(.numberPad)
                                    .multilineTextAlignment(.trailing)
                                if stat.key != "TempHP" {
                                    TextField("Max", text: $stat.max)
                                        .keyboardType(.numberPad)
                                        .multilineTextAlignment(.trailing)
                                }
                            }
                            .frame(maxWidth: 120)
                        }
                    }
                }

                if let conditions = ruleSet?.conditions, !conditions.isEmpty {
                    Section("Conditions") {
                        Button(action: onManageConditions) {
                            HStack {
                                Text(draft.selectedConditions.isEmpty ? "Conditions" : Array(draft.selectedConditions).sorted().joined(separator: ", "))
                                    .foregroundStyle(draft.selectedConditions.isEmpty ? .secondary : .primary)
                                    .multilineTextAlignment(.leading)
                                Spacer()
                                Text("Manage")
                                    .foregroundStyle(Color.accentColor)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }

                if onDelete != nil {
                    Section {
                        Button("Delete Character", role: .destructive) {
                            showingDeleteConfirmation = true
                        }
                    }
                }
            }
            .navigationTitle(draft.id == nil ? "New Character" : "Edit Character")
            .alert("Delete Character?", isPresented: $showingDeleteConfirmation) {
                Button("Cancel", role: .cancel) {}
                Button("Delete", role: .destructive) {
                    onDelete?()
                    dismiss()
                }
            } message: {
                Text("This will remove \(draft.name.isEmpty ? "this character" : draft.name) from the tracker.")
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        onSave()
                        dismiss()
                    }
                }
            }
        }
    }
}
