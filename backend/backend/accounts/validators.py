import warnings

from django.core.exceptions import ValidationError
from PIL import Image, UnidentifiedImageError


PROFILE_PHOTO_MAX_SIZE = 5 * 1024 * 1024
PROFILE_PHOTO_FORMATS = {"JPEG", "PNG", "WEBP"}
PROFILE_PHOTO_EXTENSIONS = {"JPEG": "jpg", "PNG": "png", "WEBP": "webp"}


def validate_profile_photo(upload):
    if upload.size > PROFILE_PHOTO_MAX_SIZE:
        raise ValidationError("Profile photos must be 5 MB or smaller.")

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            image = Image.open(upload)
            if image.format not in PROFILE_PHOTO_FORMATS:
                raise ValidationError("Choose a JPG, PNG, or WebP image.")
            upload.name = f"profile-photo.{PROFILE_PHOTO_EXTENSIONS[image.format]}"
            image.verify()
    except (
        UnidentifiedImageError,
        OSError,
        ValueError,
        SyntaxError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
    ) as error:
        raise ValidationError("The uploaded file is not a valid image.") from error
    finally:
        upload.seek(0)
