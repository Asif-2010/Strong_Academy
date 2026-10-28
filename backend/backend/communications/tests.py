from datetime import date
from io import BytesIO
from tempfile import TemporaryDirectory

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient
from PIL import Image

from accounts.models import Profile
from courses.models import Batch, Course
from communications.models import Message, TrainerFeedback
from students.models import StudentEnrollment, StudentProfile
from trainers.models import TrainerProfile

User = get_user_model()


class AcademyFeatureAPITests(TestCase):
    def setUp(self):
        self.media_directory = TemporaryDirectory()
        self.addCleanup(self.media_directory.cleanup)
        self.media_override = override_settings(MEDIA_ROOT=self.media_directory.name)
        self.media_override.enable()
        self.addCleanup(self.media_override.disable)

        self.manager = self.make_user("feature-manager", "manager")
        self.hr = self.make_user("feature-hr", "hr")
        self.trainer_user = self.make_user("feature-trainer", "trainer")
        self.other_trainer_user = self.make_user("other-feature-trainer", "trainer")
        self.student_user = self.make_user("feature-student", "student")
        self.unrelated_student_user = self.make_user("unrelated-feature-student", "student")

        self.trainer = TrainerProfile.objects.create(
            user=self.trainer_user,
            full_name="Assigned Trainer",
        )
        self.other_trainer = TrainerProfile.objects.create(
            user=self.other_trainer_user,
            full_name="Unassigned Trainer",
        )
        self.course = Course.objects.create(
            course_id="FEATURE-01",
            name="Feature Course",
            duration="3_months",
            schedule_type="weekday",
        )
        self.course.trainers.add(self.trainer)
        self.batch = Batch.objects.create(
            batch_id="FEATURE-B1",
            name="Feature Batch",
            course=self.course,
            trainer=self.trainer,
            start_date=date(2026, 10, 1),
        )
        self.student = StudentProfile.objects.create(
            user=self.student_user,
            student_id="FEATURE-ST-1",
            full_name="Enrolled Student",
            email="feature-student@example.com",
            joining_date=date(2026, 10, 1),
        )
        self.unrelated_student = StudentProfile.objects.create(
            user=self.unrelated_student_user,
            student_id="FEATURE-ST-2",
            full_name="Unrelated Student",
            email="unrelated-feature-student@example.com",
            joining_date=date(2026, 10, 1),
        )
        StudentEnrollment.objects.create(
            student=self.student,
            course=self.course,
            batch=self.batch,
            enrolled_on=date(2026, 10, 1),
        )

    @staticmethod
    def make_user(username, role):
        user = User.objects.create_user(
            username=username,
            email=f"{username}@example.com",
            password="Strong-password-2026",
        )
        Profile.objects.create(user=user, role=role)
        return user

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    def test_manager_multicast_is_private_and_recipients_can_read(self):
        client = self.client_for(self.manager)
        response = client.post(
            "/api/messages/send/",
            {
                "recipient_ids": [self.hr.pk, self.trainer_user.pk, self.student_user.pk],
                "subject": "Schedule update",
                "body": "Please review the updated schedule.",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Message.objects.count(), 3)
        self.assertEqual(len({row["conversation"] for row in response.data}), 3)

        recipient_client = self.client_for(self.student_user)
        conversations = recipient_client.get("/api/messages/conversations/")
        self.assertEqual(conversations.status_code, 200)
        self.assertEqual(len(conversations.data), 1)
        conversation_id = conversations.data[0]["id"]
        thread = recipient_client.get(
            f"/api/messages/conversations/{conversation_id}/"
        )
        self.assertEqual(thread.status_code, 200)
        self.assertEqual(thread.data[0]["body"], "Please review the updated schedule.")
        self.assertIsNotNone(thread.data[0]["read_at"])
        self.assertEqual(
            recipient_client.get("/api/messages/unread-count/").data["unread_count"],
            0,
        )
        reply = recipient_client.post(
            f"/api/messages/conversations/{conversation_id}/",
            {"body": "Thank you, received."},
            format="json",
        )
        self.assertEqual(reply.status_code, 201)
        self.assertEqual(reply.data["recipient_id"], self.manager.pk)
        self.assertEqual(
            self.client_for(self.manager).get(
                f"/api/messages/conversations/{conversation_id}/"
            ).data[-1]["body"],
            "Thank you, received.",
        )

        unauthorized = self.client_for(self.unrelated_student_user).get(
            f"/api/messages/conversations/{conversation_id}/"
        )
        self.assertEqual(unauthorized.status_code, 404)

    def test_recipient_policy_is_enforced_on_send_endpoint(self):
        trainer_client = self.client_for(self.trainer_user)
        recipients = trainer_client.get("/api/messages/recipients/")
        self.assertEqual(
            [recipient["id"] for recipient in recipients.data],
            [self.student_user.pk],
        )
        permitted = trainer_client.post(
            "/api/messages/send/",
            {
                "recipient_ids": [self.student_user.pk],
                "subject": "Batch notes",
                "body": "Please review the course notes.",
            },
            format="json",
        )
        self.assertEqual(permitted.status_code, 201)
        prohibited = trainer_client.post(
            "/api/messages/send/",
            {
                "recipient_ids": [self.hr.pk],
                "body": "Not permitted.",
            },
            format="json",
        )
        self.assertEqual(prohibited.status_code, 403)

        student_client = self.client_for(self.student_user)
        initiated = student_client.post(
            "/api/messages/send/",
            {
                "recipient_ids": [self.trainer_user.pk],
                "body": "Students cannot create conversations.",
            },
            format="json",
        )
        self.assertEqual(initiated.status_code, 403)

    def test_hr_can_initiate_permitted_messages_and_search_finds_old_messages(self):
        response = self.client_for(self.hr).post(
            "/api/messages/send/",
            {
                "recipient_ids": [self.trainer_user.pk, self.student_user.pk],
                "subject": "Welcome",
                "body": "Please read your onboarding notes.",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        result = self.client_for(self.student_user).get(
            "/api/messages/conversations/",
            {"search": "onboarding"},
        )
        self.assertEqual(result.status_code, 200)
        self.assertEqual(len(result.data), 1)
        forbidden = self.client_for(self.hr).post(
            "/api/messages/send/",
            {
                "recipient_ids": [self.manager.pk],
                "body": "HR cannot initiate to managers.",
            },
            format="json",
        )
        self.assertEqual(forbidden.status_code, 403)

    def test_feedback_is_limited_to_enrolled_trainer_and_report_uses_saved_data(self):
        student_client = self.client_for(self.student_user)
        options = student_client.get("/api/trainer-feedback/options/")
        self.assertEqual(options.status_code, 200)
        self.assertEqual(len(options.data), 1)
        payload = {
            "trainer": self.trainer.pk,
            "course": self.course.pk,
            "batch": self.batch.pk,
            "overall_rating": 4,
            "teaching_rating": 5,
            "communication_rating": 3,
            "subject_knowledge_rating": 4,
            "comments": "Clear and helpful.",
        }
        submitted = student_client.post(
            "/api/trainer-feedback/",
            payload,
            format="json",
        )
        self.assertEqual(submitted.status_code, 201)
        self.assertEqual(TrainerFeedback.objects.count(), 1)

        duplicate = student_client.post(
            "/api/trainer-feedback/",
            payload,
            format="json",
        )
        self.assertEqual(duplicate.status_code, 400)

        invalid = student_client.post(
            "/api/trainer-feedback/",
            {**payload, "trainer": self.other_trainer.pk},
            format="json",
        )
        self.assertEqual(invalid.status_code, 403)
        invalid_rating = student_client.post(
            "/api/trainer-feedback/",
            {**payload, "overall_rating": 6},
            format="json",
        )
        self.assertEqual(invalid_rating.status_code, 400)

        manager_client = self.client_for(self.manager)
        report = manager_client.get("/api/trainer-feedback/")
        self.assertEqual(report.status_code, 200)
        self.assertEqual(report.data[0]["student_name"], "Enrolled Student")
        self.assertNotIn("email", report.data[0])
        summary = manager_client.get("/api/trainer-feedback/summary/")
        self.assertEqual(summary.status_code, 200)
        self.assertEqual(summary.data["review_count"], 1)
        self.assertEqual(summary.data["overall_average"], 4)
        self.assertEqual(summary.data["trainers"][0]["teaching_average"], 5)
        hr_report = self.client_for(self.hr).get("/api/trainer-feedback/")
        self.assertEqual(hr_report.data, report.data)

        trainer_report = self.client_for(self.trainer_user).get("/api/trainer-feedback/")
        self.assertEqual(trainer_report.status_code, 403)

    def test_profile_photo_is_validated_and_scoped_to_authenticated_user(self):
        image_buffer = BytesIO()
        Image.new("RGB", (16, 16), color="green").save(image_buffer, format="PNG")
        upload = SimpleUploadedFile(
            "profile.png",
            image_buffer.getvalue(),
            content_type="image/png",
        )
        client = self.client_for(self.student_user)
        response = client.post(
            "/api/profile/photo/?user_id=%s" % self.manager.pk,
            {"photo": upload},
            format="multipart",
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("/api/profile/photo/", response.data["profile"]["photo_url"])
        self.assertTrue(self.student_user.profile.photo.name.startswith("profile_photos/"))
        self.assertFalse(self.manager.profile.photo)
        first_name = self.student_user.profile.photo.name
        replacement_buffer = BytesIO()
        Image.new("RGB", (16, 16), color="blue").save(replacement_buffer, format="JPEG")
        replacement = SimpleUploadedFile(
            "photo.jpg",
            replacement_buffer.getvalue(),
            content_type="image/jpeg",
        )
        replaced = client.post(
            "/api/profile/photo/",
            {"photo": replacement},
            format="multipart",
        )
        self.assertEqual(replaced.status_code, 200)
        self.student_user.profile.refresh_from_db()
        self.assertNotEqual(self.student_user.profile.photo.name, first_name)
        self.assertFalse(self.student_user.profile.photo.storage.exists(first_name))

        photo = client.get("/api/profile/photo/")
        self.assertEqual(photo.status_code, 200)
        self.assertTrue(photo["Content-Type"].startswith("image/jpeg"))
        self.assertTrue(b"".join(photo.streaming_content))
        photo.close()

        invalid_image = SimpleUploadedFile(
            "not-an-image.png",
            b"not an actual image",
            content_type="image/png",
        )
        rejected = client.post(
            "/api/profile/photo/",
            {"photo": invalid_image},
            format="multipart",
        )
        self.assertEqual(rejected.status_code, 400)
