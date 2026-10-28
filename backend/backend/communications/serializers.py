from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import Message, TrainerFeedback

User = get_user_model()


class MessageCreateSerializer(serializers.Serializer):
    recipient_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        allow_empty=False,
        max_length=50,
    )
    subject = serializers.CharField(max_length=180, allow_blank=True, required=False)
    body = serializers.CharField(max_length=10000)

    def validate_recipient_ids(self, recipient_ids):
        if len(recipient_ids) != len(set(recipient_ids)):
            raise serializers.ValidationError("Recipients must be unique.")
        return recipient_ids

    def validate_body(self, body):
        body = body.strip()
        if not body:
            raise serializers.ValidationError("Enter a message.")
        return body

    def validate_subject(self, subject):
        return subject.strip()


class MessageReplySerializer(serializers.Serializer):
    body = serializers.CharField(max_length=10000)

    def validate_body(self, body):
        body = body.strip()
        if not body:
            raise serializers.ValidationError("Enter a message.")
        return body


class FeedbackCreateSerializer(serializers.Serializer):
    trainer = serializers.IntegerField(min_value=1)
    course = serializers.IntegerField(min_value=1)
    batch = serializers.IntegerField(min_value=1)
    overall_rating = serializers.IntegerField(min_value=1, max_value=5)
    teaching_rating = serializers.IntegerField(min_value=1, max_value=5)
    communication_rating = serializers.IntegerField(min_value=1, max_value=5)
    subject_knowledge_rating = serializers.IntegerField(min_value=1, max_value=5)
    comments = serializers.CharField(max_length=3000, allow_blank=True, required=False)

    def validate_comments(self, comments):
        return comments.strip()


def user_display_name(user):
    return user.get_full_name().strip() or user.username


def serialize_message(message, current_user):
    other_user = message.recipient if message.sender_id == current_user.pk else message.sender
    try:
        other_role = other_user.profile.role
    except AttributeError:
        other_role = ""
    return {
        "id": message.pk,
        "conversation": message.conversation_id,
        "sender_id": message.sender_id,
        "sender_name": user_display_name(message.sender),
        "sender_role": message.sender.profile.role,
        "recipient_id": message.recipient_id,
        "recipient_name": user_display_name(message.recipient),
        "recipient_role": message.recipient.profile.role,
        "other_user_id": other_user.pk,
        "other_user_name": user_display_name(other_user),
        "other_user_role": other_role,
        "subject": message.subject,
        "body": message.body,
        "created_at": message.created_at,
        "read_at": message.read_at,
        "is_read": message.read_at is not None,
        "is_mine": message.sender_id == current_user.pk,
    }


def serialize_feedback(feedback):
    return {
        "id": feedback.pk,
        "student_name": feedback.student.full_name,
        "trainer_id": feedback.trainer_id,
        "trainer_name": feedback.trainer.full_name,
        "course_id": feedback.course_id,
        "course_name": feedback.course.name,
        "batch_id": feedback.batch_id,
        "batch_name": feedback.batch.name,
        "overall_rating": feedback.overall_rating,
        "teaching_rating": feedback.teaching_rating,
        "communication_rating": feedback.communication_rating,
        "subject_knowledge_rating": feedback.subject_knowledge_rating,
        "comments": feedback.comments,
        "created_at": feedback.created_at,
    }


class ProfilePhotoSerializer(serializers.Serializer):
    photo = serializers.ImageField(validators=[])

    def validate_photo(self, photo):
        from accounts.validators import validate_profile_photo

        validate_profile_photo(photo)
        return photo
