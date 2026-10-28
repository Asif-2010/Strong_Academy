from datetime import date, timedelta
import tempfile
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core import mail
from django.test import TestCase, override_settings
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from accounts.models import PlacementDrive, Profile, PublicEnquiry
from attendance.models import Attendance
from courses.models import Batch, Course
from learning.models import Assignment, StudentSubmission
from students.models import StudentEnrollment, StudentProfile
from trainers.models import TrainerProfile

User = get_user_model()


class PublicWebsiteAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.active_course = Course.objects.create(
            course_id="PUB-01",
            name="Public Active Course",
            description="Course description",
            duration="3_months",
            schedule_type="weekday",
            status="active",
        )
        Course.objects.create(
            course_id="PUB-02",
            name="Private Inactive Course",
            duration="2_months",
            schedule_type="weekly",
            status="inactive",
        )
        PlacementDrive.objects.create(
            company="Public Company",
            title="Upcoming Drive",
            date=date.today() + timedelta(days=7),
            details="Public drive details",
            status="scheduled",
        )
        PlacementDrive.objects.create(
            company="Past Company",
            title="Past Drive",
            date=date.today() - timedelta(days=7),
            status="scheduled",
        )
        PlacementDrive.objects.create(
            company="Unscheduled Company",
            title="Cancelled Drive",
            date=date.today() + timedelta(days=14),
            status="cancelled",
        )

    def test_public_courses_expose_only_active_course_fields(self):
        response = self.client.get("/api/public/courses/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual([course["id"] for course in response.data], [self.active_course.id])
        self.assertNotIn("trainers", response.data[0])

    def test_public_placement_drives_only_expose_upcoming_scheduled_drives(self):
        response = self.client.get("/api/public/placement-drives/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["title"], "Upcoming Drive")
        self.assertNotIn("status", response.data[0])
        self.assertNotIn("details", response.data[0])

    def test_existing_role_protected_course_endpoint_stays_protected(self):
        response = self.client.get("/api/courses/")

        self.assertEqual(response.status_code, 401)

    def test_public_enquiry_is_validated_and_stored(self):
        response = self.client.post(
            "/api/public/enquiries/",
            {
                "name": "  Alex Learner  ",
                "email": "ALEX@example.com",
                "phone": " 555-0100 ",
                "enquiry_type": "course",
                "message": "  I would like course details. ",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(PublicEnquiry.objects.count(), 1)
        enquiry = PublicEnquiry.objects.get()
        self.assertEqual(enquiry.name, "Alex Learner")
        self.assertEqual(enquiry.email, "alex@example.com")
        self.assertEqual(enquiry.message, "I would like course details.")

    def test_public_enquiry_rejects_invalid_fields(self):
        response = self.client.post(
            "/api/public/enquiries/",
            {
                "name": " ",
                "email": "not-an-email",
                "phone": " ",
                "enquiry_type": "other",
                "message": " ",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(PublicEnquiry.objects.count(), 0)


class SSARoleAPITests(TestCase):
    def setUp(self):
        self.manager = self.make_user("manager", "manager")
        self.hr = self.make_user("hr", "hr")
        self.trainer = self.make_user("trainer", "trainer")
        self.other_trainer = self.make_user("other-trainer", "trainer")
        self.student = self.make_user("student", "student")
        self.other_student = self.make_user("other-student", "student")

        self.trainer_profile = TrainerProfile.objects.create(
            user=self.trainer, full_name="Trainer One"
        )
        self.other_trainer_profile = TrainerProfile.objects.create(
            user=self.other_trainer, full_name="Trainer Two"
        )
        self.course = Course.objects.create(
            course_id="PY-01",
            name="Python",
            duration="3_months",
            schedule_type="weekday",
        )
        self.course.trainers.add(self.trainer_profile)
        self.other_course = Course.objects.create(
            course_id="JS-01",
            name="JavaScript",
            duration="2_months",
            schedule_type="weekly",
        )
        self.other_course.trainers.add(self.other_trainer_profile)
        self.batch = Batch.objects.create(
            batch_id="PY-B1",
            name="Python Batch 1",
            course=self.course,
            trainer=self.trainer_profile,
            start_date=date(2026, 10, 1),
        )
        self.other_batch = Batch.objects.create(
            batch_id="JS-B1",
            name="JavaScript Batch 1",
            course=self.other_course,
            trainer=self.other_trainer_profile,
            start_date=date(2026, 10, 1),
        )
        self.student_profile = StudentProfile.objects.create(
            user=self.student,
            student_id="ST-001",
            full_name="Student One",
            email="student@example.com",
            qualification="BSc Computer Science",
            joining_date=date(2026, 10, 1),
        )
        self.other_student_profile = StudentProfile.objects.create(
            user=self.other_student,
            student_id="ST-002",
            full_name="Student Two",
            email="other@example.com",
            joining_date=date(2026, 10, 1),
        )
        StudentEnrollment.objects.create(
            student=self.student_profile,
            course=self.course,
            batch=self.batch,
            enrolled_on=date(2026, 10, 1),
        )
        StudentEnrollment.objects.create(
            student=self.other_student_profile,
            course=self.other_course,
            batch=self.other_batch,
            enrolled_on=date(2026, 10, 1),
        )

    @staticmethod
    def make_user(username, role):
        user = User.objects.create_user(
            username=username,
            email=f"{username}@example.com",
            password="A-safe-test-password-123",
        )
        Profile.objects.create(user=user, role=role)
        return user

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    def test_manager_can_read_but_cannot_mutate_operational_records(self):
        client = self.client_for(self.manager)
        self.assertEqual(client.get("/api/students/").status_code, 200)
        self.assertEqual(len(client.get("/api/students/").data), 2)
        self.assertEqual(
            client.get("/api/students/").data[0]["qualification"],
            "BSc Computer Science",
        )
        dashboard = client.get("/api/dashboard/")
        self.assertEqual(dashboard.status_code, 200)
        self.assertEqual(dashboard.data["statistics"]["students"], StudentProfile.objects.count())
        self.assertEqual(dashboard.data["statistics"]["trainers"], TrainerProfile.objects.count())
        self.assertEqual(
            dashboard.data["statistics"]["hr_staff"],
            User.objects.filter(profile__role="hr").count(),
        )
        self.assertEqual(dashboard.data["statistics"]["courses"], Course.objects.count())
        self.assertEqual(
            client.post("/api/students/", {
                "student_id": "ST-003",
                "full_name": "New Student",
                "email": "new@example.com",
                "joining_date": "2026-10-11",
            }).status_code,
            403,
        )
        self.assertEqual(
            client.post("/api/batches/", {
                "batch_id": "PY-B2",
                "name": "Python Batch 2",
                "course": self.course.pk,
                "start_date": "2026-11-01",
                "status": "upcoming",
            }).status_code,
            403,
        )
        self.assertEqual(
            client.post("/api/staff/trainer-accounts/", {
                "full_name": "Manager-Created Trainer",
                "email": "manager-created-trainer@example.com",
                "password": "A-safe-test-password-123",
                "confirm_password": "A-safe-test-password-123",
            }).status_code,
            403,
        )
        self.assertEqual(
            client.patch(f"/api/courses/{self.course.pk}/", {"name": "Changed"}).status_code,
            403,
        )
        self.assertEqual(
            client.post("/api/attendance/", {
                "student": self.student_profile.pk,
                "batch": self.batch.pk,
                "date": "2026-10-11",
                "status": "present",
            }).status_code,
            403,
        )

    def test_manager_and_hr_can_delete_batch_assignments(self):
        manager_enrollment = StudentEnrollment.objects.get(
            student=self.student_profile,
            batch=self.batch,
        )
        manager_response = self.client_for(self.manager).delete(
            f"/api/enrollments/{manager_enrollment.pk}/"
        )
        self.assertEqual(manager_response.status_code, 204)
        self.assertFalse(
            StudentEnrollment.objects.filter(pk=manager_enrollment.pk).exists()
        )
        self.assertTrue(StudentProfile.objects.filter(pk=self.student_profile.pk).exists())
        self.assertTrue(Batch.objects.filter(pk=self.batch.pk).exists())

        hr_enrollment = StudentEnrollment.objects.get(
            student=self.other_student_profile,
            batch=self.other_batch,
        )
        hr_response = self.client_for(self.hr).delete(
            f"/api/enrollments/{hr_enrollment.pk}/"
        )
        self.assertEqual(hr_response.status_code, 204)
        self.assertFalse(StudentEnrollment.objects.filter(pk=hr_enrollment.pk).exists())

    def test_hr_can_create_students_and_attendance_with_duplicate_protection(self):
        client = self.client_for(self.hr)
        response = client.post("/api/students/", {
            "student_id": "ST-003",
            "full_name": "New Student",
            "email": "new@example.com",
            "joining_date": "2026-10-11",
        })
        self.assertEqual(response.status_code, 201, response.data)
        self.assertIsNone(response.data["user"])
        self.assertFalse(User.objects.filter(email="new@example.com").exists())
        self.assertEqual(response.data["enrollment_status"], "active")
        manager_rows = self.client_for(self.manager).get("/api/students/").data
        self.assertIn(response.data["id"], {row["id"] for row in manager_rows})
        attendance_data = {
            "student": self.student_profile.pk,
            "batch": self.batch.pk,
            "date": "2026-10-11",
            "status": "present",
        }
        first = client.post("/api/attendance/", attendance_data)
        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(first.data["marked_by"], self.hr.pk)
        duplicate = client.post("/api/attendance/", attendance_data)
        self.assertEqual(duplicate.status_code, 400)
        self.assertEqual(
            client.patch(f"/api/attendance/{first.data['id']}/", {"status": "late"}).status_code,
            200,
        )
        self.assertTrue(Attendance.objects.filter(pk=first.data["id"], status="late").exists())

    def test_manager_can_create_hr_account_and_new_hr_can_sign_in(self):
        manager_client = self.client_for(self.manager)
        data = {
            "full_name": "New HR Manager",
            "email": "new-hr@example.com",
            "password": "A-safe-test-password-123",
            "confirm_password": "A-safe-test-password-123",
            "phone": "555-0150",
            "department": "People Operations",
            "job_title": "HR Coordinator",
            "is_active": True,
        }
        created = manager_client.post("/api/staff/hr-accounts/", data)
        self.assertEqual(created.status_code, 201, created.data)
        self.assertNotIn("password", created.data)
        self.assertNotIn("confirm_password", created.data)
        account = User.objects.get(email=data["email"])
        self.assertTrue(account.check_password(data["password"]))
        self.assertEqual(account.profile.role, "hr")
        self.assertTrue(account.is_active)
        self.assertEqual(account.hr_profile.phone, data["phone"])
        self.assertEqual(account.hr_profile.department, data["department"])
        self.assertEqual(account.hr_profile.job_title, data["job_title"])
        self.assertEqual(created.data["role"], "hr")
        staff_list = manager_client.get("/api/hr-staff/").data
        listed_account = next(row for row in staff_list if row["id"] == account.pk)
        self.assertEqual(listed_account["department"], data["department"])
        self.assertEqual(listed_account["job_title"], data["job_title"])

        duplicate_email = manager_client.post(
            "/api/staff/hr-accounts/",
            {**data, "email": data["email"].upper()},
        )
        self.assertEqual(duplicate_email.status_code, 400)
        self.assertEqual(User.objects.filter(email__iexact=data["email"]).count(), 1)

        second_account = manager_client.post(
            "/api/staff/hr-accounts/",
            {**data, "email": "new-hr@another.example"},
        )
        self.assertEqual(second_account.status_code, 201, second_account.data)
        self.assertNotEqual(second_account.data["username"], created.data["username"])

        invalid_password_confirmation = manager_client.post(
            "/api/staff/hr-accounts/",
            {
                **data,
                "email": "password-mismatch@example.com",
                "confirm_password": "A-different-password-123",
            },
        )
        self.assertEqual(invalid_password_confirmation.status_code, 400)
        self.assertIn("confirm_password", invalid_password_confirmation.data)
        self.assertFalse(
            User.objects.filter(email="password-mismatch@example.com").exists()
        )

        login = APIClient().post("/api/auth/login/", {
            "email": data["email"],
            "password": data["password"],
        })
        self.assertEqual(login.status_code, 200, login.data)
        self.assertEqual(login.data["user"]["role"], "hr")

        arbitrary_role = manager_client.post(
            "/api/staff/hr-accounts/",
            {**data, "email": "role-injection@example.com", "role": "manager"},
        )
        self.assertEqual(arbitrary_role.status_code, 400)
        self.assertFalse(User.objects.filter(email="role-injection@example.com").exists())
        for user in (self.hr, self.trainer, self.student):
            self.assertEqual(
                self.client_for(user).post(
                    "/api/staff/hr-accounts/",
                    {**data, "email": f"forbidden-{user.username}@example.com"},
                ).status_code,
                403,
            )
        self.assertEqual(
            APIClient().post("/api/staff/hr-accounts/", data).status_code,
            401,
        )

    def test_hr_can_create_trainer_account_with_course_and_only_hr_can_use_endpoint(self):
        hr_client = self.client_for(self.hr)
        data = {
            "full_name": "New Trainer",
            "email": "new-trainer@example.com",
            "password": "A-safe-test-password-123",
            "confirm_password": "A-safe-test-password-123",
            "phone": "555-0151",
            "is_active": True,
            "qualifications": "BSc Computer Science",
            "skills": "Python, Django",
            "experience_years": 4,
            "assigned_course": self.course.pk,
        }
        created = hr_client.post("/api/staff/trainer-accounts/", data)
        self.assertEqual(created.status_code, 201, created.data)
        account = User.objects.get(email=data["email"])
        trainer_profile = TrainerProfile.objects.get(user=account)
        self.assertTrue(account.check_password(data["password"]))
        self.assertEqual(account.profile.role, "trainer")
        self.assertEqual(trainer_profile.full_name, data["full_name"])
        self.assertEqual(trainer_profile.phone, data["phone"])
        self.assertEqual(trainer_profile.qualifications, data["qualifications"])
        self.assertEqual(trainer_profile.skills, data["skills"])
        self.assertEqual(trainer_profile.experience_years, data["experience_years"])
        self.assertFalse(trainer_profile.approved)
        self.assertTrue(self.course.trainers.filter(pk=trainer_profile.pk).exists())
        self.assertIn(
            trainer_profile.pk,
            {row["id"] for row in hr_client.get("/api/trainers/").data},
        )
        login = APIClient().post("/api/auth/login/", {
            "email": data["email"],
            "password": data["password"],
        })
        self.assertEqual(login.status_code, 200, login.data)
        self.assertEqual(login.data["user"]["role"], "trainer")

        for user in (self.manager, self.trainer, self.student):
            self.assertEqual(
                self.client_for(user).post(
                    "/api/staff/trainer-accounts/",
                    {**data, "email": f"forbidden-{user.username}@example.com"},
                ).status_code,
                403,
            )
        duplicate = hr_client.post(
            "/api/staff/trainer-accounts/",
            {**data, "email": self.student.email},
        )
        self.assertEqual(duplicate.status_code, 400)
        inactive_data = {
            **data,
            "email": "inactive-trainer@example.com",
            "is_active": False,
        }
        inactive = hr_client.post("/api/staff/trainer-accounts/", inactive_data)
        self.assertEqual(inactive.status_code, 201, inactive.data)
        blocked_login = APIClient().post("/api/auth/login/", {
            "email": inactive_data["email"],
            "password": inactive_data["password"],
        })
        self.assertEqual(blocked_login.status_code, 403)

    def test_hr_can_assign_course_when_creating_trainer_profile(self):
        response = self.client_for(self.hr).post("/api/trainers/", {
            "full_name": "Profile Trainer",
            "assigned_course": self.course.pk,
        })

        self.assertEqual(response.status_code, 201, response.data)
        trainer_profile = TrainerProfile.objects.get(pk=response.data["id"])
        self.assertTrue(self.course.trainers.filter(pk=trainer_profile.pk).exists())
        self.assertIn("Python", response.data["course_names"])

    def test_hr_student_creation_does_not_create_account_and_creates_course_enrollment(self):
        response = self.client_for(self.hr).post("/api/students/", {
            "student_id": "ST-003",
            "full_name": "New Student",
            "email": "new@example.com",
            "phone": "555-0100",
            "joining_date": "2026-10-11",
            "enrollment_status": "active",
            "course": self.course.pk,
            "batch": self.batch.pk,
        })
        self.assertEqual(response.status_code, 201, response.data)
        student = StudentProfile.objects.get(pk=response.data["id"])
        self.assertIsNone(student.user_id)
        self.assertFalse(User.objects.filter(email=student.email).exists())
        self.assertEqual(response.data["course_name"], self.course.name)
        self.assertEqual(response.data["batch_name"], self.batch.name)
        self.assertTrue(StudentEnrollment.objects.filter(
            student=student,
            course=self.course,
            batch=self.batch,
            enrolled_on=date(2026, 10, 11),
        ).exists())
        login = APIClient().post("/api/auth/login/", {
            "email": student.email,
            "password": "A-safe-test-password-123",
            "role": "student",
        })
        self.assertEqual(login.status_code, 401)
        updated = self.client_for(self.hr).patch(
            f"/api/students/{student.pk}/",
            {"email": "renamed@example.com"},
        )
        self.assertEqual(updated.status_code, 200, updated.data)
        self.assertFalse(User.objects.filter(email="renamed@example.com").exists())

    def test_hr_can_change_student_course_and_batch_and_retrieve_them(self):
        client = self.client_for(self.hr)
        initial = client.get(f"/api/students/{self.student_profile.pk}/")
        self.assertEqual(initial.status_code, 200, initial.data)
        self.assertEqual(initial.data["course_id"], self.course.pk)
        self.assertEqual(initial.data["batch_id"], self.batch.pk)

        updated = client.patch(
            f"/api/students/{self.student_profile.pk}/",
            {"course": self.other_course.pk, "batch": self.other_batch.pk},
        )
        self.assertEqual(updated.status_code, 200, updated.data)

        refreshed = client.get(f"/api/students/{self.student_profile.pk}/")
        self.assertEqual(refreshed.status_code, 200, refreshed.data)
        self.assertEqual(refreshed.data["course_id"], self.other_course.pk)
        self.assertEqual(refreshed.data["batch_id"], self.other_batch.pk)
        self.assertEqual(refreshed.data["course_name"], self.other_course.name)
        self.assertEqual(refreshed.data["batch_name"], self.other_batch.name)
        self.student_profile.refresh_from_db()
        self.assertEqual(self.student_profile.full_name, "Student One")

    def test_hr_cannot_assign_a_batch_from_a_different_course_when_editing_student(self):
        response = self.client_for(self.hr).patch(
            f"/api/students/{self.student_profile.pk}/",
            {"course": self.course.pk, "batch": self.other_batch.pk},
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("batch", response.data)
        enrollment = StudentEnrollment.objects.get(student=self.student_profile)
        self.assertEqual(enrollment.course_id, self.course.pk)
        self.assertEqual(enrollment.batch_id, self.batch.pk)

    def test_hr_student_creation_rejects_duplicate_email_and_invalid_status(self):
        client = self.client_for(self.hr)
        data = {
            "student_id": "ST-003",
            "full_name": "New Student",
            "email": "new@example.com",
            "joining_date": "2026-10-11",
        }
        duplicate = client.post("/api/students/", {
            **data,
            "email": self.student.email,
        })
        self.assertEqual(duplicate.status_code, 400)
        self.assertIn("already exists", str(duplicate.data["email"]))

        duplicate_id = client.post("/api/students/", {
            **data,
            "student_id": self.student_profile.student_id.lower(),
        })
        self.assertEqual(duplicate_id.status_code, 400)
        self.assertIn("already exists", str(duplicate_id.data["student_id"]))

        password_rejected = client.post("/api/students/", {
            **data,
            "email": "no-login@example.com",
            "account_password": "A-safe-test-password-123",
        })
        self.assertEqual(password_rejected.status_code, 400)
        self.assertIn("account_password", password_rejected.data)
        self.assertFalse(User.objects.filter(email="no-login@example.com").exists())

        invalid_status = client.post("/api/students/", {
            **data,
            "email": "invalid-status@example.com",
            "enrollment_status": "",
        })
        self.assertEqual(invalid_status.status_code, 400)
        self.assertIn("enrollment_status", invalid_status.data)
        self.assertFalse(User.objects.filter(email="invalid-status@example.com").exists())

    def test_deleting_student_profile_does_not_delete_linked_login_account(self):
        linked_user = self.make_user("profile-delete-student", "student")
        student_profile = StudentProfile.objects.create(
            user=linked_user,
            student_id="ST-DELETE-01",
            full_name="Profile Delete Student",
            email="profile-delete@example.com",
            joining_date=date(2026, 10, 1),
        )
        response = self.client_for(self.hr).delete(
            f"/api/students/{student_profile.pk}/"
        )
        self.assertEqual(response.status_code, 204)
        self.assertTrue(User.objects.filter(pk=linked_user.pk).exists())
        self.assertFalse(
            StudentProfile.objects.filter(pk=student_profile.pk).exists()
        )

    def test_hr_course_and_batch_choices_and_manager_visibility(self):
        client = self.client_for(self.hr)
        course_response = client.post("/api/courses/", {
            "course_id": "WEB-01",
            "name": "Web Development",
            "description": "Web development fundamentals.",
            "duration": "4_months",
            "schedule_type": "weekday",
            "start_date": "2026-10-12",
            "end_date": "2027-02-12",
            "trainers": [self.trainer_profile.pk],
            "status": "active",
            "placement_preparation": "Portfolio and interview practice.",
        })
        self.assertEqual(course_response.status_code, 201, course_response.data)

        invalid_course = client.post("/api/courses/", {
            "course_id": "INVALID-01",
            "name": "Invalid course",
            "duration": "",
            "schedule_type": "",
        })
        self.assertEqual(invalid_course.status_code, 400)
        self.assertIn("duration", invalid_course.data)
        self.assertIn("schedule_type", invalid_course.data)

        batch_response = client.post("/api/batches/", {
            "batch_id": "WEB-B1",
            "name": "Web Weekday Batch",
            "course": course_response.data["id"],
            "trainer": self.trainer_profile.pk,
            "start_date": "2026-10-12",
            "end_date": "2027-02-12",
            "status": "upcoming",
        })
        self.assertEqual(batch_response.status_code, 201, batch_response.data)
        self.assertIn("WEB-01", {
            row["course_id"]
            for row in self.client_for(self.manager).get("/api/courses/").data
        })
        self.assertIn("WEB-B1", {
            row["batch_id"]
            for row in self.client_for(self.manager).get("/api/batches/").data
        })
        self.assertEqual(
            self.client_for(self.manager).patch(
                f"/api/batches/{batch_response.data['id']}/",
                {"name": "Manager edit"},
            ).status_code,
            403,
        )

    def test_trainer_is_limited_to_assigned_students_and_batches(self):
        client = self.client_for(self.trainer)
        students = client.get("/api/students/")
        self.assertEqual(students.status_code, 200)
        self.assertEqual([row["id"] for row in students.data], [self.student_profile.pk])
        self.assertEqual(students.data[0]["qualification"], "BSc Computer Science")
        marked = client.post("/api/attendance/", {
            "student": self.student_profile.pk,
            "batch": self.batch.pk,
            "date": "2026-10-11",
            "status": "present",
        })
        self.assertEqual(marked.status_code, 201, marked.data)
        outside_batch = client.post("/api/attendance/", {
            "student": self.other_student_profile.pk,
            "batch": self.other_batch.pk,
            "date": "2026-10-11",
            "status": "present",
        })
        self.assertEqual(outside_batch.status_code, 403, outside_batch.data)
        self.assertEqual(
            client.delete(f"/api/attendance/{marked.data['id']}/").status_code,
            403,
        )

    def test_student_only_reads_own_profile_and_attendance(self):
        Attendance.objects.create(
            student=self.student_profile,
            batch=self.batch,
            date=date(2026, 10, 10),
            status="present",
            marked_by=self.hr,
        )
        Attendance.objects.create(
            student=self.other_student_profile,
            batch=self.other_batch,
            date=date(2026, 10, 10),
            status="absent",
            marked_by=self.hr,
        )
        client = self.client_for(self.student)
        students = client.get("/api/students/")
        self.assertEqual(students.status_code, 200)
        self.assertEqual([row["id"] for row in students.data], [self.student_profile.pk])
        self.assertEqual(students.data[0]["attendance_percentage"], 100)
        history = client.get("/api/attendance/")
        self.assertEqual(history.status_code, 200)
        self.assertEqual(len(history.data), 1)
        self.assertEqual(
            client.post("/api/attendance/", {
                "student": self.student_profile.pk,
                "batch": self.batch.pk,
                "date": "2026-10-11",
                "status": "absent",
            }).status_code,
            403,
        )
        self.assertEqual(
            client.get(f"/api/students/{self.other_student_profile.pk}/").status_code,
            404,
        )

    def test_student_can_update_own_profile_and_upload_resume(self):
        client = self.client_for(self.student)
        response = client.patch(
            f"/api/students/{self.student_profile.pk}/",
            {
                "full_name": "Updated Student",
                "email": "updated@example.com",
                "phone": "555-0101",
                "qualification": "BSc Computer Science",
            },
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.student.refresh_from_db()
        self.student_profile.refresh_from_db()
        self.assertEqual(self.student_profile.full_name, "Updated Student")
        self.assertEqual(self.student_profile.qualification, "BSc Computer Science")
        self.assertEqual(self.student.email, "updated@example.com")
        self.assertEqual(self.student.first_name, "Updated Student")

        with tempfile.TemporaryDirectory() as media_root, override_settings(MEDIA_ROOT=media_root):
            resume = SimpleUploadedFile(
                "updated-resume.pdf",
                b"%PDF-1.4 student resume",
                content_type="application/pdf",
            )
            uploaded = client.patch(
                f"/api/students/{self.student_profile.pk}/",
                {"resume": resume},
                format="multipart",
            )
            self.assertEqual(uploaded.status_code, 200, uploaded.data)
            self.student_profile.refresh_from_db()
            self.assertTrue(self.student_profile.resume.name.startswith("student_resumes/"))

            download = client.get(
                f"/api/students/{self.student_profile.pk}/resume/"
            )
            self.assertEqual(download.status_code, 200)
            self.assertEqual(
                b"".join(download.streaming_content),
                b"%PDF-1.4 student resume",
            )
            self.assertEqual(
                client.get(
                    f"/api/students/{self.other_student_profile.pk}/resume/"
                ).status_code,
                404,
            )

            invalid_resume = SimpleUploadedFile(
                "resume.exe",
                b"not a resume",
                content_type="application/octet-stream",
            )
            rejected = client.patch(
                f"/api/students/{self.student_profile.pk}/",
                {"resume": invalid_resume},
                format="multipart",
            )
            self.assertEqual(rejected.status_code, 400)
            self.assertIn("resume", rejected.data)

        forbidden = client.patch(
            f"/api/students/{self.student_profile.pk}/",
            {"enrollment_status": "inactive"},
        )
        self.assertEqual(forbidden.status_code, 400)
        self.assertIn("enrollment_status", forbidden.data)
        self.assertEqual(
            client.patch(
                f"/api/students/{self.other_student_profile.pk}/",
                {"phone": "555-0199"},
            ).status_code,
            404,
        )

    def test_trainer_profile_submission_and_hr_approval(self):
        trainer_client = self.client_for(self.trainer)
        visible = trainer_client.get("/api/trainers/")
        self.assertEqual(visible.status_code, 200)
        self.assertEqual(len(visible.data), 1)
        update = trainer_client.patch(
            f"/api/trainers/{self.trainer_profile.pk}/",
            {"skills": "Python, Django"},
        )
        self.assertEqual(update.status_code, 200, update.data)
        self.assertFalse(update.data["approved"])

        hr_client = self.client_for(self.hr)
        approval = hr_client.patch(
            f"/api/trainers/{self.trainer_profile.pk}/",
            {"approved": True},
        )
        self.assertEqual(approval.status_code, 200, approval.data)
        self.assertTrue(approval.data["approved"])

        student_data = self.client_for(self.student).get("/api/trainers/").data[0]
        self.assertEqual(student_data["full_name"], "Trainer One")
        self.assertNotIn("email", student_data)
        self.assertNotIn("phone", student_data)

    def test_trainer_can_submit_a_course_proposal_but_cannot_approve_it(self):
        client = self.client_for(self.trainer)
        response = client.post("/api/courses/", {
            "course_id": "DS-NEW",
            "name": "Data Systems",
            "duration": "2_months",
            "schedule_type": "weekly",
        })
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["status"], "proposed")
        attempt = client.patch(
            f"/api/courses/{response.data['id']}/",
            {"status": "active"},
        )
        self.assertEqual(attempt.status_code, 200, attempt.data)
        self.assertEqual(attempt.data["status"], "proposed")

    def test_login_issues_tokens_and_uses_the_database_role(self):
        response = APIClient().post("/api/auth/login/", {
            "email": self.manager.email,
            "password": "A-safe-test-password-123",
        })
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIn("access", response.data)
        role_injection = APIClient().post("/api/auth/login/", {
            "email": self.manager.email,
            "password": "A-safe-test-password-123",
            "role": "hr",
        })
        self.assertEqual(role_injection.status_code, 200)
        self.assertEqual(role_injection.data["user"]["role"], "manager")

    def test_common_login_uses_database_role_and_returns_generic_bad_password(self):
        response = APIClient().post("/api/auth/login/", {
            "email": self.hr.email,
            "password": "A-safe-test-password-123",
        })
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["user"]["role"], "hr")
        invalid = APIClient().post("/api/auth/login/", {
            "email": self.hr.email,
            "password": "not-the-password",
        })
        self.assertEqual(invalid.status_code, 401)
        self.assertEqual(invalid.data["detail"], "Invalid email or password.")
        inactive = User.objects.create_user(
            username="inactive",
            email="inactive@example.com",
            password="A-safe-test-password-123",
            is_active=False,
        )
        Profile.objects.create(user=inactive, role="trainer")
        blocked = APIClient().post("/api/auth/login/", {
            "email": inactive.email,
            "password": "A-safe-test-password-123",
        })
        self.assertEqual(blocked.status_code, 403)
        self.assertIn("inactive", blocked.data["detail"].lower())

    def test_public_registration_creates_only_a_student_account(self):
        response = APIClient().post("/api/auth/register/", {
            "full_name": "New Public Student",
            "email": "public-student@example.com",
            "password": "Safe-Unique-Phrase-482!",
            "confirm_password": "Safe-Unique-Phrase-482!",
            "role": "manager",
        })
        self.assertEqual(response.status_code, 200, response.data)
        user = User.objects.get(email="public-student@example.com")
        self.assertEqual(user.profile.role, "student")
        self.assertTrue(user.check_password("Safe-Unique-Phrase-482!"))
        self.assertTrue(StudentProfile.objects.filter(user=user).exists())
        self.assertEqual(response.data["user"]["role"], "student")

        mismatch = APIClient().post("/api/auth/register/", {
            "full_name": "Another Student",
            "email": "another-student@example.com",
            "password": "Safe-Unique-Phrase-482!",
            "confirm_password": "Different-Phrase-482!",
        })
        self.assertEqual(mismatch.status_code, 400)
        self.assertIn("confirm_password", mismatch.data)

        duplicate = APIClient().post("/api/auth/register/", {
            "full_name": "Duplicate Student",
            "email": user.email.upper(),
            "password": "Safe-Unique-Phrase-482!",
            "confirm_password": "Safe-Unique-Phrase-482!",
        })
        self.assertEqual(duplicate.status_code, 400)
        self.assertIn("email", duplicate.data)

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_password_reset_sends_link_and_resets_password(self):
        response = APIClient().post("/api/auth/password-reset/", {
            "email": self.student.email,
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        reset_url = mail.outbox[0].body.split("Use this link to reset your password: ", 1)[1].splitlines()[0]
        uid, token = reset_url.rstrip("/").split("/reset-password/", 1)[1].split("/")
        completed = APIClient().post("/api/auth/password-reset/confirm/", {
            "uid": uid,
            "token": token,
            "password": "Reset-Unique-Phrase-493!",
            "confirm_password": "Reset-Unique-Phrase-493!",
        })
        self.assertEqual(completed.status_code, 200, completed.data)
        self.student.refresh_from_db()
        self.assertTrue(self.student.check_password("Reset-Unique-Phrase-493!"))

    @override_settings(GOOGLE_OAUTH_CLIENT_ID="")
    def test_google_login_requires_oauth_configuration(self):
        response = APIClient().post("/api/auth/google/", {
            "credential": "not-a-real-google-token",
        })
        self.assertEqual(response.status_code, 400)
        self.assertIn("not configured", response.data["detail"])

    @patch("accounts.views._verified_google_claims")
    def test_google_login_creates_only_student_and_existing_accounts_require_link(
        self,
        verify_google,
    ):
        claims = {
            "sub": "google-subject-new-student",
            "email": "google-student@example.com",
            "email_verified": True,
            "name": "Google Student",
        }
        verify_google.return_value = claims
        client = APIClient()
        response = client.post("/api/auth/google/", {"credential": "verified-token"})
        self.assertEqual(response.status_code, 200, response.data)
        google_user = User.objects.get(email=claims["email"])
        self.assertEqual(google_user.profile.role, "student")
        self.assertFalse(google_user.has_usable_password())
        self.assertTrue(StudentProfile.objects.filter(user=google_user).exists())
        google_client = self.client_for(google_user)
        self.assertTrue(google_client.get("/api/dashboard/").data["google_linked"])

        claims["sub"] = "google-subject-manager-email"
        claims["email"] = self.manager.email
        existing_email = client.post(
            "/api/auth/google/",
            {"credential": "verified-token"},
        )
        self.assertEqual(existing_email.status_code, 400)

        claims["sub"] = "google-subject-linked-manager"
        link_client = self.client_for(self.manager)
        self.assertFalse(link_client.get("/api/dashboard/").data["google_linked"])
        linked = link_client.post(
            "/api/auth/google/link/",
            {"credential": "verified-token"},
        )
        self.assertEqual(linked.status_code, 200, linked.data)
        self.assertEqual(self.manager.google_identity.subject, claims["sub"])
        self.assertTrue(self.client_for(self.manager).get("/api/dashboard/").data["google_linked"])

        claims["email"] = "someone-else@example.com"
        mismatched_link = link_client.post(
            "/api/auth/google/link/",
            {"credential": "verified-token"},
        )
        self.assertEqual(mismatched_link.status_code, 400)

    def test_unauthenticated_requests_return_401(self):
        self.assertEqual(APIClient().get("/api/students/").status_code, 401)

    def test_course_delete_archives_enrolled_course(self):
        historical_attendance = Attendance.objects.create(
            student=self.student_profile,
            batch=self.batch,
            date=date(2026, 10, 10),
            status="present",
            marked_by=self.hr,
        )
        client = self.client_for(self.hr)
        response = client.delete(f"/api/courses/{self.course.pk}/")
        self.assertEqual(response.status_code, 204)
        self.course.refresh_from_db()
        self.assertEqual(self.course.status, "archived")
        self.assertTrue(self.course.enrollments.exists())
        self.assertTrue(Attendance.objects.filter(pk=historical_attendance.pk).exists())

    def test_unused_course_can_be_permanently_deleted(self):
        unused = Course.objects.create(
            course_id="UNUSED-01",
            name="Unused course",
            duration="weekly",
            schedule_type="weekly",
        )
        response = self.client_for(self.hr).delete(f"/api/courses/{unused.pk}/")
        self.assertEqual(response.status_code, 204)
        self.assertFalse(Course.objects.filter(pk=unused.pk).exists())

    def test_student_submits_own_assignment_and_trainer_can_review(self):
        assignment = Assignment.objects.create(
            batch=self.batch,
            title="Python exercise",
            description="Submit a small program.",
            due_date=date(2026, 10, 20),
            created_by=self.trainer,
        )
        student_client = self.client_for(self.student)
        submitted = student_client.post("/api/submissions/", {
            "assignment": assignment.pk,
            "content": "Completed exercise",
        })
        self.assertEqual(submitted.status_code, 201, submitted.data)
        self.assertEqual(submitted.data["student"], self.student_profile.pk)

        trainer_client = self.client_for(self.trainer)
        reviewed = trainer_client.patch(
            f"/api/submissions/{submitted.data['id']}/",
            {"score": "95.00", "feedback": "Well done"},
        )
        self.assertEqual(reviewed.status_code, 200, reviewed.data)
        self.assertEqual(reviewed.data["status"], "reviewed")
        self.assertEqual(
            StudentSubmission.objects.get(pk=submitted.data["id"]).student_id,
            self.student_profile.pk,
        )
