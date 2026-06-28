import SwiftUI

struct InitiativeEditorView: View {
    @Binding var draft: InitiativeDraft
    let ruleSet: RuleSetLibraryDTO?
    let onSet: (Double?) -> Void
    let onRoll: () -> Void

    @FocusState private var initiativeFocused: Bool

    private var standardDie: String? {
        ruleSet?.standardDie
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(draft.characterName.isEmpty ? "🎲 Set Initiative" : "🎲 Set Initiative for \(draft.characterName)")
                .font(.headline.weight(.semibold))

            TextField("Initiative", text: $draft.initiativeInput)
                .textInputAutocapitalization(.never)
                .keyboardType(.decimalPad)
                .textFieldStyle(.roundedBorder)
                .focused($initiativeFocused)

            HStack(spacing: 10) {
                Button("Roll") {
                    onRoll()
                }
                .buttonStyle(.borderedProminent)
                .disabled(standardDie == nil)

                Spacer(minLength: 0)

                Button("Set") {
                    let trimmed = draft.initiativeInput.trimmingCharacters(in: .whitespacesAndNewlines)
                    let initiative = trimmed.isEmpty ? nil : Double(trimmed)
                    onSet(initiative)
                }
                .buttonStyle(.bordered)
            }

            if standardDie == nil {
                Text("No standard die is configured for this ruleset.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
        .onAppear {
            if draft.initiativeInput.isEmpty {
                initiativeFocused = true
            }
        }
    }
}

struct InitiativeDraft: Identifiable, Equatable {
    let id: UUID
    var characterName: String
    var initiativeInput: String

    init(character: PlayerViewDTO) {
        self.id = character.id
        self.characterName = character.name
        self.initiativeInput = character.initiative.map { String($0) } ?? ""
    }
}
