import AVFoundation
import CoreImage.CIFilterBuiltins
import SwiftUI

struct ConnectionSheetView: View {
    @Binding var serverURLString: String
    let statusMessage: String
    let errorMessage: String?
    let onConnect: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var showingQRScanner = false
    @State private var scannerError: String?

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
                    Button("Scan QR Code") {
                        showingQRScanner = true
                    }
                }

                Section {
                    if let scannerError {
                        Text(scannerError)
                            .foregroundStyle(.red)
                            .font(.footnote)
                    } else if let errorMessage {
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
            .sheet(isPresented: $showingQRScanner) {
                QRScannerSheetView(
                    onCodeScanned: { scannedValue in
                        let trimmedValue = scannedValue.trimmingCharacters(in: .whitespacesAndNewlines)
                        if let normalizedURL = normalizeServerURL(from: trimmedValue) {
                            serverURLString = normalizedURL
                            scannerError = nil
                            showingQRScanner = false
                        } else {
                            scannerError = "The QR code did not contain a valid server URL."
                        }
                    },
                    onError: { message in
                        scannerError = message
                        showingQRScanner = false
                    }
                )
            }
        }
        .interactiveDismissDisabled(serverURLString.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    }

    private func normalizeServerURL(from scannedValue: String) -> String? {
        guard !scannedValue.isEmpty else { return nil }
        guard var components = URLComponents(string: scannedValue),
              let scheme = components.scheme,
              let host = components.host
        else {
            return nil
        }

        components.path = ""
        components.query = nil
        components.fragment = nil

        var serverComponents = URLComponents()
        serverComponents.scheme = scheme
        serverComponents.host = host
        serverComponents.port = components.port
        return serverComponents.string
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

    @Environment(\.dismiss) private var dismiss
    @State private var showingServerQRCode = false

    var body: some View {
        NavigationStack {
            List {
                Section("Server") {
                    Text(serverURL.isEmpty ? "Not set" : serverURL)
                        .foregroundStyle(serverURL.isEmpty ? .secondary : .primary)
                    Button("Change Connection", action: onChangeConnection)
                    Button("Show QR Code") {
                        showingServerQRCode = true
                    }
                    .disabled(serverURL.isEmpty)
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
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") {
                        dismiss()
                    }
                }
            }
            .sheet(isPresented: $showingServerQRCode) {
                ServerQRCodeSheetView(serverURL: serverURL)
            }
        }
    }
}

struct ServerQRCodeSheetView: View {
    let serverURL: String

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                if let image = qrCodeImage(for: serverURL) {
                    Image(uiImage: image)
                        .interpolation(.none)
                        .resizable()
                        .scaledToFit()
                        .frame(maxWidth: 320, maxHeight: 320)
                        .padding(16)
                        .background(.white, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                } else {
                    ContentUnavailableView(
                        "Unable to Generate QR Code",
                        systemImage: "qrcode",
                        description: Text("The current server URL is not valid.")
                    )
                }

                Text(serverURL)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .textSelection(.enabled)
                    .padding(.horizontal)

                Spacer()
            }
            .padding()
            .navigationTitle("Server QR Code")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") {
                        dismiss()
                    }
                }
            }
        }
    }

    private func qrCodeImage(for text: String) -> UIImage? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }

        let context = CIContext()
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(trimmed.utf8)
        filter.correctionLevel = "M"

        guard let outputImage = filter.outputImage else { return nil }
        let scaledImage = outputImage.transformed(by: CGAffineTransform(scaleX: 12, y: 12))
        guard let cgImage = context.createCGImage(scaledImage, from: scaledImage.extent) else { return nil }
        return UIImage(cgImage: cgImage)
    }
}

struct QRScannerSheetView: View {
    let onCodeScanned: (String) -> Void
    let onError: (String) -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ZStack {
                QRScannerView(
                    onCodeScanned: { code in
                        onCodeScanned(code)
                    },
                    onError: { message in
                        onError(message)
                    }
                )
                .ignoresSafeArea()

                VStack {
                    Spacer()
                    Text("Scan the QR code shown on the display page. Pinch to zoom.")
                        .font(.footnote)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .background(.ultraThinMaterial, in: Capsule())
                        .padding(.bottom, 24)
                }
            }
            .background(Color.black)
            .navigationTitle("Scan Server QR")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") {
                        dismiss()
                    }
                }
            }
        }
    }
}

