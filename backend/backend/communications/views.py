from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.db.models import Avg, Count, Q
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from mimetypes import guess_type
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.reverse import reverse
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Profile
from accounts.permissions import HasSSARole
from courses.models import Batch, Course
from students.models import StudentEnrollment, StudentProfile
from trainers.models import TrainerProfile
from .models import Conversation, Message, TrainerFeedback
from .serializers import (
    FeedbackCreateSerializer,
    MessageCreateSerializer,
    MessageReplySerializer,
    ProfilePhotoSerializer,
    serialize_feedback,
    serialize_message,
    user_display_name,
)

User = get_user_model()
ALL_ROLES = ("manager", "hr", "trainer", "student")


def permitted_recipient_queryset(user):
    role = user.profile.role
    if role == "manager":
        recipient_roles = ("hr", "trainer", "student")
        users = User.objects.filter(profile__role__in=recipient_roles, is_active=True)
    elif role == "hr":
        users = User.objects.filter(profile__role__in=("trainer", "student"), is_active=True)
    elif role == "trainer":
        student_ids = StudentEnrollment.objects.filter(
            batch__trainer__user=user,
            status="active",
            student__user__is_active=True,
        ).values_list("student__user_id", flat=True)
        users = User.objects.filter(pk__in=student_ids, profile__role="student")
    else:
        users = User.objects.none()
    return users.select_related("profile").order_by("first_name", "last_name", "username")


def get_conversation_or_404(user, conversation_id):
    return get_object_or_404(
        Conversation.objects.filter(
            Q(participant_one=user) | Q(participant_two=user)
        ).select_related("participant_one", "participant_two"),
        pk=conversation_id,
    )


def other_participant(conversation, user):
    return (
        conversation.participant_two
        if conversation.participant_one_id == user.pk
        else conversation.participant_one
    )


def canonical_conversation(user, recipient):
    first, second = sorted((user, recipient), key=lambda item: item.pk)
    return Conversation.objects.get_or_create(
        participant_one=first,
        participant_two=second,
    )[0]


class MessageRecipientsView(APIView):
    permission_classes = [IsAuthenticated, HasSSARole]
    role_permissions = {"GET": ALL_ROLES}

    def get(self, request):
        recipients = permitted_recipient_queryset(request.user)
        return Response([
            {
                "id": recipient.pk,
                "name": user_display_name(recipient),
                "role": recipient.profile.role,
            }
            for recipient in recipients
        ])


class MessageConversationsView(APIView):
    permission_classes = [IsAuthenticated, HasSSARole]
    role_permissions = {"GET": ALL_ROLES}

    def get(self, request):
        conversations = Conversation.objects.filter(
            Q(participant_one=request.user) | Q(participant_two=request.user)
        )
        search = request.query_params.get("search", "").strip()
        if len(search) > 100:
            raise ValidationError({"search": "Search text cannot exceed 100 characters."})
        if search:
            conversations = conversations.filter(
                Q(messages__subject__icontains=search)
                | Q(messages__body__icontains=search)
            ).distinct()
        participant_role = request.query_params.get("role")
        if participant_role:
            if participant_role not in ALL_ROLES:
                raise ValidationError({"role": "Select a valid role filter."})
            conversations = conversations.filter(
                Q(participant_one=request.user, participant_two__profile__role=participant_role)
                | Q(participant_two=request.user, participant_one__profile__role=participant_role)
            )
        conversations = conversations.order_by("-updated_at")
        data = []
        for conversation in conversations:
            last_message = conversation.messages.select_related(
                "sender__profile", "recipient__profile"
            ).order_by("-created_at", "-id").first()
            if last_message is None:
                continue
            peer = other_participant(conversation, request.user)
            data.append({
                "id": conversation.pk,
                "participant_id": peer.pk,
                "participant_name": user_display_name(peer),
                "participant_role": peer.profile.role,
                "updated_at": conversation.updated_at,
                "unread_count": conversation.messages.filter(
                    recipient=request.user,
                    read_at__isnull=True,
                ).count(),
                "latest_message": serialize_message(last_message, request.user),
            })
        return Response(data)


class MessageConversationView(APIView):
    permission_classes = [IsAuthenticated, HasSSARole]
    role_permissions = {"GET": ALL_ROLES, "POST": ALL_ROLES}

    def get(self, request, conversation_id):
        conversation = get_conversation_or_404(request.user, conversation_id)
        now = timezone.now()
        conversation.messages.filter(
            recipient=request.user,
            read_at__isnull=True,
        ).update(read_at=now)
        messages = conversation.messages.select_related(
            "sender__profile", "recipient__profile"
        ).order_by("created_at", "id")
        return Response([serialize_message(item, request.user) for item in messages])

    def post(self, request, conversation_id):
        conversation = get_conversation_or_404(request.user, conversation_id)
        serializer = MessageReplySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        recipient = other_participant(conversation, request.user)
        latest = conversation.messages.order_by("-created_at").first()
        message = Message.objects.create(
            conversation=conversation,
            sender=request.user,
            recipient=recipient,
            subject=latest.subject if latest else "",
            body=serializer.validated_data["body"],
        )
        conversation.save(update_fields=("updated_at",))
        return Response(
            serialize_message(message, request.user),
            status=status.HTTP_201_CREATED,
        )


