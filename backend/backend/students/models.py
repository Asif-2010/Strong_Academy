from django.db import models
from django.db.models.functions import Lower
from django.contrib.auth.models import User


class StudentProfile(models.Model):
    ENROLLMENT_CHOICES = [
        ("active", "Active"),
        ("completed", "Completed"),
        ("inactive", "Inactive"),
    ]
    user = models.OneToOneField(
        User,
        on_delete=models.SET_NULL,
        related_name="student_profile",
        null=True,
        blank=True,
    )
    student_id = models.CharField(max_length=40, unique=True)
    full_name = models.CharField(max_length=160)
    email = models.EmailField()
    phone = models.CharField(max_length=30, blank=True)
    qualification = models.TextField(blank=True)
    resume = models.FileField(upload_to="student_resumes/", blank=True)
    joining_date = models.DateField()
    enrollment_status = models.CharField(
        max_length=20,
        choices=ENROLLMENT_CHOICES,
        default="active",
    )

    class Meta:
        ordering = ("full_name",)
        constraints = [
            models.UniqueConstraint(
                Lower("student_id"),
                name="unique_student_profile_student_id_ci",
            ),
            models.UniqueConstraint(
                Lower("email"),
                name="unique_student_profile_email_ci",
            ),
        ]

    def __str__(self):
        return f"{self.student_id} - {self.full_name}"


class StudentEnrollment(models.Model):
    STATUS_CHOICES = [
        ("active", "Active"),
        ("completed", "Completed"),
        ("withdrawn", "Withdrawn"),
    ]
    student = models.ForeignKey(
        StudentProfile,
        on_delete=models.PROTECT,
        related_name="enrollments",
    )
    course = models.ForeignKey(
        "courses.Course",
        on_delete=models.PROTECT,
        related_name="enrollments",
    )
    batch = models.ForeignKey(
        "courses.Batch",
        on_delete=models.PROTECT,
        related_name="enrollments",
    )
    enrolled_on = models.DateField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="active")

    class Meta:
        ordering = ("student__full_name",)
        constraints = [
            models.UniqueConstraint(
                fields=("student", "batch"),
                name="unique_student_batch_enrollment",
            ),
        ]

    def __str__(self):
        return f"{self.student} - {self.batch}"
