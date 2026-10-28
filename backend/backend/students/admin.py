from django.contrib import admin
from .models import StudentEnrollment, StudentProfile


@admin.register(StudentProfile)
class StudentProfileAdmin(admin.ModelAdmin):
    list_display = ("student_id", "full_name", "email", "enrollment_status")
    list_filter = ("enrollment_status",)
    search_fields = ("student_id", "full_name", "email")


@admin.register(StudentEnrollment)
class StudentEnrollmentAdmin(admin.ModelAdmin):
    list_display = ("student", "course", "batch", "enrolled_on", "status")
    list_filter = ("status", "course")
    search_fields = ("student__student_id", "student__full_name", "batch__name")