class SendMessageView(APIView):
    permission_classes = [IsAuthenticated, HasSSARole]
    role_permissions = {
        "POST": ("manager", "hr", "trainer"),
    }

    def post(self, request):
        serializer = MessageCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        recipients = list(permitted_recipient_queryset(request.user).filter(
            pk__in=serializer.validated_data["recipient_ids"]
        ))
        if len(recipients) != len(serializer.validated_data["recipient_ids"]):
            raise PermissionDenied(
                "One or more selected recipients are not permitted for your role."
            )

        subject = serializer.validated_data.get("subject", "")
        body = serializer.validated_data["body"]
        created = []
        with transaction.atomic():
            for recipient in recipients:
                conversation = canonical_conversation(request.user, recipient)
                message = Message.objects.create(
                    conversation=conversation,
                    sender=request.user,
                    recipient=recipient,
                    subject=subject,
                    body=body,
                )
                conversation.save(update_fields=("updated_at",))
                created.append(message)
        return Response(
            [serialize_message(item, request.user) for item in created],
            status=status.HTTP_201_CREATED,
        )


class UnreadMessageCountView(APIView):
    permission_classes = [IsAuthenticated, HasSSARole]
    role_permissions = {"GET": ALL_ROLES}

    def get(self, request):
        count = Message.objects.filter(
            recipient=request.user,
            read_at__isnull=True,
        ).count()
        return Response({"unread_count": count})


class TrainerFeedbackOptionsView(APIView):
    permission_classes = [IsAuthenticated, HasSSARole]
    role_permissions = {"GET": ("student",)}

    def get(self, request):
        student = get_object_or_404(StudentProfile, user=request.user)
        enrollments = StudentEnrollment.objects.filter(
            student=student,
        ).exclude(status="withdrawn").select_related(
            "course", "batch", "batch__trainer"
        ).prefetch_related("course__trainers")
        options = []
        for enrollment in enrollments:
            trainers = TrainerProfile.objects.filter(
                Q(pk=enrollment.batch.trainer_id)
                | Q(courses=enrollment.course)
            ).distinct().order_by("full_name")
            for trainer in trainers:
                options.append({
                    "trainer": trainer.pk,
                    "trainer_name": trainer.full_name,
                    "course": enrollment.course_id,
                    "course_name": enrollment.course.name,
                    "batch": enrollment.batch_id,
                    "batch_name": enrollment.batch.name,
                    "already_submitted": TrainerFeedback.objects.filter(
                        student=student,
                        trainer=trainer,
                        batch=enrollment.batch,
                    ).exists(),
                })
        return Response(options)


class TrainerFeedbackView(APIView):
    permission_classes = [IsAuthenticated, HasSSARole]
    role_permissions = {
        "GET": ("manager", "hr", "student"),
        "POST": ("student",),
    }

    def get(self, request):
        queryset = TrainerFeedback.objects.select_related(
            "student", "trainer", "course", "batch"
        )
        if request.user.profile.role == "student":
            queryset = queryset.filter(student__user=request.user)
        else:
            queryset = self._filter_feedback(queryset, request)
        return Response([serialize_feedback(item) for item in queryset])

    def post(self, request):
        serializer = FeedbackCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        student = get_object_or_404(StudentProfile, user=request.user)
        trainer = get_object_or_404(TrainerProfile, pk=values["trainer"])
        course = get_object_or_404(Course, pk=values["course"])
        batch = get_object_or_404(Batch, pk=values["batch"], course=course)
        eligible = StudentEnrollment.objects.filter(
            student=student,
            course=course,
            batch=batch,
        ).exclude(status="withdrawn").exists()
        assigned = (
            batch.trainer_id == trainer.pk
            or course.trainers.filter(pk=trainer.pk).exists()
        )
        if not eligible or not assigned:
            raise PermissionDenied(
                "Feedback is available only for trainers assigned to your enrolled course or batch."
            )
        try:
            with transaction.atomic():
                feedback = TrainerFeedback.objects.create(
                    student=student,
                    trainer=trainer,
                    course=course,
                    batch=batch,
                    overall_rating=values["overall_rating"],
                    teaching_rating=values["teaching_rating"],
                    communication_rating=values["communication_rating"],
                    subject_knowledge_rating=values["subject_knowledge_rating"],
                    comments=values.get("comments", ""),
                )
        except IntegrityError as error:
            raise ValidationError({
                "detail": "You have already submitted feedback for this trainer and batch."
            }) from error
        return Response(serialize_feedback(feedback), status=status.HTTP_201_CREATED)

    @staticmethod
    def _filter_feedback(queryset, request):
        fields = {
            "trainer": "trainer_id",
            "course": "course_id",
            "batch": "batch_id",
            "rating": "overall_rating",
        }
        for query_param, field in fields.items():
            value = request.query_params.get(query_param)
            if value:
                try:
                    parsed_value = int(value)
                except (TypeError, ValueError) as error:
                    raise ValidationError({query_param: "Enter a valid numeric filter."}) from error
                queryset = queryset.filter(**{field: parsed_value})
        date_from = request.query_params.get("date_from")
        date_to = request.query_params.get("date_to")
        if date_from:
            parsed_date = parse_date(date_from)
            if parsed_date is None:
                raise ValidationError({"date_from": "Enter a valid date."})
            queryset = queryset.filter(created_at__date__gte=parsed_date)
        if date_to:
            parsed_date = parse_date(date_to)
            if parsed_date is None:
                raise ValidationError({"date_to": "Enter a valid date."})
            queryset = queryset.filter(created_at__date__lte=parsed_date)
        return queryset


