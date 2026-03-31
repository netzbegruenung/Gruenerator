"""
DoclingService — document conversion for PPTX/PDF/DOCX uploads.

Docling (with PyTorch) is not installed in the Grünerator deployment
to save ~1.5GB of image size. This stub raises a clear error if
document conversion is attempted without docling installed.
"""

try:
    from docling.document_converter import (
        DocumentConverter,
        PdfFormatOption,
        PowerpointFormatOption,
        WordFormatOption,
    )
    from docling.datamodel.pipeline_options import PdfPipelineOptions
    from docling.datamodel.base_models import InputFormat

    DOCLING_AVAILABLE = True
except ImportError:
    DOCLING_AVAILABLE = False


class DoclingService:
    def __init__(self):
        if not DOCLING_AVAILABLE:
            return

        self.pipeline_options = PdfPipelineOptions()
        self.pipeline_options.do_ocr = False

        self.converter = DocumentConverter(
            format_options={
                InputFormat.PDF: PdfFormatOption(
                    pipeline_options=self.pipeline_options
                ),
                InputFormat.DOCX: WordFormatOption(),
                InputFormat.PPTX: PowerpointFormatOption(),
            }
        )

    def convert(self, source):
        if not DOCLING_AVAILABLE:
            raise RuntimeError(
                "Docling ist in dieser Installation nicht verfügbar. "
                "Dokumenten-Upload wird nicht unterstützt."
            )
        return self.converter.convert(source)
