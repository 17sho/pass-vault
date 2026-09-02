import SwiftUI
import UIKit
import PDFKit
import ImageIO

struct AttachmentPreviewView: View {
    @EnvironmentObject private var languageStore: AppLanguageStore
    let name: String
    let data: Data
    let kind: AttachmentPreviewKind
    @State private var imageData: Data?
    @State private var imageFailure = false

    var body: some View {
        Group {
            switch kind {
            case .text:
                ScrollView {
                    Text(String(data: data, encoding: .utf8) ?? "")
                        .font(.system(.body, design: .monospaced))
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(16)
                }
            case .image:
                imagePreview
            case .pdf:
                PDFPreview(data: data)
            }
        }
        .background(PVTheme.background)
        .accessibilityIdentifier("attachment-preview-screen")
        .task(id: kind) {
            guard kind == .image, imageData == nil, !imageFailure else { return }
            imageData = await Task.detached(priority: .userInitiated) {
                AttachmentImageDecoder.downsampledData(data, maxPixelSize: 2_048)
            }.value
            imageFailure = imageData == nil
        }
    }

    @ViewBuilder
    private var imagePreview: some View {
        if let imageData, let image = UIImage(data: imageData) {
            ZoomableImageView(image: image)
                .background(PVTheme.background)
        } else if imageFailure {
            ContentUnavailableView(
                languageStore.language == .simplifiedChinese ? "无法预览图片" : "Unable to preview image",
                systemImage: "photo.badge.exclamationmark",
                description: Text(languageStore.language == .simplifiedChinese ? "图片数据无效或格式不受支持。" : "The image data is invalid or unsupported.")
            )
        } else {
            VStack(spacing: 12) {
                ProgressView()
                Text(languageStore.language == .simplifiedChinese ? "正在准备预览…" : "Preparing preview…")
                    .foregroundStyle(PVTheme.muted)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .accessibilityIdentifier("attachment-preview-loading")
        }
    }
}

private struct ZoomableImageView: UIViewRepresentable {
    let image: UIImage

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> UIScrollView {
        let scroll = PreviewScrollView()
        scroll.onLayout = { [weak coordinator = context.coordinator, weak scroll] in
            guard let coordinator, let scroll else { return }
            coordinator.layout(in: scroll, image: image)
        }
        scroll.delegate = context.coordinator
        scroll.minimumZoomScale = 1
        scroll.maximumZoomScale = 5
        scroll.bouncesZoom = true
        scroll.alwaysBounceHorizontal = false
        scroll.alwaysBounceVertical = false
        scroll.showsHorizontalScrollIndicator = false
        scroll.showsVerticalScrollIndicator = false
        scroll.backgroundColor = .clear

        let imageView = UIImageView(image: image)
        imageView.contentMode = .scaleAspectFit
        imageView.isUserInteractionEnabled = true
        scroll.addSubview(imageView)
        context.coordinator.imageView = imageView

        let doubleTap = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.doubleTapped(_:)))
        doubleTap.numberOfTapsRequired = 2
        scroll.addGestureRecognizer(doubleTap)
        context.coordinator.scrollView = scroll
        return scroll
    }

    func updateUIView(_ scroll: UIScrollView, context: Context) {
        context.coordinator.imageView?.image = image
        context.coordinator.layout(in: scroll, image: image)
    }

    final class Coordinator: NSObject, UIScrollViewDelegate {
        weak var scrollView: UIScrollView?
        weak var imageView: UIImageView?
        private var lastBounds: CGSize = .zero

        func viewForZooming(in scrollView: UIScrollView) -> UIView? { imageView }

        func scrollViewDidZoom(_ scrollView: UIScrollView) { center(in: scrollView) }

        func layout(in scroll: UIScrollView, image: UIImage) {
            guard scroll.bounds.size.width > 0, scroll.bounds.size.height > 0, lastBounds != scroll.bounds.size else { return }
            lastBounds = scroll.bounds.size
            let available = CGSize(width: max(1, scroll.bounds.width - 32), height: max(1, scroll.bounds.height - 32))
            let imageSize = image.size
            let fit = min(1, available.width / max(1, imageSize.width), available.height / max(1, imageSize.height))
            let fitted = CGSize(width: imageSize.width * fit, height: imageSize.height * fit)
            imageView?.frame = CGRect(origin: .zero, size: fitted)
            scroll.contentSize = fitted
            scroll.minimumZoomScale = 1
            scroll.zoomScale = 1
            center(in: scroll)
        }

        private func center(in scroll: UIScrollView) {
            guard let imageView else { return }
            let horizontal = max(0, (scroll.bounds.width - scroll.adjustedContentInset.left - scroll.adjustedContentInset.right - imageView.frame.width) / 2)
            let vertical = max(0, (scroll.bounds.height - scroll.adjustedContentInset.top - scroll.adjustedContentInset.bottom - imageView.frame.height) / 2)
            imageView.center = CGPoint(x: scroll.contentSize.width / 2 + horizontal, y: scroll.contentSize.height / 2 + vertical)
        }

        @objc func doubleTapped(_ gesture: UITapGestureRecognizer) {
            guard let scroll = scrollView else { return }
            if scroll.zoomScale > scroll.minimumZoomScale + 0.01 {
                scroll.setZoomScale(scroll.minimumZoomScale, animated: true)
            } else {
                let point = gesture.location(in: imageView)
                let target: CGFloat = min(2.5, scroll.maximumZoomScale)
                let size = CGSize(width: scroll.bounds.width / target, height: scroll.bounds.height / target)
                scroll.zoom(to: CGRect(x: point.x - size.width / 2, y: point.y - size.height / 2, width: size.width, height: size.height), animated: true)
            }
        }
    }
}

private final class PreviewScrollView: UIScrollView {
    var onLayout: (() -> Void)?
    override func layoutSubviews() {
        super.layoutSubviews()
        onLayout?()
    }
}

enum AttachmentImageDecoder {
    nonisolated static func downsampledData(_ data: Data, maxPixelSize: Int) -> Data? {
        guard maxPixelSize > 0,
              let source = CGImageSourceCreateWithData(data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixelSize,
            kCGImageSourceShouldCacheImmediately: true
        ]
        guard let thumbnail = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
        return UIImage(cgImage: thumbnail).pngData()
    }
}

private struct PDFPreview: UIViewRepresentable {
    let data: Data
    func makeUIView(context: Context) -> PDFView {
        let view = PDFView()
        view.autoScales = true
        view.displayMode = .singlePageContinuous
        view.document = PDFDocument(data: data)
        return view
    }
    func updateUIView(_ uiView: PDFView, context: Context) {}
}
