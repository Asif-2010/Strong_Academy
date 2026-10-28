from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ObjectDoesNotExist
from django.core.mail import send_mail
from django.core import signing
from django.db import transaction
from django.db.models import Count, F, Prefetch, Q
from django.http import FileResponse, StreamingHttpResponse
import mimetypes
import re
from django.urls import reverse
from django.utils.encoding import force_bytes, force_str
from django.utils.dateparse import parse_date
from django.utils import timezone
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from django.utils.text import slugify
from urllib.parse import urlencode
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.views import APIView

from attendance.models import Attendance
from courses.models import Batch, Course
from students.models import StudentEnrollment, StudentProfile
from trainers.models import TrainerProfile
from learning.models import Assignment, StudyMaterial, StudentResult, StudentSubmission
from .models import AuditLog, PlacementDrive, PlacementRecord, PublicEnquiry
from .permissions import HasSSARole
from .serializers import (
    AttendanceSerializer,
    AssignmentSerializer,
    BatchSerializer,
    CourseSerializer,
    EnrollmentSerializer,
    HRStaffSerializer,
    HRAccountCreateSerializer,
    PlacementDriveSerializer,
    PlacementRecordSerializer,
    PublicCourseSerializer,
    PublicEnquirySerializer,
    PublicPlacementDriveSerializer,
    StudentSerializer,
    StudentResultSerializer,
    StudentSubmissionSerializer,
    StudyMaterialSerializer,
    StudentStudyMaterialSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    StudentRegistrationSerializer,
    TrainerSerializer,
    TrainerAccountCreateSerializer,
)
from .models import GoogleIdentity

User = get_user_model()


class StaffAccountCreateView(APIView):
    permission_classes = [IsAuthenticated, HasSSARole]
    role_permissions = {}
    serializer_class = None
    account_role = ""

    def post(self, request):
        serializer = self.serializer_class(
            data=request.data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            {
                "id": user.pk,
                "username": user.username,
                "full_name": user.get_full_name(),
                "email": user.email,
                "role": self.account_role,
                "is_active": user.is_active,
                "detail": f"{self.account_role.title()} account created successfully.",
            },
            status=status.HTTP_201_CREATED,
        )


class CreateHRAccountView(StaffAccountCreateView):
    serializer_class = HRAccountCreateSerializer
    account_role = "hr"
    role_permissions = {"POST": ("manager",)}


class CreateTrainerAccountView(StaffAccountCreateView):
    serializer_class = TrainerAccountCreateSerializer
    account_role = "trainer"
    role_permissions = {"POST": ("hr",)}


@api_view(["GET"])
@permission_classes([AllowAny])
def api_status(request):
    return Response({
        "success": True,
        "message": "SSA Django API is working!",
        "academy": "Sarva Sudaranaa Academy",
        "roles": ["manager", "hr", "trainer", "student"],
    })


