import SwiftUI
import UIKit
import UniformTypeIdentifiers
import PhotosUI

extension Notification.Name {
    static let passVaultRequestBackupImport = Notification.Name("PassVaultRequestBackupImport")
    static let passVaultBackupImportReady = Notification.Name("PassVaultBackupImportReady")
}

@MainActor
final class FileImportCoordinator: NSObject, ObservableObject, UIDocumentPickerDelegate, UIAdaptivePresentationControllerDelegate, PHPickerViewControllerDelegate, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
    enum Request { case attachment, backup }
    enum MediaRequest { case photoLibrary, camera }
    private enum State { case idle, requested(UUID, Request), presented(UUID, Request), reading(UUID, Request) }

    private weak var host: UIViewController?
    private var picker: UIDocumentPickerViewController?
    private var state: State = .idle
    private let model: AppModel
    private let languageStore: AppLanguageStore
    var onAttachmentDraft: ((AttachmentImportDraft) -> Void)?

    init(model: AppModel, languageStore: AppLanguageStore) {
        self.model = model
        self.languageStore = languageStore
    }

    func attach(host: UIViewController) {
        self.host = host
        presentIfPossible()
    }

    func request(_ request: Request) {
        guard case .idle = state, model.state == .unlocked else {
            model.errorMessage = L10n.text(.unableReadBackup, language: languageStore.language)
            return
        }
        state = .requested(UUID(), request)
        presentIfPossible()
    }

    func requestMedia(_ request: MediaRequest) {
        guard case .idle = state, model.state == .unlocked, let host, host.presentedViewController == nil else { return }
        switch request {
        case .photoLibrary:
            var configuration = PHPickerConfiguration(photoLibrary: .shared())
            configuration.selectionLimit = 1
            configuration.filter = .any(of: [.images, .videos])
            let controller = PHPickerViewController(configuration: configuration)
            controller.delegate = self
            host.present(controller, animated: true)
        case .camera:
            guard UIImagePickerController.isSourceTypeAvailable(.camera) else {
                model.errorMessage = languageStore.language == .simplifiedChinese ? "此设备无法使用相机。" : "Camera is unavailable on this device."
                return
            }
            let controller = UIImagePickerController()
            controller.sourceType = .camera
            controller.mediaTypes = [UTType.image.identifier, UTType.movie.identifier]
            controller.delegate = self
            host.present(controller, animated: true)
        }
    }

    func cancelForLock() {
        state = .idle
        picker?.dismiss(animated: false)
        picker = nil
    }

    private func presentIfPossible() {
        guard case .requested(let id, let request) = state,
              let host, host.viewIfLoaded?.window != nil,
              host.presentedViewController == nil else { return }
        let types = request == .attachment ? [UTType.item] : BackupDocument.importableContentTypes
        let controller = UIDocumentPickerViewController(forOpeningContentTypes: types, asCopy: true)
        controller.allowsMultipleSelection = false
        controller.delegate = self
        controller.presentationController?.delegate = self
        picker = controller
        state = .presented(id, request)
        host.present(controller, animated: true) { [weak self, weak controller] in
            guard let self else { return }
            controller?.presentationController?.delegate = self
        }
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard controller === picker,
              case .presented(let id, let request) = state,
              let url = urls.first else {
            controller.dismiss(animated: true)
            return
        }
        state = .reading(id, request)
        let name = url.lastPathComponent
        let language = languageStore.language
        controller.dismiss(animated: true)
        picker = nil
        readSelectedDocument(id: id, request: request, url: url, name: name, language: language)
    }

    private func readSelectedDocument(id: UUID, request: Request, url: URL, name: String, language: AppLanguage) {
        Task {
            do {
                switch request {
                case .attachment:
                    let data = try await Task.detached(priority: .userInitiated) {
                        try AttachmentImportReader.readOwnedData(from: url)
                    }.value
                    guard isCurrent(id), model.state == .unlocked else { finish(); return }
                    onAttachmentDraft?(AttachmentImportDraft(name: name, data: data))
                case .backup:
                    let data = try await Task.detached(priority: .userInitiated) {
                        try AttachmentImportReader.readOwnedData(from: url)
                    }.value
                    guard isCurrent(id), model.state == .unlocked else { finish(); return }
                    NotificationCenter.default.post(name: .passVaultBackupImportReady, object: data)
                }
                finish()
            } catch let error as AttachmentImportError {
                guard isCurrent(id) else { return }
                model.errorMessage = error.localizedMessage(language: language)
                finish()
            } catch {
                guard isCurrent(id) else { return }
                model.errorMessage = request == .backup ? L10n.text(.unableReadBackup, language: language) : L10n.text(.unableImportAttachment, language: language)
                finish()
            }
        }
    }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        guard controller === picker else { return }
        finish()
    }
    func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        if case .presented = state { finish() }
    }

    private func isCurrent(_ id: UUID) -> Bool {
        if case .reading(let current, _) = state { return current == id }
        return false
    }

    private func finish() { state = .idle; picker = nil }

    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        guard let provider = results.first?.itemProvider else { return }
        let type = provider.hasItemConformingToTypeIdentifier(UTType.image.identifier) ? UTType.image : UTType.movie
        provider.loadDataRepresentation(forTypeIdentifier: type.identifier) { [weak self] data, _ in
            guard let data else { return }
            let ext = type == .image ? "jpg" : "mov"
            Task { @MainActor in self?.onAttachmentDraft?(AttachmentImportDraft(name: "attachment-\(UUID().uuidString).\(ext)", data: data)) }
        }
    }

    func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
        picker.dismiss(animated: true)
        if let image = info[.originalImage] as? UIImage, let data = image.jpegData(compressionQuality: 0.92) {
            onAttachmentDraft?(AttachmentImportDraft(name: "photo-\(UUID().uuidString).jpg", data: data))
        } else if let url = info[.mediaURL] as? URL, let data = try? Data(contentsOf: url) {
            onAttachmentDraft?(AttachmentImportDraft(name: url.lastPathComponent, data: data))
        }
    }

    func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { picker.dismiss(animated: true) }
}

struct FileImportHost: UIViewControllerRepresentable {
    let coordinator: FileImportCoordinator
    func makeUIViewController(context: Context) -> FileImportHostViewController {
        let controller = FileImportHostViewController()
        controller.onReady = { [weak coordinator] host in coordinator?.attach(host: host) }
        return controller
    }
    func updateUIViewController(_ uiViewController: FileImportHostViewController, context: Context) {
        coordinator.attach(host: uiViewController)
    }
}

final class FileImportHostViewController: UIViewController {
    var onReady: ((UIViewController) -> Void)?
    override func viewDidAppear(_ animated: Bool) { super.viewDidAppear(animated); onReady?(self) }
}
