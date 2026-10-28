import codecs
import os
import zipfile

from django.conf import settings
from django.core.exceptions import ValidationError


ALLOWED_EXTENSIONS = {
    ".pdf",
    ".doc",
    ".docx",
    ".ppt",
    ".pptx",
    ".txt",
    ".zip",
    ".jpg",
    ".jpeg",
    ".png",
    ".mp4",
}


def _extension(uploaded_file):
    filename = str(uploaded_file.name).replace("\\", "/").rsplit("/", 1)[-1]
    return os.path.splitext(filename)[1].lower()


def _valid_text_file(uploaded_file):
    decoder = codecs.getincrementaldecoder("utf-8")()
    uploaded_file.seek(0)
    try:
        for chunk in uploaded_file.chunks():
            if b"\0" in chunk:
                return False
            decoder.decode(chunk)
        decoder.decode(b"", final=True)
        return True
    except UnicodeDecodeError:
        return False
    finally:
        uploaded_file.seek(0)


def validate_study_material_file(uploaded_file):
    max_size = settings.STUDY_MATERIAL_MAX_SIZE
    if uploaded_file.size > max_size:
        raise ValidationError(
            f"File exceeds the 50 MB maximum ({max_size:,} bytes)."
        )

    extension = _extension(uploaded_file)
    if extension not in ALLOWED_EXTENSIONS:
        raise ValidationError(
            "Unsupported file type. Upload PDF, DOC, DOCX, PPT, PPTX, TXT, ZIP, "
            "JPG, JPEG, PNG, or MP4 files."
        )

    uploaded_file.seek(0)
    header = uploaded_file.read(16)
    uploaded_file.seek(0)

    if extension in (".docx", ".pptx"):
        try:
            with zipfile.ZipFile(uploaded_file) as archive:
                required_file = (
                    "word/document.xml" if extension == ".docx"
                    else "ppt/presentation.xml"
                )
                archive.getinfo("[Content_Types].xml")
                archive.getinfo(required_file)
                is_valid = True
        except KeyError:
            is_valid = False
        except (OSError, zipfile.BadZipFile):
            is_valid = False
        finally:
            uploaded_file.seek(0)
    else:
        is_valid = False
        if extension == ".pdf":
            is_valid = header.startswith(b"%PDF-")
        elif extension in (".doc", ".ppt"):
            is_valid = header.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1")
        elif extension in (".jpg", ".jpeg"):
            is_valid = header.startswith(b"\xff\xd8\xff")
        elif extension == ".png":
            is_valid = header.startswith(b"\x89PNG\r\n\x1a\n")
        elif extension == ".mp4":
            is_valid = len(header) >= 12 and header[4:8] == b"ftyp"
        elif extension == ".txt":
            is_valid = _valid_text_file(uploaded_file)
        elif extension == ".zip":
            is_valid = zipfile.is_zipfile(uploaded_file)
            uploaded_file.seek(0)

    if not is_valid:
        raise ValidationError(
            "The file content does not match its permitted file type."
        )
