from django.contrib import admin
from .models import Attendance


@admin.register(Attendance)
class AttendanceAdmin(admin.ModelAdmin):
    list_display = ("student", "batch", "date", "status", "marked_by")
    list_filter = ("status", "date", "batch")
    search_fields = ("student__student_id", "student__full_name", "batch__name")
