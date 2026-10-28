from pathlib import PurePosixPath
from uuid import uuid4

from django.conf import settings
from django.db import models


def study_material_upload_path(instance, filename):
    extension = PurePosixPath(filename.replace("\\", "/")).suffix.lower()
    if len(extension) > 10 or not extension[1:].isalnum():
        extension = ""
    return f"study_materials/{uuid4().hex}{extension}"


class Assignment(models.Model):
    batch = models.ForeignKey(
        "courses.Batch",
        on_delete=models.PROTECT,
        related_name="assignments",
    )
    title = models.CharField(max_length=180)
    description = models.TextField(blank=True)
    due_date = models.DateField()
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_ssa_assignments",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("due_date", "title")

    def __str__(self):
        return f"{self.title} - {self.batch.name}"


class StudentSubmission(models.Model):
    STATUS_CHOICES = [
        ("submitted", "Submitted"),
        ("reviewed", "Reviewed"),
    ]
    assignment = models.ForeignKey(
        Assignment,
        on_delete=models.PROTECT,
        related_name="submissions",
    )
    student = models.ForeignKey(
        "students.StudentProfile",
        on_delete=models.PROTECT,
        related_name="submissions",
    )
    content = models.TextField()
    submitted_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="submitted")
    score = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    feedback = models.TextField(blank=True)

    class Meta:
        ordering = ("-submitted_at",)
        constraints = [
            models.UniqueConstraint(
                fields=("assignment", "student"),
                name="unique_student_assignment_submission",
            ),
        ]

    def __str__(self):
        return f"{self.student} - {self.assignment.title}"


class StudentResult(models.Model):
    student = models.ForeignKey(
        "students.StudentProfile",
        on_delete=models.PROTECT,
        related_name="results",
    )
    batch = models.ForeignKey(
        "courses.Batch",
        on_delete=models.PROTECT,
        related_name="results",
    )
    title = models.CharField(max_length=180)
    score = models.DecimalField(max_digits=6, decimal_places=2)
    maximum_score = models.DecimalField(max_digits=6, decimal_places=2, default=100)
    grade = models.CharField(max_length=20, blank=True)
    feedback = models.TextField(blank=True)
    recorded_on = models.DateField()
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="recorded_ssa_results",
    )

    class Meta:
        ordering = ("-recorded_on", "student__full_name")

    def __str__(self):
        return f"{self.student} - {self.title}"


class StudyMaterial(models.Model):
    title = models.CharField(max_length=180)
    description = models.TextField(blank=True)
    file = models.FileField(upload_to=study_material_upload_path)
    original_filename = models.CharField(max_length=255, blank=True, default="")
    course = models.ForeignKey(
        "courses.Course",
        on_delete=models.PROTECT,
        related_name="study_materials",
    )
    batch = models.ForeignKey(
        "courses.Batch",
        on_delete=models.PROTECT,
        related_name="study_materials",
    )
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="uploaded_study_materials",
    )
    file_size = models.PositiveBigIntegerField()
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-uploaded_at", "title")

    def __str__(self):
        return self.title
