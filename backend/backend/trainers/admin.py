from django.contrib import admin
from .models import TrainerProfile


@admin.register(TrainerProfile)
class TrainerProfileAdmin(admin.ModelAdmin):
    list_display = ("full_name", "user", "experience_years", "approved")
    list_filter = ("approved",)
    search_fields = ("full_name", "user__email", "skills")
