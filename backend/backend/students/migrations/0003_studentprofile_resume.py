from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("students", "0002_studentprofile_unique_login_identifiers"),
    ]

    operations = [
        migrations.AddField(
            model_name="studentprofile",
            name="resume",
            field=models.FileField(blank=True, upload_to="student_resumes/"),
        ),
    ]
