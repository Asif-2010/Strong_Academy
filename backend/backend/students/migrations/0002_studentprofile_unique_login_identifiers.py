from django.db import migrations, models
from django.db.models.functions import Lower


class Migration(migrations.Migration):

    dependencies = [
        ("students", "0001_initial"),
    ]

    operations = [
        migrations.AddConstraint(
            model_name="studentprofile",
            constraint=models.UniqueConstraint(
                Lower("student_id"),
                name="unique_student_profile_student_id_ci",
            ),
        ),
        migrations.AddConstraint(
            model_name="studentprofile",
            constraint=models.UniqueConstraint(
                Lower("email"),
                name="unique_student_profile_email_ci",
            ),
        ),
    ]
