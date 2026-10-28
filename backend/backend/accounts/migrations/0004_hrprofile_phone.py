from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0003_googleidentity"),
    ]

    operations = [
        migrations.AddField(
            model_name="hrprofile",
            name="phone",
            field=models.CharField(blank=True, max_length=30),
        ),
    ]
