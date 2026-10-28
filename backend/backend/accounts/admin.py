from django.contrib import admin
from .models import (
    AuditLog,
    HRProfile,
    PlacementDrive,
    PlacementRecord,
    Profile,
    PublicEnquiry,
)


@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "role")
    list_filter = ("role",)
    search_fields = ("user__username", "user__email")


@admin.register(HRProfile)
class HRProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "department", "job_title")
    search_fields = ("user__username", "user__email", "department")


@admin.register(PlacementDrive)
class PlacementDriveAdmin(admin.ModelAdmin):
    list_display = ("company", "title", "date", "status")
    list_filter = ("status", "date")
    search_fields = ("company", "title")


@admin.register(PlacementRecord)
class PlacementRecordAdmin(admin.ModelAdmin):
    list_display = ("student", "drive", "status", "interview_schedule")
    list_filter = ("status",)
    search_fields = ("student__full_name", "student__student_id")


@admin.register(PublicEnquiry)
class PublicEnquiryAdmin(admin.ModelAdmin):
    list_display = ("created_at", "enquiry_type", "name", "email", "phone")
    list_filter = ("enquiry_type", "created_at")
    search_fields = ("name", "email", "phone", "message")
    readonly_fields = ("created_at",)


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ("created_at", "actor", "action", "object_type", "object_id")
    list_filter = ("action", "object_type", "created_at")
    search_fields = ("actor__username", "object_type", "object_id")
    readonly_fields = (
        "actor", "action", "object_type", "object_id", "changes", "created_at"
    )