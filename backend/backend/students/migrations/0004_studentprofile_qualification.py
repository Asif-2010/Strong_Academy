from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("students", "0003_studentprofile_resume"),
    ]

    operations = [
        migrations.AddField(
            model_name="studentprofile",
            name="qualification",
            field=models.TextField(blank=True),
        ),
    ]
