from django.db import models


class Course(models.Model):
    DURATION_CHOICES = [
        ("weekly", "Weekly"),
        ("weekday", "Weekday"),
        ("2_months", "2 months"),
        ("3_months", "3 months"),
        ("4_months", "4 months"),
    ]
    SCHEDULE_CHOICES = [
        ("weekly", "Weekly"),
        ("weekday", "Weekday"),
    ]
    STATUS_CHOICES = [
        ("None", "None"),
        ("proposed", "Proposed"),
        ("active", "Active"),
        ("inactive", "Inactive"),
        ("archived", "Archived"),
    ]
    course_id = models.CharField(max_length=40, unique=True)
    name = models.CharField(max_length=180)
    description = models.TextField(blank=True)
    duration = models.CharField(max_length=20, choices=DURATION_CHOICES)
    schedule_type = models.CharField(max_length=20, choices=SCHEDULE_CHOICES)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    trainers = models.ManyToManyField(
        "trainers.TrainerProfile",
        related_name="courses",
        blank=True,
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="active")
    placement_preparation = models.TextField(blank=True)
    proposed_by = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="proposed_ssa_courses",
    )

    class Meta:
        ordering = ("name",)

    def __str__(self):
        return f"{self.course_id} - {self.name}"

    def delete(self, *args, **kwargs):
        if self.enrollments.exists() or self.batches.exists():
            raise models.ProtectedError(
                "Courses with enrollments or attendance must be archived.",
                self,
            )
        return super().delete(*args, **kwargs)


class Batch(models.Model):
    STATUS_CHOICES = [
        ("None", "None"),
        ("upcoming", "Upcoming"),
        ("active", "Active"),
        ("completed", "Completed"),
        ("inactive", "Inactive"),
    ]
    batch_id = models.CharField(max_length=40, unique=True)
    name = models.CharField(max_length=180)
    course = models.ForeignKey(Course, on_delete=models.PROTECT, related_name="batches")
    trainer = models.ForeignKey(
        "trainers.TrainerProfile",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="batches",
    )
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    schedule = models.CharField(max_length=180, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="upcoming")

    class Meta:
        ordering = ("start_date", "name")

    def __str__(self):
        return f"{self.batch_id} - {self.name}"
