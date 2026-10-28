from django.db import models
from django.contrib.auth.models import User


class TrainerProfile(models.Model):
    user = models.OneToOneField(
        User,
        on_delete=models.SET_NULL,
        related_name="trainer_profile",
        null=True,
        blank=True,
    )
    full_name = models.CharField(max_length=160)
    phone = models.CharField(max_length=30, blank=True)
    qualifications = models.TextField(blank=True)
    skills = models.TextField(blank=True)
    experience_years = models.PositiveSmallIntegerField(default=0)
    approved = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("full_name",)

    def __str__(self):
        return self.full_name
