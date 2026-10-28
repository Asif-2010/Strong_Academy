from django.contrib import admin
from .models import Batch, Course


@admin.register(Course)
class CourseAdmin(admin.ModelAdmin):
    list_display = ("course_id", "name", "duration", "status")
    list_filter = ("status", "duration", "schedule_type")
    search_fields = ("course_id", "name")


@admin.register(Batch)
class BatchAdmin(admin.ModelAdmin):
    list_display = ("batch_id", "name", "course", "trainer", "start_date", "status")
    list_filter = ("status", "course")
    search_fields = ("batch_id", "name", "course__name")
