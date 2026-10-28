from datetime import date

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from accounts.models import HRProfile, Profile
from students.models import StudentProfile
from trainers.models import TrainerProfile


DEMO_ACCOUNTS = (
    {
        "username": "hr",
        "email": "hr@ssa.com",
        "password": "SSA123",
        "role": "hr",
        "name": "HR Admin",
    },
    {
        "username": "employee",
        "email": "employee@ssa.com",
        "password": "SSA123",
        "role": "trainer",
        "name": "SSA Trainer",
    },
    {
        "username": "student1",
        "email": "student1@ssa.com",
        "password": "Student",
        "role": "student",
        "name": "Student One",
    },
)


class Command(BaseCommand):
    help = "Create or reset the local SSA demo login accounts."

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("Demo accounts can only be seeded when DEBUG=True.")

        user_model = get_user_model()
        with transaction.atomic():
            for account in DEMO_ACCOUNTS:
                user = user_model.objects.filter(email__iexact=account["email"]).first()
                if user is None:
                    user = user_model.objects.filter(username=account["username"]).first()
                if user and user.email and user.email.lower() != account["email"]:
                    raise CommandError(
                        f"Username {account['username']} is already used by another email."
                    )

                if user is None:
                    user = user_model(username=account["username"])
                user.email = account["email"]
                user.first_name = account["name"]
                user.is_active = True
                user.set_password(account["password"])
                user.save()

                profile, _ = Profile.objects.get_or_create(
                    user=user,
                    defaults={"role": account["role"]},
                )
                if profile.role != account["role"]:
                    raise CommandError(
                        f"{account['email']} already has the conflicting role "
                        f"'{profile.role}'."
                    )

                if account["role"] == "hr":
                    HRProfile.objects.get_or_create(user=user)
                elif account["role"] == "trainer":
                    TrainerProfile.objects.get_or_create(
                        user=user,
                        defaults={"full_name": account["name"]},
                    )
                elif account["role"] == "student":
                    StudentProfile.objects.get_or_create(
                        user=user,
                        defaults={
                            "student_id": "SSA-STUDENT-001",
                            "full_name": account["name"],
                            "email": account["email"],
                            "joining_date": date.today(),
                        },
                    )

                self.stdout.write(
                    self.style.SUCCESS(f"Ready: {account['email']} ({account['role']})")
                )
