import SwiftUI

struct HealthEditorView: View {
    @Binding var draft: CharacterDraft
    let ruleSet: RuleSetLibraryDTO?
    let onChange: () -> Void

    @State private var showsTempHp = false

    private var allowsNegativeHealth: Bool {
        ruleSet?.allowNegativeHealth ?? false
    }

    private var visibleStats: [EditableStat] {
        draft.stats.filter { stat in
            stat.key != "TempHP" || showsTempHp
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(draft.name.isEmpty ? "Health" : draft.name)
                .font(.headline.weight(.semibold))

            VStack(alignment: .leading, spacing: 12) {
                ForEach(visibleStats) { stat in
                    HStack(spacing: 12) {
                        Text(stat.key)
                            .font(.subheadline.weight(.semibold))
                        Spacer(minLength: 8)
                        statAdjustButton(systemName: "minus", statKey: stat.key, delta: -1)
                        Text(statValueText(for: stat))
                            .font(.headline.monospacedDigit())
                            .frame(minWidth: 76, alignment: .trailing)
                        statAdjustButton(systemName: "plus", statKey: stat.key, delta: 1)
                    }
                }
            }

            if ruleSet?.supportsTempHp == true, draft.stats.contains(where: { $0.key == "TempHP" }) {
                Toggle("Display Temp HP", isOn: $showsTempHp)
                    .font(.subheadline.weight(.semibold))
            }
        }
        .padding()
        .onAppear {
            showsTempHp = draft.stats.first(where: { $0.key == "TempHP" })?.current.trimmingCharacters(in: .whitespacesAndNewlines) != "0"
        }
    }

    private func statAdjustButton(systemName: String, statKey: String, delta: Int) -> some View {
        Button {
            draft.adjustStat(named: statKey, delta: delta, allowNegativeHealth: allowsNegativeHealth)
            onChange()
        } label: {
            Image(systemName: systemName)
                .font(.headline.weight(.bold))
                .frame(width: 28, height: 28)
        }
        .buttonStyle(.bordered)
        .controlSize(.small)
    }

    private func statValueText(for stat: EditableStat) -> String {
        if stat.key == "TempHP" {
            return stat.current.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "0" : stat.current
        }
        let current = stat.current.trimmingCharacters(in: .whitespacesAndNewlines)
        let max = stat.max.trimmingCharacters(in: .whitespacesAndNewlines)
        return "\(current.isEmpty ? "0" : current)/\(max.isEmpty ? "0" : max)"
    }
}