@api_view(["POST"])
@permission_classes([AllowAny])
def login_api(request):
    identifier = request.data.get("email", "")
    password = request.data.get("password", "")
    if not all(isinstance(value, str) for value in (identifier, password)):
        return Response(
            {"detail": "Email and password must be strings."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    identifier = identifier.strip()
    if not identifier or not password:
        return Response(
            {"detail": "Email and password are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    student = StudentProfile.objects.select_related("user").filter(
        student_id__iexact=identifier
    ).first()
    account = student.user if student else User.objects.filter(
        email__iexact=identifier
    ).first()
    username = account.username if account else identifier
    authenticated_user = authenticate(
        request,
        username=username,
        password=password,
    )
    if authenticated_user is None:
        if account and not account.is_active and account.check_password(password):
            return Response(
                {"detail": "This account is inactive. Contact your academy administrator."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return Response(
            {"detail": "Invalid email or password."},
            status=status.HTTP_401_UNAUTHORIZED,
        )
    try:
        profile = authenticated_user.profile
    except ObjectDoesNotExist:
        return Response(
            {"detail": "No SSA role is assigned to this account."},
            status=status.HTTP_403_FORBIDDEN,
        )
    return _authenticated_response(authenticated_user, profile.role)


def _authenticated_response(user, role):
    refresh = RefreshToken.for_user(user)
    AuditLog.objects.create(
        actor=user,
        action="login",
        object_type="User",
        object_id=str(user.pk),
        changes={"role": role},
    )
    return Response({
        "message": "Login successful",
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "role": role,
        },
        "access": str(refresh.access_token),
        "refresh": str(refresh),
    })


@api_view(["POST"])
@permission_classes([AllowAny])
def register_student_api(request):
    serializer = StudentRegistrationSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = serializer.save()
    return _authenticated_response(user, "student")


@api_view(["POST"])
@permission_classes([AllowAny])
def password_reset_request_api(request):
    serializer = PasswordResetRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    email = serializer.validated_data["email"]
    user = User.objects.filter(email__iexact=email, is_active=True).first()
    if user:
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        reset_url = (
            f"{settings.FRONTEND_URL.rstrip('/')}/reset-password/{uid}/{token}"
        )
        send_mail(
            "Reset your SSA Academy password",
            f"Use this link to reset your password: {reset_url}\n"
            "If you did not request this, you can ignore this email.",
            settings.DEFAULT_FROM_EMAIL,
            [user.email],
            fail_silently=False,
        )
    return Response({
        "detail": "If an active account exists for that email, password reset instructions have been sent."
    })


@api_view(["POST"])
@permission_classes([AllowAny])
def password_reset_confirm_api(request):
    uid = request.data.get("uid", "") if isinstance(request.data, dict) else ""
    try:
        user_id = force_str(urlsafe_base64_decode(uid))
        user = User.objects.get(pk=user_id, is_active=True)
    except (TypeError, ValueError, OverflowError, User.DoesNotExist):
        raise ValidationError({"token": "This password reset link is invalid or expired."})
    serializer = PasswordResetConfirmSerializer(
        data=request.data,
        context={"user": user},
    )
    serializer.is_valid(raise_exception=True)
    if not default_token_generator.check_token(user, serializer.validated_data["token"]):
        raise ValidationError({"token": "This password reset link is invalid or expired."})
    user.set_password(serializer.validated_data["password"])
    user.save(update_fields=("password",))
    return Response({"detail": "Your password has been reset. You can now sign in."})


def _verified_google_claims(id_token):
    client_id = getattr(settings, "GOOGLE_OAUTH_CLIENT_ID", "")
    if not client_id:
        raise ValidationError({
            "detail": "Google sign-in is not configured. Contact the academy administrator."
        })
    from google.auth.exceptions import GoogleAuthError
    from google.auth.transport.requests import Request
    from google.oauth2 import id_token as google_id_token

    try:
        claims = google_id_token.verify_oauth2_token(
            id_token,
            Request(),
            audience=client_id,
        )
    except (ValueError, GoogleAuthError) as error:
        raise ValidationError({"credential": "Google sign-in could not be verified."}) from error
    if claims.get("email_verified") is not True or not claims.get("email") or not claims.get("sub"):
        raise ValidationError({
            "credential": "Google must provide a verified email address."
        })
    return claims


def _new_google_username(email):
    base = slugify(email.split("@", 1)[0])[:140] or "student"
    username = base
    suffix = 1
    while User.objects.filter(username=username).exists():
        suffix += 1
        username = f"{base}-{suffix}"
    return username


def _new_google_student_id():
    from uuid import uuid4

    student_id = f"SSA-{uuid4().hex[:12].upper()}"
    while StudentProfile.objects.filter(student_id__iexact=student_id).exists():
        student_id = f"SSA-{uuid4().hex[:12].upper()}"
    return student_id


@api_view(["POST"])
@permission_classes([AllowAny])
def google_login_api(request):
    credential = request.data.get("credential")
    if not isinstance(credential, str) or not credential:
        raise ValidationError({"credential": "A Google credential is required."})
    claims = _verified_google_claims(credential)
    email = claims["email"].strip().lower()
    identity = GoogleIdentity.objects.select_related("user__profile").filter(
        subject=claims["sub"]
    ).first()

    if identity:
        user = identity.user
        if not user.is_active:
            return Response(
                {"detail": "This account is inactive. Contact your academy administrator."},
                status=status.HTTP_403_FORBIDDEN,
            )
        identity.email = email
        identity.save(update_fields=("email",))
        return _authenticated_response(user, user.profile.role)

    if User.objects.filter(email__iexact=email).exists():
        raise ValidationError({
            "detail": "This email already has an account. Sign in with your password, then link Google from your account."
        })

    full_name = (claims.get("name") or email.split("@", 1)[0]).strip()[:160]
    with transaction.atomic():
        user = User.objects.create_user(
            username=_new_google_username(email),
            email=email,
            first_name=full_name[:150],
        )
        user.set_unusable_password()
        user.save(update_fields=("password",))
        from .models import Profile

        Profile.objects.create(user=user, role="student")
        StudentProfile.objects.create(
            user=user,
            student_id=_new_google_student_id(),
            full_name=full_name,
            email=email,
            joining_date=timezone.localdate(),
        )
        GoogleIdentity.objects.create(
            user=user,
            subject=claims["sub"],
            email=email,
        )
    return _authenticated_response(user, "student")


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def google_link_api(request):
    credential = request.data.get("credential")
    if not isinstance(credential, str) or not credential:
        raise ValidationError({"credential": "A Google credential is required."})
    claims = _verified_google_claims(credential)
    email = claims["email"].strip().lower()
    if email != request.user.email.strip().lower():
        raise ValidationError({
            "credential": "Sign in to Google using the verified email on this account."
        })
    if GoogleIdentity.objects.filter(subject=claims["sub"]).exclude(
        user=request.user
    ).exists():
        raise ValidationError({"credential": "This Google account is already linked."})
    GoogleIdentity.objects.update_or_create(
        user=request.user,
        defaults={"subject": claims["sub"], "email": email},
    )
    return Response({"detail": "Google account linked successfully."})


class SSAViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, HasSSARole]
    role_permissions = {}

    def perform_create(self, serializer):
        with transaction.atomic():
            instance = serializer.save()
            self.write_audit("create", instance)

    def perform_update(self, serializer):
        with transaction.atomic():
            instance = serializer.save()
            self.write_audit("update", instance)

    def perform_destroy(self, instance):
        with transaction.atomic():
            self.write_audit("delete", instance)
            instance.delete()

    def write_audit(self, action_name, instance):
        AuditLog.objects.create(
            actor=self.request.user,
            action=action_name,
            object_type=instance._meta.label,
            object_id=str(instance.pk),
            changes=dict(self.get_serializer(instance).data),
        )


class StudentViewSet(SSAViewSet):
    serializer_class = StudentSerializer
    role_permissions = {
        "list": ("manager", "hr", "trainer", "student"),
        "retrieve": ("manager", "hr", "trainer", "student"),
        "create": ("hr",),
        "update": ("hr", "student"),
        "partial_update": ("hr", "student"),
        "destroy": ("hr",),
        "resume": ("hr", "student"),
    }

    def get_queryset(self):
        role = self.request.user.profile.role
        queryset = StudentProfile.objects.select_related("user").prefetch_related(
            Prefetch(
                "enrollments",
                queryset=StudentEnrollment.objects.select_related(
                    "course", "batch"
                ).order_by("id"),
            ),
        ).annotate(
            attendance_count=Count("attendance_records", distinct=True),
            attendance_present=Count(
                "attendance_records",
                filter=Q(attendance_records__status__in=("present", "late")),
                distinct=True,
            ),
        )
        if role == "trainer":
            return queryset.filter(
                enrollments__batch__trainer__user=self.request.user
            ).distinct()
        if role == "student":
            return queryset.filter(user=self.request.user)
        return queryset

    @action(detail=True, methods=("get",))
    def resume(self, request, pk=None):
        student = self.get_object()
        if not student.resume:
            raise ValidationError({"detail": "This student has not uploaded a resume."})
        return FileResponse(
            student.resume.open("rb"),
            as_attachment=True,
            filename=student.resume.name.rsplit("/", 1)[-1],
        )

    def perform_destroy(self, instance):
        if instance.enrollments.exists() or instance.attendance_records.exists():
            with transaction.atomic():
                instance.enrollment_status = "inactive"
                instance.save(update_fields=("enrollment_status",))
                self.write_audit("deactivate", instance)
            return
        super().perform_destroy(instance)


class TrainerViewSet(SSAViewSet):
    serializer_class = TrainerSerializer
    role_permissions = {
        "list": ("manager", "hr", "trainer", "student"),
        "retrieve": ("manager", "hr", "trainer", "student"),
        "create": ("hr", "trainer"),
        "update": ("hr", "trainer"),
        "partial_update": ("hr", "trainer"),
        "destroy": ("hr",),
    }

    def get_queryset(self):
        role = self.request.user.profile.role
        queryset = TrainerProfile.objects.select_related("user").prefetch_related("courses")
        if role == "trainer":
            return queryset.filter(user=self.request.user)
        if role == "student":
            course_ids = StudentEnrollment.objects.filter(
                student__user=self.request.user
            ).values_list("course_id", flat=True)
            return queryset.filter(courses__id__in=course_ids).distinct()
        return queryset

    def perform_create(self, serializer):
        if self.request.user.profile.role == "trainer":
            if TrainerProfile.objects.filter(user=self.request.user).exists():
                raise PermissionDenied("A trainer profile already exists; update it instead.")
            with transaction.atomic():
                instance = serializer.save(user=self.request.user, approved=False)
                self.write_audit("submit", instance)
            return
        super().perform_create(serializer)

    def perform_update(self, serializer):
        if self.request.user.profile.role == "trainer":
            if serializer.instance.user_id != self.request.user.id:
                raise PermissionDenied("You may only update your own trainer profile.")
            if "approved" in self.request.data:
                raise PermissionDenied("Trainer approval is managed by HR.")
            with transaction.atomic():
                instance = serializer.save(approved=False)
                self.write_audit("submit", instance)
            return
        super().perform_update(serializer)


class CourseViewSet(SSAViewSet):
    serializer_class = CourseSerializer
    role_permissions = {
        "list": ("manager", "hr", "trainer", "student"),
        "retrieve": ("manager", "hr", "trainer", "student"),
        "create": ("hr", "trainer"),
        "update": ("hr", "trainer"),
        "partial_update": ("hr", "trainer"),
        "destroy": ("hr",),
    }

    def get_queryset(self):
        role = self.request.user.profile.role
        queryset = Course.objects.annotate(
            enrollment_count=Count("enrollments", distinct=True)
        ).prefetch_related("trainers")
        if role == "trainer":
            return queryset.filter(
                Q(trainers__user=self.request.user)
                | Q(proposed_by=self.request.user)
            ).distinct()
        if role == "student":
            enrolled = StudentEnrollment.objects.filter(
                student__user=self.request.user
            ).values_list("course_id", flat=True)
            return queryset.filter(Q(id__in=enrolled) | Q(status="active")).distinct()
        return queryset

    def perform_create(self, serializer):
        if self.request.user.profile.role == "trainer":
            try:
                trainer_profile = self.request.user.trainer_profile
            except ObjectDoesNotExist:
                raise ValidationError(
                    {"detail": "Submit your trainer profile before proposing a course."}
                )
            with transaction.atomic():
                instance = serializer.save(
                    proposed_by=self.request.user,
                    status="proposed",
                    trainers=[trainer_profile],
                )
                self.write_audit("propose", instance)
            return
        super().perform_create(serializer)

    def perform_destroy(self, instance):
        if instance.enrollments.exists() or instance.batches.exists():
            with transaction.atomic():
                instance.status = "archived"
                instance.save(update_fields=("status",))
                self.write_audit("archive", instance)
            return
        super().perform_destroy(instance)


class BatchViewSet(SSAViewSet):
    serializer_class = BatchSerializer
    role_permissions = {
        "list": ("manager", "hr", "trainer", "student"),
        "retrieve": ("manager", "hr", "trainer", "student"),
        "create": ("hr",),
        "update": ("hr",),
        "partial_update": ("hr",),
        "destroy": ("hr",),
    }

    def get_queryset(self):
        role = self.request.user.profile.role
        queryset = Batch.objects.select_related("course", "trainer")
        if role == "trainer":
            return queryset.filter(trainer__user=self.request.user)
        if role == "student":
            return queryset.filter(
                enrollments__student__user=self.request.user
            ).distinct()
        return queryset

    def perform_destroy(self, instance):
        if instance.enrollments.exists() or instance.attendance.exists():
            raise ValidationError(
                {"detail": "This batch has enrollment or attendance history and cannot be deleted."}
            )
        super().perform_destroy(instance)


class EnrollmentViewSet(SSAViewSet):
    serializer_class = EnrollmentSerializer
    role_permissions = {
        "list": ("manager", "hr", "trainer", "student"),
        "retrieve": ("manager", "hr", "trainer", "student"),
        "create": ("hr",),
        "update": ("hr",),
        "partial_update": ("hr",),
        "destroy": ("manager", "hr"),
    }

    def get_queryset(self):
        role = self.request.user.profile.role
        queryset = StudentEnrollment.objects.select_related(
            "student", "course", "batch"
        )
        if role == "trainer":
            return queryset.filter(batch__trainer__user=self.request.user)
        if role == "student":
            return queryset.filter(student__user=self.request.user)
        return queryset


class AttendanceViewSet(SSAViewSet):
    serializer_class = AttendanceSerializer
    role_permissions = {
        "list": ("manager", "hr", "trainer", "student"),
        "retrieve": ("manager", "hr", "trainer", "student"),
        "create": ("hr", "trainer"),
        "update": ("hr", "trainer"),
        "partial_update": ("hr", "trainer"),
        "destroy": ("hr",),
        "reports": ("manager", "hr"),
    }

    def get_queryset(self):
        role = self.request.user.profile.role
        queryset = Attendance.objects.select_related(
            "student", "batch__course", "marked_by"
        )
        if role == "trainer":
            queryset = queryset.filter(batch__trainer__user=self.request.user)
        elif role == "student":
            queryset = queryset.filter(student__user=self.request.user)
        date_from = self.request.query_params.get("date_from")
        date_to = self.request.query_params.get("date_to")
        batch_id = self.request.query_params.get("batch")
        course_id = self.request.query_params.get("course")
        if date_from:
            if not parse_date(date_from):
                raise ValidationError({"date_from": "Use YYYY-MM-DD format."})
            queryset = queryset.filter(date__gte=date_from)
        if date_to:
            if not parse_date(date_to):
                raise ValidationError({"date_to": "Use YYYY-MM-DD format."})
            queryset = queryset.filter(date__lte=date_to)
        if batch_id:
            queryset = queryset.filter(batch_id=batch_id)
        if course_id:
            queryset = queryset.filter(batch__course_id=course_id)
        return queryset

    @action(detail=False, methods=("get",))
    def reports(self, request):
        year = request.query_params.get("year")
        month = request.query_params.get("month")
        records = self.get_queryset()
        if year:
            if not year.isdigit() or not 2000 <= int(year) <= 9999:
                raise ValidationError({"year": "Enter a valid four-digit year."})
            records = records.filter(date__year=year)
        if month:
            if not month.isdigit() or not 1 <= int(month) <= 12:
                raise ValidationError({"month": "Month must be between 1 and 12."})
            records = records.filter(date__month=month)
        daily = list(
            records.values("date", "status")
            .annotate(count=Count("id"))
            .order_by("date", "status")
        )
        return Response({"total": records.count(), "daily": daily})


class LearningViewSet(SSAViewSet):
    model = None
    queryset = None

    def get_queryset(self):
        if self.queryset is not None:
            return self.queryset
        if self.model is None:
            raise NotImplementedError(
                "Subclasses of LearningViewSet must define a model or override get_queryset()."
            )
        return self.model.objects.all()


class StudyMaterialViewSet(LearningViewSet):
    serializer_class = StudyMaterialSerializer
    parser_classes = (MultiPartParser, FormParser, JSONParser)
    role_permissions = {
        "list": ("trainer",),
        "retrieve": ("trainer",),
        "create": ("trainer",),
        "destroy": ("trainer",),
        "download": ("trainer",),
    }

    def get_queryset(self):
        queryset = StudyMaterial.objects.filter(
            uploaded_by=self.request.user
        ).select_related("course", "batch", "uploaded_by")
        course_id = self.request.query_params.get("course")
        batch_id = self.request.query_params.get("batch")
        for name, value in (("course", course_id), ("batch", batch_id)):
            if value and not value.isdecimal():
                raise ValidationError({name: "Enter a valid ID."})
        if course_id:
            queryset = queryset.filter(course_id=int(course_id))
        if batch_id:
            queryset = queryset.filter(batch_id=int(batch_id))
        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(
                Q(title__icontains=search) | Q(description__icontains=search)
            )
        return queryset

    def create(self, request, *args, **kwargs):
        content_length = request.META.get("CONTENT_LENGTH", "")
        if (
            content_length.isdecimal()
            and int(content_length) > settings.STUDY_MATERIAL_MAX_REQUEST_SIZE
        ):
            raise ValidationError({
                "file": "Upload request exceeds the configured limit. "
                "A study material file may not exceed 50 MB."
            })
        return super().create(request, *args, **kwargs)

    def perform_destroy(self, instance):
        with transaction.atomic():
            self.write_audit("delete", instance)
            stored_file = instance.file
            instance.delete()
            transaction.on_commit(lambda: stored_file.delete(save=False))

    @action(detail=True, methods=("get",))
    def download(self, request, pk=None):
        instance = self.get_object()
        if not instance.file or not instance.file.storage.exists(instance.file.name):
            raise NotFound("The study material file is unavailable.")
        content_type = mimetypes.guess_type(instance.file.name)[0]
        try:
            file_handle = instance.file.open("rb")
        except OSError as error:
            raise NotFound("The study material file is unavailable.") from error
        response = FileResponse(
            file_handle,
            as_attachment=True,
            filename=instance.original_filename or instance.file.name.rsplit("/", 1)[-1],
            content_type=content_type or "application/octet-stream",
        )
        response["X-Content-Type-Options"] = "nosniff"
        return response


def student_study_materials_queryset(user):
    if not StudentProfile.objects.filter(
        user=user,
        enrollment_status="active",
    ).exists():
        return StudyMaterial.objects.none()
    return StudyMaterial.objects.filter(
        batch__enrollments__student__user=user,
        batch__enrollments__student__enrollment_status="active",
        batch__enrollments__status="active",
        batch__enrollments__course_id=F("batch__course_id"),
        course_id=F("batch__course_id"),
    ).select_related(
        "course", "batch", "uploaded_by"
    ).distinct()


class StudentStudyMaterialViewSet(LearningViewSet):
    serializer_class = StudentStudyMaterialSerializer
    role_permissions = {
        "list": ("student",),
        "retrieve": ("student",),
        "download": ("student",),
        "preview_link": ("student",),
    }

    def get_queryset(self):
        queryset = student_study_materials_queryset(self.request.user)
        for name in ("course", "batch"):
            value = self.request.query_params.get(name)
            if value:
                if not value.isdecimal():
                    raise ValidationError({name: "Enter a valid ID."})
                queryset = queryset.filter(**{f"{name}_id": int(value)})
        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(title__icontains=search)
        return queryset

    @action(detail=True, methods=("get",))
    def download(self, request, pk=None):
        material = self.get_object()
        if not material.file or not material.file.storage.exists(material.file.name):
            raise NotFound("The study material file is unavailable.")
        content_type = mimetypes.guess_type(material.file.name)[0]
        try:
            file_handle = material.file.open("rb")
        except OSError as error:
            raise NotFound("The study material file is unavailable.") from error
        response = FileResponse(
            file_handle,
            as_attachment=True,
            filename=material.original_filename or material.file.name.rsplit("/", 1)[-1],
            content_type=content_type or "application/octet-stream",
        )
        response["X-Content-Type-Options"] = "nosniff"
        response["Cache-Control"] = "private, no-store"
        return response

    @action(detail=True, methods=("get",), url_path="preview-link")
    def preview_link(self, request, pk=None):
        material = self.get_object()
        token = signing.dumps(
            {"user_id": request.user.pk, "material_id": material.pk},
            salt="learning.study-material-preview",
        )
        preview_url = request.build_absolute_uri(
            reverse("student-study-material-preview", kwargs={"pk": material.pk})
        )
        return Response({
            "url": f"{preview_url}?{urlencode({'token': token})}",
            "expires_in": 300,
        })


class StudentStudyMaterialPreviewView(APIView):
    authentication_classes = ()
    permission_classes = (AllowAny,)

    def get(self, request, pk):
        token = request.query_params.get("token", "")
        try:
            payload = signing.loads(
                token,
                salt="learning.study-material-preview",
                max_age=300,
            )
        except (signing.BadSignature, TypeError, ValueError):
            raise PermissionDenied("This preview link is invalid or has expired.")

        user_id = payload.get("user_id") if isinstance(payload, dict) else None
        material_id = payload.get("material_id") if isinstance(payload, dict) else None
        if type(user_id) is not int or type(material_id) is not int or material_id != pk:
            raise PermissionDenied("This preview link is invalid or has expired.")

        user = User.objects.filter(pk=user_id, is_active=True).first()
        try:
            is_student = user is not None and user.profile.role == "student"
        except ObjectDoesNotExist:
            is_student = False
        if not is_student:
            raise PermissionDenied("This preview link is invalid or has expired.")

        material = student_study_materials_queryset(user).filter(pk=pk).first()
        if material is None:
            raise PermissionDenied("You are no longer authorized to preview this material.")
        if not material.file or not material.file.storage.exists(material.file.name):
            raise NotFound("The study material file is unavailable.")

        filename = material.original_filename or material.file.name.rsplit("/", 1)[-1]
        content_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"
        file_handle = None
        try:
            file_handle = material.file.open("rb")
            file_size = material.file.size
            range_header = request.headers.get("Range", "")
            if range_header and file_handle.seekable():
                match = re.fullmatch(r"bytes=(\d*)-(\d*)", range_header.strip())
                if not match:
                    file_handle.close()
                    response = Response(status=416)
                    response["Content-Range"] = f"bytes */{file_size}"
                    return response
                start_text, end_text = match.groups()
                if any(len(value) > 20 for value in (start_text, end_text)):
                    file_handle.close()
                    response = Response(status=416)
                    response["Content-Range"] = f"bytes */{file_size}"
                    return response
                if not start_text and not end_text:
                    file_handle.close()
                    response = Response(status=416)
                    response["Content-Range"] = f"bytes */{file_size}"
                    return response
                if start_text:
                    start = int(start_text)
                    end = int(end_text) if end_text else file_size - 1
                else:
                    suffix_size = int(end_text)
                    start = max(file_size - suffix_size, 0)
                    end = file_size - 1
                if start >= file_size or start > end:
                    file_handle.close()
                    response = Response(status=416)
                    response["Content-Range"] = f"bytes */{file_size}"
                    return response
                end = min(end, file_size - 1)
                file_handle.seek(start)

                def stream_range():
                    remaining = end - start + 1
                    try:
                        while remaining:
                            chunk = file_handle.read(min(64 * 1024, remaining))
                            if not chunk:
                                break
                            remaining -= len(chunk)
                            yield chunk
                    finally:
                        file_handle.close()

                response = StreamingHttpResponse(
                    stream_range(),
                    status=206,
                    content_type=content_type,
                )
                response["Content-Length"] = str(end - start + 1)
                response["Content-Range"] = f"bytes {start}-{end}/{file_size}"
            else:
                response = FileResponse(
                    file_handle,
                    as_attachment=False,
                    filename=filename,
                    content_type=content_type,
                )
            response["Accept-Ranges"] = "bytes"
            response["Cache-Control"] = "private, no-store"
            response["Referrer-Policy"] = "no-referrer"
            response["X-Content-Type-Options"] = "nosniff"
            response["Content-Security-Policy"] = (
                "frame-ancestors " + " ".join(settings.CORS_ALLOWED_ORIGINS)
            )
            response.xframe_options_exempt = True
            return response
        except OSError:
            if file_handle is not None:
                file_handle.close()
            raise NotFound("The study material file is unavailable.")


class AssignmentViewSet(LearningViewSet):
    serializer_class = AssignmentSerializer
    role_permissions = {
        "list": ("manager", "hr", "trainer", "student"),
        "retrieve": ("manager", "hr", "trainer", "student"),
        "create": ("hr", "trainer"),
        "update": ("hr", "trainer"),
        "partial_update": ("hr", "trainer"),
        "destroy": ("hr", "trainer"),
    }

    def get_queryset(self):
        role = self.request.user.profile.role
        queryset = Assignment.objects.select_related("batch__course", "created_by")
        if role == "trainer":
            return queryset.filter(batch__trainer__user=self.request.user)
        if role == "student":
            return queryset.filter(
                batch__enrollments__student__user=self.request.user,
                batch__enrollments__status="active",
            ).distinct()
        return queryset

    def perform_update(self, serializer):
        if (
            self.request.user.profile.role == "trainer"
            and serializer.instance.created_by_id != self.request.user.id
        ):
            raise PermissionDenied("You may only update assignments you created.")
        super().perform_update(serializer)

    def perform_destroy(self, instance):
        if instance.submissions.exists():
            raise ValidationError(
                {"detail": "This assignment has student submissions and cannot be deleted."}
            )
        if (
            self.request.user.profile.role == "trainer"
            and instance.created_by_id != self.request.user.id
        ):
            raise PermissionDenied("You may only delete assignments you created.")
        super().perform_destroy(instance)


class StudentSubmissionViewSet(SSAViewSet):
    serializer_class = StudentSubmissionSerializer
    role_permissions = {
        "list": ("manager", "hr", "trainer", "student"),
        "retrieve": ("manager", "hr", "trainer", "student"),
        "create": ("student",),
        "update": ("hr", "trainer"),
        "partial_update": ("hr", "trainer"),
        "destroy": ("hr",),
    }

    def get_queryset(self):
        role = self.request.user.profile.role
        queryset = StudentSubmission.objects.select_related("student", "assignment")
        if role == "trainer":
            queryset = queryset.filter(
                assignment__batch__trainer__user=self.request.user
            )
        elif role == "student":
            queryset = queryset.filter(student__user=self.request.user)
        return queryset

    def perform_create(self, serializer):
        student = getattr(self.request.user, "student_profile", None)
        if not student:
            raise ValidationError({"detail": "No student profile is linked to this account."})
        assignment = serializer.validated_data["assignment"]
        if not StudentEnrollment.objects.filter(
            student=student,
            batch=assignment.batch,
            status="active",
        ).exists():
            raise PermissionDenied("You may only submit assignments for your active batches.")
        with transaction.atomic():
            instance = serializer.save(student=student)
            self.write_audit("submit", instance)

    def perform_update(self, serializer):
        if self.request.user.profile.role == "trainer":
            if serializer.instance.assignment.batch.trainer.user_id != self.request.user.id:
                raise PermissionDenied("You can only review submissions for assigned batches.")
            serializer.save(status="reviewed")
            self.write_audit("review", serializer.instance)
            return
        super().perform_update(serializer)

    def perform_destroy(self, instance):
        if self.request.user.profile.role == "hr":
            super().perform_destroy(instance)
            return
        raise PermissionDenied("Submissions cannot be deleted.")


class StudentResultViewSet(SSAViewSet):
    serializer_class = StudentResultSerializer
    role_permissions = {
        "list": ("manager", "hr", "trainer", "student"),
        "retrieve": ("manager", "hr", "trainer", "student"),
        "create": ("hr", "trainer"),
        "update": ("hr", "trainer"),
        "partial_update": ("hr", "trainer"),
        "destroy": ("hr",),
    }

    def get_queryset(self):
        role = self.request.user.profile.role
        queryset = StudentResult.objects.select_related("student", "batch")
        if role == "trainer":
            return queryset.filter(batch__trainer__user=self.request.user)
        if role == "student":
            return queryset.filter(student__user=self.request.user)
        return queryset

    def perform_create(self, serializer):
        if self.request.user.profile.role == "trainer":
            batch = serializer.validated_data["batch"]
            if not batch.trainer or batch.trainer.user_id != self.request.user.id:
                raise PermissionDenied("You can only record results for assigned batches.")
        with transaction.atomic():
            instance = serializer.save(recorded_by=self.request.user)
            self.write_audit("create", instance)

    def perform_update(self, serializer):
        if self.request.user.profile.role == "trainer":
            batch = serializer.validated_data.get("batch", serializer.instance.batch)
            if not batch.trainer or batch.trainer.user_id != self.request.user.id:
                raise PermissionDenied("You can only update results for assigned batches.")
        super().perform_update(serializer)


class HRStaffViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = HRStaffSerializer
    permission_classes = [IsAuthenticated, HasSSARole]
    role_permissions = {
        "list": ("manager", "hr"),
        "retrieve": ("manager", "hr"),
    }

    def get_queryset(self):
        return User.objects.filter(profile__role="hr").select_related(
            "profile", "hr_profile"
        )


class PlacementDriveViewSet(SSAViewSet):
    serializer_class = PlacementDriveSerializer
    role_permissions = {
        "list": ("manager", "hr", "trainer", "student"),
        "retrieve": ("manager", "hr", "trainer", "student"),
        "create": ("hr",),
        "update": ("hr",),
        "partial_update": ("hr",),
        "destroy": ("hr",),
    }

    def get_queryset(self):
        return PlacementDrive.objects.all()

    def perform_destroy(self, instance):
        if instance.records.exists():
            with transaction.atomic():
                instance.status = "cancelled"
                instance.save(update_fields=("status",))
                self.write_audit("cancel", instance)
            return
        super().perform_destroy(instance)


class PlacementRecordViewSet(SSAViewSet):
    serializer_class = PlacementRecordSerializer
    role_permissions = {
        "list": ("manager", "hr", "student"),
        "retrieve": ("manager", "hr", "student"),
        "create": ("hr",),
        "update": ("hr",),
        "partial_update": ("hr",),
        "destroy": ("hr",),
    }

    def get_queryset(self):
        queryset = PlacementRecord.objects.select_related("student", "drive")
        if self.request.user.profile.role == "student":
            return queryset.filter(student__user=self.request.user)
        return queryset


class PublicCourseListAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        courses = Course.objects.filter(status="active")
        serializer = PublicCourseSerializer(courses, many=True)
        return Response(serializer.data)


class PublicPlacementDriveListAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        drives = PlacementDrive.objects.filter(
            status="scheduled",
            date__gte=timezone.localdate(),
        )
        serializer = PublicPlacementDriveSerializer(drives, many=True)
        return Response(serializer.data)


class PublicEnquiryCreateAPIView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "public_enquiry"

    def post(self, request):
        serializer = PublicEnquirySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(
            {"detail": "Thank you. Your enquiry has been received."},
            status=status.HTTP_201_CREATED,
        )


@api_view(["GET"])
@permission_classes([IsAuthenticated, HasSSARole])
def dashboard_api(request):
    role = request.user.profile.role
    students = StudentProfile.objects.all()
    if role == "trainer":
        students = students.filter(enrollments__batch__trainer__user=request.user)
    elif role == "student":
        students = students.filter(user=request.user)
    stats = {
        "students": students.distinct().count(),
        "courses": Course.objects.count(),
        "batches": Batch.objects.count(),
    }
    if role in ("manager", "hr"):
        stats.update({
            "trainers": TrainerProfile.objects.count(),
            "today_attendance": Attendance.objects.filter(
                date=timezone.localdate()
            ).count(),
        })
    if role == "manager":
        stats["hr_staff"] = User.objects.filter(profile__role="hr").count()
    if role == "student":
        personal_attendance = Attendance.objects.filter(student__user=request.user)
        stats["today_attendance"] = personal_attendance.filter(
            date=timezone.localdate()
        ).count()
        eligible = personal_attendance.exclude(status="leave")
        eligible_total = eligible.count()
        stats["attendance_percentage"] = round(
            eligible.filter(status__in=("present", "late")).count()
            * 100 / eligible_total
        ) if eligible_total else 0
    return Response({
        "success": True,
        "username": request.user.username,
        "role": role,
        "google_linked": GoogleIdentity.objects.filter(user=request.user).exists(),
        "statistics": stats,
        "message": f"Welcome to the SSA {role.title()} Dashboard",
    })