class TrainerFeedbackSummaryView(APIView):
    permission_classes = [IsAuthenticated, HasSSARole]
    role_permissions = {"GET": ("manager", "hr")}

    def get(self, request):
        queryset = TrainerFeedbackView._filter_feedback(
            TrainerFeedback.objects.all(), request
        )
        aggregate = queryset.aggregate(
            review_count=Count("id"),
            overall_average=Avg("overall_rating"),
            teaching_average=Avg("teaching_rating"),
            communication_average=Avg("communication_rating"),
            subject_knowledge_average=Avg("subject_knowledge_rating"),
        )
        trainer_rows = queryset.values(
            "trainer_id", "trainer__full_name"
        ).annotate(
            review_count=Count("id"),
            overall_average=Avg("overall_rating"),
            teaching_average=Avg("teaching_rating"),
            communication_average=Avg("communication_rating"),
            subject_knowledge_average=Avg("subject_knowledge_rating"),
        ).order_by("trainer__full_name")
        available_filters = {
            "trainers": list(
                TrainerFeedback.objects.values(
                    "trainer_id", "trainer__full_name"
                ).distinct().order_by("trainer__full_name")
            ),
            "courses": list(
                TrainerFeedback.objects.values(
                    "course_id", "course__name"
                ).distinct().order_by("course__name")
            ),
            "batches": list(
                TrainerFeedback.objects.values(
                    "batch_id", "batch__name"
                ).distinct().order_by("batch__name")
            ),
        }
        return Response({
            **{
                key: round(value, 2) if value is not None else None
                for key, value in aggregate.items()
            },
            "trainers": [
                {
                    **{
                        key: value
                        for key, value in row.items()
                        if key in ("trainer_id", "trainer__full_name", "review_count")
                    },
                    "trainer_name": row["trainer__full_name"],
                    **{
                        key: round(row[key], 2) if row[key] is not None else None
                        for key in (
                            "overall_average",
                            "teaching_average",
                            "communication_average",
                            "subject_knowledge_average",
                        )
                    },
                }
                for row in trainer_rows
            ],
            "available_filters": available_filters,
        })


class ProfilePhotoView(APIView):
    permission_classes = [IsAuthenticated, HasSSARole]
    parser_classes = [MultiPartParser, FormParser]
    role_permissions = {"GET": ALL_ROLES, "POST": ALL_ROLES}

    def get(self, request):
        profile = request.user.profile
        if not profile.photo:
            return Response(status=status.HTTP_404_NOT_FOUND)
        response = FileResponse(
            profile.photo.open("rb"),
            content_type=guess_type(profile.photo.name)[0] or "application/octet-stream",
        )
        response["Cache-Control"] = "private, no-store"
        response["X-Content-Type-Options"] = "nosniff"
        return response

    def post(self, request):
        profile = request.user.profile
        serializer = ProfilePhotoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        old_name = profile.photo.name if profile.photo else None
        photo = serializer.validated_data["photo"]
        profile.photo = photo
        profile.save(update_fields=("photo",))
        if old_name and old_name != profile.photo.name:
            profile.photo.storage.delete(old_name)
        return Response({
            "detail": "Profile picture updated.",
            "profile": {
                "id": request.user.pk,
                "username": request.user.username,
                "email": request.user.email,
                "role": profile.role,
                "photo_url": reverse("profile-photo", request=request),
            },
        })
