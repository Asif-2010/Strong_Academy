from django.conf import settings
from django.db import models
from django.db.models import Q


class Conversation(models.Model):
    participant_one = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="ssa_conversations_as_one",
    )
    participant_two = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="ssa_conversations_as_two",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("participant_one", "participant_two"),
                name="unique_ssa_conversation_participants",
            ),
            models.CheckConstraint(
                condition=~Q(participant_one=models.F("participant_two")),
                name="ssa_conversation_distinct_participants",
            ),
        ]
        ordering = ("-updated_at",)

    def __str__(self):
        return f"Conversation {self.pk}"


class Message(models.Model):
    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name="messages",
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="ssa_sent_messages",
    )
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="ssa_received_messages",
    )
    subject = models.CharField(max_length=180, blank=True)
    body = models.TextField(max_length=10000)
    created_at = models.DateTimeField(auto_now_add=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("created_at", "id")
        indexes = [
            models.Index(fields=("recipient", "read_at")),
            models.Index(fields=("conversation", "created_at")),
        ]

    def __str__(self):
        return f"Message {self.pk} in conversation {self.conversation_id}"


class TrainerFeedback(models.Model):
    student = models.ForeignKey(
        "students.StudentProfile",
        on_delete=models.CASCADE,
        related_name="trainer_feedback",
    )
    trainer = models.ForeignKey(
        "trainers.TrainerProfile",
        on_delete=models.PROTECT,
        related_name="student_feedback",
    )
    course = models.ForeignKey(
        "courses.Course",
        on_delete=models.PROTECT,
        related_name="trainer_feedback",
    )
    batch = models.ForeignKey(
        "courses.Batch",
        on_delete=models.PROTECT,
        related_name="trainer_feedback",
    )
    overall_rating = models.PositiveSmallIntegerField()
    teaching_rating = models.PositiveSmallIntegerField()
    communication_rating = models.PositiveSmallIntegerField()
    subject_knowledge_rating = models.PositiveSmallIntegerField()
    comments = models.TextField(max_length=3000, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=("student", "trainer", "batch"),
                name="unique_student_trainer_batch_feedback",
            ),
            *[
                models.CheckConstraint(
                    condition=Q(**{f"{field}__gte": 1, f"{field}__lte": 5}),
                    name=f"feedback_{field}_between_1_and_5",
                )
                for field in (
                    "overall_rating",
                    "teaching_rating",
                    "communication_rating",
                    "subject_knowledge_rating",
                )
            ],
        ]
        indexes = [
            models.Index(fields=("trainer", "created_at")),
            models.Index(fields=("course", "batch", "created_at")),
        ]

    def __str__(self):
        return f"Feedback for {self.trainer} from {self.student}"
