import SwiftUI

struct ConditionsEditorView: View {
    @Binding var draft: CharacterDraft
    let ruleSet: RuleSetLibraryDTO?
    let onSave: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var searchText = ""

    private var filteredConditions: [ConditionDefinitionDTO] {
        let allConditions = ruleSet?.conditions ?? []
        guard !searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return allConditions
        }
        let needle = searchText.trimmingCharacters(in: .whitespacesAndNewlines).localizedLowercase
        return allConditions.filter { condition in
            condition.name.localizedLowercase.contains(needle)
                || (condition.description?.localizedLowercase.contains(needle) ?? false)
        }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    TextField("Search conditions", text: $searchText)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }

                Section {
                    if filteredConditions.isEmpty {
                        Text("No matching conditions.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(filteredConditions) { condition in
                            Button {
                                toggle(condition.name)
                            } label: {
                                HStack(alignment: .top, spacing: 12) {
                                    Image(systemName: draft.selectedConditions.contains(condition.name) ? "checkmark.circle.fill" : "circle")
                                        .foregroundStyle(draft.selectedConditions.contains(condition.name) ? Color.accentColor : Color.secondary)
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(condition.name)
                                            .foregroundStyle(.primary)
                                        if let description = condition.description, !description.isEmpty {
                                            Text(description)
                                                .font(.footnote)
                                                .foregroundStyle(.secondary)
                                        }
                                    }
                                    Spacer()
                                }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                } header: {
                    Text(draft.name.isEmpty ? "Conditions" : draft.name)
                }

                if !draft.selectedConditions.isEmpty {
                    Section("Selected") {
                        ForEach(Array(draft.selectedConditions).sorted(), id: \.self) { condition in
                            HStack {
                                Text(condition)
                                Spacer()
                                Button {
                                    toggle(condition)
                                } label: {
                                    Image(systemName: "xmark.circle.fill")
                                        .foregroundStyle(.secondary)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Conditions")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        onSave()
                        dismiss()
                    }
                }
            }
        }
    }

    private func toggle(_ name: String) {
        if draft.selectedConditions.contains(name) {
            draft.selectedConditions.remove(name)
        } else {
            draft.selectedConditions.insert(name)
        }
    }
}