struct QRScannerView: UIViewControllerRepresentable {
    let onCodeScanned: (String) -> Void
    let onError: (String) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onCodeScanned: onCodeScanned, onError: onError)
    }

    func makeUIViewController(context: Context) -> ScannerViewController {
        let controller = ScannerViewController()
        controller.delegate = context.coordinator
        return controller
    }

    func updateUIViewController(_ uiViewController: ScannerViewController, context: Context) {}

    final class Coordinator: NSObject, ScannerViewControllerDelegate {
        private var hasScannedCode = false
        let onCodeScanned: (String) -> Void
        let onError: (String) -> Void

        init(
            onCodeScanned: @escaping (String) -> Void,
            onError: @escaping (String) -> Void
        ) {
            self.onCodeScanned = onCodeScanned
            self.onError = onError
        }

        func scannerViewController(_ controller: ScannerViewController, didScan code: String) {
            guard !hasScannedCode else { return }
            hasScannedCode = true
            onCodeScanned(code)
        }

        func scannerViewController(_ controller: ScannerViewController, didFail message: String) {
            onError(message)
        }
    }
}

protocol ScannerViewControllerDelegate: AnyObject {
    func scannerViewController(_ controller: ScannerViewController, didScan code: String)
    func scannerViewController(_ controller: ScannerViewController, didFail message: String)
}

final class ScannerViewController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    weak var delegate: ScannerViewControllerDelegate?

    private let captureSession = AVCaptureSession()
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private let preferredZoomFactor: CGFloat = 2.0
    private var currentZoomFactor: CGFloat = 2.0

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        configureCaptureSession()
        let pinchRecognizer = UIPinchGestureRecognizer(target: self, action: #selector(handlePinch(_:)))
        view.addGestureRecognizer(pinchRecognizer)
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer?.frame = view.bounds
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        if !captureSession.isRunning {
            captureSession.startRunning()
        }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        if captureSession.isRunning {
            captureSession.stopRunning()
        }
    }

    private func configureCaptureSession() {
        guard let videoCaptureDevice = AVCaptureDevice.default(for: .video) else {
            delegate?.scannerViewController(self, didFail: "This device does not have a camera available.")
            return
        }

        configureZoom(for: videoCaptureDevice)

        do {
            let videoInput = try AVCaptureDeviceInput(device: videoCaptureDevice)
            if captureSession.canAddInput(videoInput) {
                captureSession.addInput(videoInput)
            } else {
                delegate?.scannerViewController(self, didFail: "Unable to read from the camera.")
                return
            }
        } catch {
            delegate?.scannerViewController(self, didFail: "Unable to access the camera.")
            return
        }

        let metadataOutput = AVCaptureMetadataOutput()
        if captureSession.canAddOutput(metadataOutput) {
            captureSession.addOutput(metadataOutput)
            metadataOutput.setMetadataObjectsDelegate(self, queue: .main)
            metadataOutput.metadataObjectTypes = [.qr]
        } else {
            delegate?.scannerViewController(self, didFail: "Unable to scan QR codes on this device.")
            return
        }

        let previewLayer = AVCaptureVideoPreviewLayer(session: captureSession)
        previewLayer.videoGravity = .resizeAspectFill
        previewLayer.frame = view.layer.bounds
        view.layer.addSublayer(previewLayer)
        self.previewLayer = previewLayer
    }

    private func configureZoom(for device: AVCaptureDevice) {
        do {
            try device.lockForConfiguration()
            let maxZoom = min(device.activeFormat.videoMaxZoomFactor, 4.0)
            currentZoomFactor = min(preferredZoomFactor, maxZoom)
            device.videoZoomFactor = currentZoomFactor
            device.unlockForConfiguration()
        } catch {
            // If zoom configuration fails, keep the default camera behavior.
        }
    }

    @objc
    private func handlePinch(_ gesture: UIPinchGestureRecognizer) {
        guard let device = AVCaptureDevice.default(for: .video) else { return }

        switch gesture.state {
        case .began, .changed:
            let maxZoom = min(device.activeFormat.videoMaxZoomFactor, 8.0)
            let minZoom: CGFloat = 1.0
            let targetZoom = min(max(currentZoomFactor * gesture.scale, minZoom), maxZoom)
            do {
                try device.lockForConfiguration()
                device.videoZoomFactor = targetZoom
                device.unlockForConfiguration()
                gesture.scale = 1.0
                currentZoomFactor = targetZoom
            } catch {
                return
            }
        default:
            break
        }
    }

    func metadataOutput(
        _ output: AVCaptureMetadataOutput,
        didOutput metadataObjects: [AVMetadataObject],
        from connection: AVCaptureConnection
    ) {
        guard let metadataObject = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
              metadataObject.type == .qr,
              let stringValue = metadataObject.stringValue
        else {
            return
        }

        if captureSession.isRunning {
            captureSession.stopRunning()
        }
        delegate?.scannerViewController(self, didScan: stringValue)
    }
}
