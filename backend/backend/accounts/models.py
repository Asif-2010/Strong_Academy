from django.db import models
from django.contrib.auth.models import User
from uuid import uuid4
from .validators import validate_profile_photo


def profile_photo_upload_to(instance, filename):
    extension = filename.rsplit(".", 1)[-1].lower()
    return f"profile_photos/{uuid4().hex}.{extension}"


class Profile(models.Model):
    ROLE_CHOICES = [
        ("manager", "Manager"),
        ("hr", "HR"),
        ("trainer", "Trainer"),
        ("student", "Student"),
    ]

    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="profile",
    )

    role = models.CharField(
        max_length=20,
        choices=ROLE_CHOICES,
    )
    photo = models.ImageField(
        upload_to=profile_photo_upload_to,
        blank=True,
        validators=[validate_profile_photo],
    )

    def __str__(self):
        return f"{self.user.username} - {self.role}"


class GoogleIdentity(models.Model):
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="google_identity",
    )
    subject = models.CharField(max_length=255, unique=True)
    email = models.EmailField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Google identity for {self.user.email}"


class HRProfile(models.Model):
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="hr_profile",
    )
    phone = models.CharField(max_length=30, blank=True)
    department = models.CharField(max_length=120, blank=True)
    job_title = models.CharField(max_length=120, blank=True)

    def __str__(self):
        return f"HR: {self.user.get_full_name() or self.user.username}"


class PlacementDrive(models.Model):
    STATUS_CHOICES = [
        ("None", "None"),
        ("scheduled", "Scheduled"),
        ("completed", "Completed"),
        ("cancelled", "Cancelled"),
    ]
    company = models.CharField(max_length=200)
    title = models.CharField(max_length=200)
    date = models.DateField()
    details = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="scheduled")

    class Meta:
        ordering = ("date", "company")

    def __str__(self):
        return f"{self.company} - {self.title}"


class PlacementRecord(models.Model):
    STATUS_CHOICES = [
        ("None", "None"),
        ("preparing", "Preparing"),
        ("applied", "Applied"),
        ("interview", "Interview"),
        ("placed", "Placed"),
        ("not_selected", "Not selected"),
    ]
    student = models.ForeignKey(
        "students.StudentProfile",
        on_delete=models.CASCADE,
        related_name="placement_records",
    )
    drive = models.ForeignKey(
        PlacementDrive,
        on_delete=models.PROTECT,
        related_name="records",
        null=True,
        blank=True,
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="preparing")
    interview_schedule = models.DateTimeField(null=True, blank=True)
    outcome = models.CharField(max_length=200, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ("student__full_name",)

    def __str__(self):
        return f"{self.student} - {self.get_status_display()}"


class PublicEnquiry(models.Model):
    ENQUIRY_TYPES = [
        ("None", "None"),
        ("course", "Course enquiry"),
        ("general", "General enquiry"),
        ("placement", "Placement enquiry"),
    ]

    name = models.CharField(max_length=120)
    email = models.EmailField()
    phone = models.CharField(max_length=30)
    enquiry_type = models.CharField(max_length=20, choices=ENQUIRY_TYPES)
    message = models.TextField(max_length=4000)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.get_enquiry_type_display()} from {self.name}"


class AuditLog(models.Model):
    actor = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name="ssa_audit_events",
    )
    action = models.CharField(max_length=20)
    object_type = models.CharField(max_length=100)
    object_id = models.CharField(max_length=64)
    changes = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.action} {self.object_type} {self.object_id}"