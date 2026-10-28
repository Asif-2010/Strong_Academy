from django.db import models


class Attendance(models.Model):
    STATUS_CHOICES = [
        ("None", "None"),
        ("present", "Present"),
        ("absent", "Absent"),
        ("late", "Late"),
        ("leave", "Leave"),
    ]
    student = models.ForeignKey(
        "students.StudentProfile",
        on_delete=models.PROTECT,
        related_name="attendance_records",
    )
    batch = models.ForeignKey(
        "courses.Batch",
        on_delete=models.PROTECT,
        related_name="attendance",
    )
    date = models.DateField()
    status = models.CharField(max_length=10, choices=STATUS_CHOICES)
    marked_by = models.ForeignKey(
        "auth.User",
        on_delete=models.PROTECT,
        related_name="marked_attendance",
    )

    class Meta:
        ordering = ("-date", "student__full_name")
        constraints = [
            models.UniqueConstraint(
                fields=("student", "batch", "date"),
                name="unique_student_batch_attendance_date",
            ),
        ]

    def __str__(self):
        return f"{self.student} {self.date}: {self.get_status_display()}"
