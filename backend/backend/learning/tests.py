from datetime import date
import tempfile

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from accounts.models import Profile
from courses.models import Batch, Course
from learning.models import StudyMaterial
from students.models import StudentEnrollment, StudentProfile
from trainers.models import TrainerProfile


User = get_user_model()
MAX_FILE_SIZE = 50 * 1024 * 1024


class StudyMaterialAPITests(TestCase):
    def setUp(self):
        self.media_directory = tempfile.TemporaryDirectory()
        self.settings_override = override_settings(MEDIA_ROOT=self.media_directory.name)
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)
        self.addCleanup(self.media_directory.cleanup)

        self.trainer_user = self.make_user("trainer-one", "trainer")
        self.trainer = TrainerProfile.objects.create(
            user=self.trainer_user,
            full_name="Trainer One",
        )
        self.other_trainer_user = self.make_user("trainer-two", "trainer")
        self.other_trainer = TrainerProfile.objects.create(
            user=self.other_trainer_user,
            full_name="Trainer Two",
        )
        self.student_user = self.make_user("student-one", "student")

        self.course = self.make_course("PY-01", "Python")
        self.other_course = self.make_course("JS-01", "JavaScript")
        self.batch = self.make_batch("PY-B1", self.course, self.trainer)
        self.other_batch = self.make_batch("JS-B1", self.other_course, self.other_trainer)
        self.student_profile = StudentProfile.objects.create(
            user=self.student_user,
            student_id="ST-001",
            full_name="Student One",
            email="student-one@example.com",
            joining_date=date(2026, 10, 1),
        )
        StudentEnrollment.objects.create(
            student=self.student_profile,
            course=self.course,
            batch=self.batch,
            enrolled_on=date(2026, 10, 1),
        )

        self.client = APIClient()
        self.client.force_authenticate(user=self.trainer_user)

    @staticmethod
    def make_user(username, role):
        user = User.objects.create_user(
            username=username,
            email=f"{username}@example.com",
            password="safe-test-password",
        )
        Profile.objects.create(user=user, role=role)
        return user

    @staticmethod
    def make_course(course_id, name):
        return Course.objects.create(
            course_id=course_id,
            name=name,
            duration="3_months",
            schedule_type="weekday",
        )

    @staticmethod
    def make_batch(batch_id, course, trainer):
        return Batch.objects.create(
            batch_id=batch_id,
            name=f"{course.name} batch",
            course=course,
            trainer=trainer,
            start_date=date(2026, 10, 1),
        )

    @staticmethod
    def pdf_file(content=b"%PDF-1.7\nAcademy material"):
        return SimpleUploadedFile("lesson.pdf", content, content_type="text/plain")

    def upload(self, client=None, **overrides):
        payload = {
            "title": "Lesson notes",
            "description": "Week one",
            "course": str(self.course.pk),
            "batch": str(self.batch.pk),
            "file": self.pdf_file(),
        }
        payload.update(overrides)
        return (client or self.client).post(
            "/api/study-materials/",
            payload,
            format="multipart",
        )

    def test_trainer_uploads_and_retrieves_material_securely(self):
        response = self.upload()

        self.assertEqual(response.status_code, 201, response.data)
        material = StudyMaterial.objects.get(pk=response.data["id"])
        self.assertEqual(material.uploaded_by, self.trainer_user)
        self.assertEqual(material.file_size, len(b"%PDF-1.7\nAcademy material"))
        self.assertTrue(material.file.storage.exists(material.file.name))
        self.assertNotIn("file", response.data)

        listed = self.client.get("/api/study-materials/")
        self.assertEqual(listed.status_code, 200)
        self.assertEqual([item["id"] for item in listed.data], [material.pk])
        self.assertEqual(listed.data[0]["file_type"], "PDF")
        self.assertEqual(listed.data[0]["batch_name"], self.batch.name)
        self.assertEqual(
            self.client.get(f"/api/study-materials/{material.pk}/").status_code,
            200,
        )

        downloaded = self.client.get(
            f"/api/study-materials/{material.pk}/download/"
        )
        self.assertEqual(downloaded.status_code, 200)
        self.assertEqual(downloaded["X-Content-Type-Options"], "nosniff")
        self.assertEqual(
            b"".join(downloaded.streaming_content),
            b"%PDF-1.7\nAcademy material",
        )

    def test_file_at_size_limit_is_accepted_and_larger_file_is_rejected(self):
        exact_size_content = b"%PDF-1.7\n" + b"x" * (MAX_FILE_SIZE - len(b"%PDF-1.7\n"))
        exact = self.upload(file=SimpleUploadedFile(
            "exact.pdf",
            exact_size_content,
            content_type="application/octet-stream",
        ))
        self.assertEqual(exact.status_code, 201, exact.data)
        self.assertEqual(StudyMaterial.objects.get(pk=exact.data["id"]).file_size, MAX_FILE_SIZE)

        too_large_content = b"%PDF-1.7\n" + b"x" * (
            MAX_FILE_SIZE + 1 - len(b"%PDF-1.7\n")
        )
        oversized = self.upload(file=SimpleUploadedFile(
            "oversized.pdf",
            too_large_content,
            content_type="application/pdf",
        ))
        self.assertEqual(oversized.status_code, 400)
        self.assertIn("50 MB", str(oversized.data))
        self.assertEqual(StudyMaterial.objects.count(), 1)

    def test_unsupported_extensions_and_mismatched_file_content_are_rejected(self):
        unsupported = self.upload(file=SimpleUploadedFile(
            "program.exe",
            b"MZ executable",
            content_type="application/pdf",
        ))
        self.assertEqual(unsupported.status_code, 400)
        self.assertIn("Unsupported file type", str(unsupported.data))

        mismatched = self.upload(file=SimpleUploadedFile(
            "not-a-pdf.pdf",
            b"plain text",
            content_type="application/pdf",
        ))
        self.assertEqual(mismatched.status_code, 400)
        self.assertIn("content does not match", str(mismatched.data))
        self.assertEqual(StudyMaterial.objects.count(), 0)

    def test_upload_requires_authenticated_trainer(self):
        anonymous_response = APIClient().post(
            "/api/study-materials/",
            {"title": "Lesson", "file": self.pdf_file()},
            format="multipart",
        )
        self.assertEqual(anonymous_response.status_code, 401)

        student_client = APIClient()
        student_client.force_authenticate(user=self.student_user)
        trainer_upload = self.upload()
        student_response = self.upload(client=student_client)
        self.assertEqual(student_response.status_code, 403)
        self.assertEqual(
            student_client.delete(
                f"/api/study-materials/{trainer_upload.data['id']}/"
            ).status_code,
            403,
        )

    def test_trainer_cannot_upload_to_another_trainers_batch(self):
        response = self.upload(
            course=str(self.other_course.pk),
            batch=str(self.other_batch.pk),
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(StudyMaterial.objects.count(), 0)

    def test_selected_course_must_match_the_batch_course(self):
        response = self.upload(course=str(self.other_course.pk))
        self.assertEqual(response.status_code, 400)
        self.assertIn("belongs to the selected course", str(response.data))
        self.assertEqual(StudyMaterial.objects.count(), 0)

    def test_materials_are_private_to_the_uploader(self):
        response = self.upload()
        material_id = response.data["id"]

        other_client = APIClient()
        other_client.force_authenticate(user=self.other_trainer_user)
        self.assertEqual(other_client.get("/api/study-materials/").data, [])
        self.assertEqual(
            other_client.get(f"/api/study-materials/{material_id}/").status_code,
            404,
        )
        self.assertEqual(
            other_client.get(
                f"/api/study-materials/{material_id}/download/"
            ).status_code,
            404,
        )
        self.assertEqual(
            other_client.delete(f"/api/study-materials/{material_id}/").status_code,
            404,
        )

    def test_deleting_material_removes_its_stored_file(self):
        response = self.upload()
        material = StudyMaterial.objects.get(pk=response.data["id"])
        file_name = material.file.name
        self.assertTrue(material.file.storage.exists(file_name))

        with self.captureOnCommitCallbacks(execute=True):
            deleted = self.client.delete(f"/api/study-materials/{material.pk}/")

        self.assertEqual(deleted.status_code, 204)
        self.assertFalse(StudyMaterial.objects.filter(pk=material.pk).exists())
        self.assertFalse(material.file.storage.exists(file_name))

    def test_enrolled_student_can_list_read_and_download_original_file(self):
        uploaded = self.upload()
        self.assertEqual(uploaded.status_code, 201, uploaded.data)

        student_client = APIClient()
        student_client.force_authenticate(user=self.student_user)
        listed = student_client.get("/api/materials/")
        self.assertEqual(listed.status_code, 200)
        self.assertEqual([item["id"] for item in listed.data], [uploaded.data["id"]])
        material_data = listed.data[0]
        self.assertEqual(material_data["title"], "Lesson notes")
        self.assertEqual(material_data["course_name"], self.course.name)
        self.assertEqual(material_data["batch_name"], self.batch.name)
        self.assertEqual(material_data["trainer_name"], self.trainer.full_name)
        self.assertEqual(material_data["original_filename"], "lesson.pdf")

        detail = student_client.get(f"/api/materials/{uploaded.data['id']}/")
        self.assertEqual(detail.status_code, 200)
        self.assertNotIn("file", detail.data)

        downloaded = student_client.get(
            f"/api/materials/{uploaded.data['id']}/download/"
        )
        self.assertEqual(downloaded.status_code, 200)
        self.assertIn("lesson.pdf", downloaded["Content-Disposition"])
        self.assertEqual(downloaded["X-Content-Type-Options"], "nosniff")
        self.assertEqual(
            b"".join(downloaded.streaming_content),
            b"%PDF-1.7\nAcademy material",
        )

    def test_student_cannot_discover_or_access_another_batches_material(self):
        other_client = APIClient()
        other_client.force_authenticate(user=self.other_trainer_user)
        upload = self.upload(
            client=other_client,
            course=str(self.other_course.pk),
            batch=str(self.other_batch.pk),
        )
        self.assertEqual(upload.status_code, 201, upload.data)
        material_id = upload.data["id"]

        student_client = APIClient()
        student_client.force_authenticate(user=self.student_user)
        self.assertEqual(student_client.get("/api/materials/").data, [])
        self.assertEqual(student_client.get(f"/api/materials/{material_id}/").status_code, 404)
        self.assertEqual(
            student_client.get(f"/api/materials/{material_id}/download/").status_code,
            404,
        )
        self.assertEqual(
            student_client.get(f"/api/materials/{material_id}/preview-link/").status_code,
            404,
        )

    def test_student_preview_link_is_short_lived_and_supports_range_requests(self):
        upload = self.upload()
        student_client = APIClient()
        student_client.force_authenticate(user=self.student_user)

        link_response = student_client.get(
            f"/api/materials/{upload.data['id']}/preview-link/"
        )
        self.assertEqual(link_response.status_code, 200)
        preview_url = link_response.data["url"]
        preview_path = preview_url.split("http://testserver", 1)[-1]
        preview = APIClient().get(preview_path, HTTP_RANGE="bytes=0-4")

        self.assertEqual(preview.status_code, 206)
        self.assertEqual(preview["Content-Range"], "bytes 0-4/25")
        preview_content = b"".join(preview.streaming_content)
        preview.close()
        self.assertEqual(preview_content, b"%PDF-")

    def test_student_can_preview_images_through_signed_private_links(self):
        image_content = b"\x89PNG\r\n\x1a\nimage"
        upload = self.upload(file=SimpleUploadedFile(
            "diagram.png",
            image_content,
            content_type="image/png",
        ))
        self.assertEqual(upload.status_code, 201, upload.data)
        student_client = APIClient()
        student_client.force_authenticate(user=self.student_user)
        link_response = student_client.get(
            f"/api/materials/{upload.data['id']}/preview-link/"
        )
        preview_path = link_response.data["url"].split("http://testserver", 1)[-1]

        preview = APIClient().get(preview_path)

        self.assertEqual(preview.status_code, 200)
        self.assertEqual(preview["Content-Type"], "image/png")
        self.assertEqual(preview["Cache-Control"], "private, no-store")
        self.assertEqual(preview["Referrer-Policy"], "no-referrer")
        self.assertIn("frame-ancestors", preview["Content-Security-Policy"])
        self.assertNotIn("X-Frame-Options", preview)
        preview_content = b"".join(preview.streaming_content)
        preview.close()
        self.assertEqual(preview_content, image_content)

    def test_invalid_preview_link_is_rejected(self):
        upload = self.upload()

        response = APIClient().get(
            f"/api/materials/{upload.data['id']}/preview/?token=invalid"
        )

        self.assertEqual(response.status_code, 403)

    def test_missing_material_file_returns_not_found(self):
        upload = self.upload()
        material = StudyMaterial.objects.get(pk=upload.data["id"])
        material.file.storage.delete(material.file.name)

        student_client = APIClient()
        student_client.force_authenticate(user=self.student_user)
        response = student_client.get(f"/api/materials/{material.pk}/download/")

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["detail"], "The study material file is unavailable.")

    def test_student_material_api_requires_auth_and_is_read_only(self):
        upload = self.upload()
        material_id = upload.data["id"]

        self.assertEqual(APIClient().get("/api/materials/").status_code, 401)
        self.assertEqual(
            APIClient().get(f"/api/materials/{material_id}/download/").status_code,
            401,
        )

        student_client = APIClient()
        student_client.force_authenticate(user=self.student_user)
        self.assertEqual(
            student_client.post(
                "/api/materials/",
                {"title": "Student upload"},
                format="multipart",
            ).status_code,
            403,
        )
        self.assertEqual(
            student_client.delete(f"/api/materials/{material_id}/").status_code,
            403,
        )
        self.assertEqual(StudyMaterial.objects.count(), 1)
