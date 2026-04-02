import SwiftUI

struct ConditionsEditorView: View {
    @Binding var draft: CharacterDraft
    let ruleSet: RuleSetLibraryDTO?
    let serverURLString: String
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

    private func conditionURL(for condition: ConditionDefinitionDTO) -> URL? {
        guard let description = condition.description?.trimmingCharacters(in: .whitespacesAndNewlines),
              let url = URL(string: description),
              let scheme = url.scheme?.lowercased(),
              scheme == "http" || scheme == "https" else {
            return nil
        }
        return url
    }

    private func conditionDefinition(named name: String) -> ConditionDefinitionDTO? {
        ruleSet?.conditions.first(where: { $0.name == name })
    }

    private var serverBaseURL: URL? {
        let trimmed = serverURLString.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        let normalized = trimmed.hasPrefix("http://") || trimmed.hasPrefix("https://")
            ? trimmed
            : "http://\(trimmed)"
        return URL(string: normalized)
    }

    private var rulesetIconURL: URL? {
        guard let icon = ruleSet?.icon?.trimmingCharacters(in: .whitespacesAndNewlines),
              !icon.isEmpty else {
            return nil
        }

        if icon.hasPrefix("http://") || icon.hasPrefix("https://") {
            return URL(string: icon)
        }

        guard let baseURL = serverBaseURL else { return nil }
        let path = icon.hasPrefix("/") ? icon : "/rulesets/\(icon)"
        return URL(string: path, relativeTo: baseURL)?.absoluteURL
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
                            HStack(alignment: .top, spacing: 12) {
                                Button {
                                    toggle(condition.name)
                                } label: {
                                    HStack(alignment: .top, spacing: 12) {
                                        Image(systemName: draft.selectedConditions.contains(condition.name) ? "checkmark.circle.fill" : "circle")
                                            .foregroundStyle(draft.selectedConditions.contains(condition.name) ? Color.accentColor : Color.secondary)
                                        VStack(alignment: .leading, spacing: 4) {
                                            Text(condition.name)
                                                .foregroundStyle(.primary)
                                            if conditionURL(for: condition) == nil,
                                               let description = condition.description,
                                               !description.isEmpty {
                                                Text(description)
                                                    .font(.footnote)
                                                    .foregroundStyle(.secondary)
                                            }
                                        }
                                    }
                                }
                                .buttonStyle(.plain)

                                Spacer()

                                if let url = conditionURL(for: condition) {
                                    Link(destination: url) {
                                        if let iconURL = rulesetIconURL {
                                            AsyncImage(url: iconURL) { phase in
                                                switch phase {
                                                case .success(let image):
                                                    image
                                                        .resizable()
                                                        .scaledToFit()
                                                default:
                                                    Image(systemName: "link.circle.fill")
                                                        .resizable()
                                                        .scaledToFit()
                                                        .foregroundStyle(.tint)
                                                }
                                            }
                                            .frame(width: 28, height: 28)
                                            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                                        } else {
                                            Image(systemName: "link.circle.fill")
                                                .resizable()
                                                .scaledToFit()
                                                .frame(width: 28, height: 28)
                                                .foregroundStyle(.tint)
                                        }
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                    }
                } header: {
                    Text(draft.name.isEmpty ? "Conditions" : draft.name)
                }

                if !draft.selectedConditions.isEmpty {
                    Section("Selected") {
                        ForEach(Array(draft.selectedConditions).sorted(), id: \.self) { condition in
                            HStack {
                                VStack(alignment: .leading, spacing: 4) {
                                    if let definition = conditionDefinition(named: condition),
                                       let url = conditionURL(for: definition) {
                                        Link(condition, destination: url)
                                            .foregroundStyle(.tint)
                                        Text(url.absoluteString)
                                            .font(.footnote)
                                            .foregroundStyle(.secondary)
                                            .textSelection(.enabled)
                                    } else {
                                        Text(condition)
                                    }
                                }
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
