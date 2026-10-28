from django.contrib import admin

from .models import Assignment, StudentResult, StudentSubmission


@admin.register(Assignment)
class AssignmentAdmin(admin.ModelAdmin):
    list_display = ("title", "batch", "due_date", "created_by")
    list_filter = ("due_date", "batch__course")
    search_fields = ("title", "batch__name")


@admin.register(StudentSubmission)
class StudentSubmissionAdmin(admin.ModelAdmin):
    list_display = ("assignment", "student", "submitted_at", "status", "score")
    list_filter = ("status", "submitted_at")
    search_fields = ("assignment__title", "student__full_name")


@admin.register(StudentResult)
class StudentResultAdmin(admin.ModelAdmin):
    list_display = ("student", "batch", "title", "score", "maximum_score", "grade", "recorded_on")
    list_filter = ("grade", "recorded_on", "batch__course")
    search_fields = ("student__full_name", "title")
