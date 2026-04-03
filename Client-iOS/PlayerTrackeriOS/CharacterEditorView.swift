import SwiftUI
import UIKit

struct CharacterEditorView: View {
    private enum FocusedField: Hashable {
        case name
        case initiativeBonus
        case statCurrent(String)
        case statMax(String)
    }

    @Binding var draft: CharacterDraft
    let ruleSet: RuleSetLibraryDTO?
    let onManageConditions: () -> Void
    let onSave: () -> Void
    let onDelete: (() -> Void)?

    @Environment(\.dismiss) private var dismiss
    @State private var showingDeleteConfirmation = false
    @State private var focusedField: FocusedField?

    var body: some View {
        NavigationStack {
            Form {
                Section(draft.id == nil ? "New Character Name" : "Character Name") {
                    AccessoryTextField(
                        placeholder: "Character name",
                        text: $draft.name,
                        keyboardType: .default,
                        autocapitalization: .words,
                        autocorrection: .no,
                        textAlignment: .natural,
                        fieldID: .name,
                        focusedField: $focusedField,
                        previousField: previousField(for: .name),
                        nextField: nextField(for: .name)
                    )
                }

                Section("Initiative") {
                    Toggle("Use app to roll initiative", isOn: $draft.useAppInitiativeRoll)
                    if draft.useAppInitiativeRoll {
                        LabeledContent("Initiative Bonus") {
                            AccessoryTextField(
                                placeholder: "Bonus",
                                text: $draft.initiativeBonus,
                                keyboardType: .numberPad,
                                autocapitalization: .none,
                                autocorrection: .no,
                                textAlignment: .right,
                                fieldID: .initiativeBonus,
                                focusedField: $focusedField,
                                previousField: previousField(for: .initiativeBonus),
                                nextField: nextField(for: .initiativeBonus)
                            )
                            .frame(maxWidth: 120)
                        }
                    }
                    Toggle("Automatically skip this character's turn", isOn: $draft.autoSkipTurn)
                }

                Section("Stats") {
                    Toggle("Share stats with others", isOn: $draft.revealStats)

                    ForEach($draft.stats) { $stat in
                        LabeledContent(stat.key) {
                            VStack(alignment: .trailing, spacing: 8) {
                                AccessoryTextField(
                                    placeholder: "Current",
                                    text: $stat.current,
                                    keyboardType: .numberPad,
                                    autocapitalization: .none,
                                    autocorrection: .no,
                                    textAlignment: .right,
                                    fieldID: .statCurrent(stat.key),
                                    focusedField: $focusedField,
                                    previousField: previousField(for: .statCurrent(stat.key)),
                                    nextField: nextField(for: .statCurrent(stat.key))
                                )
                                if stat.key != "TempHP" {
                                    AccessoryTextField(
                                        placeholder: "Max",
                                        text: $stat.max,
                                        keyboardType: .numberPad,
                                        autocapitalization: .none,
                                        autocorrection: .no,
                                        textAlignment: .right,
                                        fieldID: .statMax(stat.key),
                                        focusedField: $focusedField,
                                        previousField: previousField(for: .statMax(stat.key)),
                                        nextField: nextField(for: .statMax(stat.key))
                                    )
                                }
                            }
                            .frame(maxWidth: 120)
                        }
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
            .navigationTitle(draft.id == nil ? "" : "Edit Character")
            .navigationBarTitleDisplayMode(.inline)
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

    private var focusOrder: [FocusedField] {
        var fields: [FocusedField] = [.name]
        if draft.useAppInitiativeRoll {
            fields.append(.initiativeBonus)
        }
        for stat in draft.stats {
            fields.append(.statCurrent(stat.key))
            if stat.key != "TempHP" {
                fields.append(.statMax(stat.key))
            }
        }
        return fields
    }

    private func previousField(for field: FocusedField) -> FocusedField? {
        guard let index = focusOrder.firstIndex(of: field),
              index > 0 else {
            return nil
        }
        return focusOrder[index - 1]
    }

    private func nextField(for field: FocusedField) -> FocusedField? {
        guard let index = focusOrder.firstIndex(of: field),
              index + 1 < focusOrder.count else {
            return nil
        }
        return focusOrder[index + 1]
    }
}

private struct AccessoryTextField<FieldID: Hashable>: UIViewRepresentable {
    let placeholder: String
    @Binding var text: String
    let keyboardType: UIKeyboardType
    let autocapitalization: UITextAutocapitalizationType
    let autocorrection: UITextAutocorrectionType
    let textAlignment: NSTextAlignment
    let fieldID: FieldID
    @Binding var focusedField: FieldID?
    let previousField: FieldID?
    let nextField: FieldID?

    func makeCoordinator() -> Coordinator {
        Coordinator(parent: self)
    }

    func makeUIView(context: Context) -> UITextField {
        let textField = UITextField(frame: .zero)
        textField.delegate = context.coordinator
        textField.borderStyle = .none
        textField.addTarget(context.coordinator, action: #selector(Coordinator.textDidChange(_:)), for: .editingChanged)
        return textField
    }

    func updateUIView(_ uiView: UITextField, context: Context) {
        context.coordinator.parent = self
        if uiView.text != text {
            uiView.text = text
        }
        uiView.placeholder = placeholder
        uiView.keyboardType = keyboardType
        uiView.autocapitalizationType = autocapitalization
        uiView.autocorrectionType = autocorrection
        uiView.textAlignment = textAlignment
        uiView.returnKeyType = nextField == nil ? .done : .next
        uiView.inputAccessoryView = context.coordinator.makeAccessoryToolbar()
        if focusedField == fieldID {
            if !uiView.isFirstResponder {
                uiView.becomeFirstResponder()
            }
        } else if uiView.isFirstResponder {
            uiView.resignFirstResponder()
        }
    }

    final class Coordinator: NSObject, UITextFieldDelegate {
        var parent: AccessoryTextField

        init(parent: AccessoryTextField) {
            self.parent = parent
        }

        @objc func textDidChange(_ sender: UITextField) {
            parent.text = sender.text ?? ""
        }

        @objc func movePrevious() {
            parent.focusedField = parent.previousField
        }

        @objc func moveNext() {
            if let nextField = parent.nextField {
                parent.focusedField = nextField
            } else {
                parent.focusedField = nil
            }
        }

        @objc func finishEditing() {
            parent.focusedField = nil
        }

        func textFieldDidBeginEditing(_ textField: UITextField) {
            parent.focusedField = parent.fieldID
        }

        func textFieldShouldReturn(_ textField: UITextField) -> Bool {
            moveNext()
            return false
        }

        func makeAccessoryToolbar() -> UIToolbar {
            let toolbar = UIToolbar()
            toolbar.sizeToFit()
            let previousImage = UIImage(systemName: "chevron.up")
            let nextImage = UIImage(systemName: "chevron.down")
            let doneImage = UIImage(systemName: "checkmark")

            let previousItem = UIBarButtonItem(image: previousImage, style: .plain, target: self, action: #selector(movePrevious))
            previousItem.isEnabled = parent.previousField != nil

            let nextItem = UIBarButtonItem(image: nextImage, style: .plain, target: self, action: #selector(moveNext))
            nextItem.isEnabled = parent.nextField != nil

            let flexibleSpace = UIBarButtonItem(systemItem: .flexibleSpace)
            let doneItem = UIBarButtonItem(image: doneImage, style: .done, target: self, action: #selector(finishEditing))

            toolbar.items = [previousItem, nextItem, flexibleSpace, doneItem]
            return toolbar
        }
    }
}
