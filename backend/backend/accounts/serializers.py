from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied
from uuid import uuid4

from attendance.models import Attendance
from accounts.models import Profile
from courses.models import Batch, Course
from students.models import StudentEnrollment, StudentProfile
from trainers.models import TrainerProfile
from learning.models import Assignment, StudyMaterial, StudentResult, StudentSubmission
from learning.validators import validate_study_material_file
from .models import PlacementDrive, PlacementRecord, PublicEnquiry
from accounts.models import HRProfile

User = get_user_model()


class StudentRegistrationSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=160)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    confirm_password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate_email(self, email):
        email = email.strip().lower()
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        if StudentProfile.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return email

    def validate(self, attrs):
        if attrs["password"] != attrs["confirm_password"]:
            raise serializers.ValidationError({
                "confirm_password": "Passwords do not match."
            })
        try:
            validate_password(
                attrs["password"],
                user=User(email=attrs["email"], first_name=attrs["full_name"]),
            )
        except DjangoValidationError as error:
            raise serializers.ValidationError({"password": list(error.messages)}) from error
        attrs["full_name"] = attrs["full_name"].strip()
        if not attrs["full_name"]:
            raise serializers.ValidationError({"full_name": "Enter your full name."})
        return attrs

    @staticmethod
    def _new_username(email):
        base = slugify(email.split("@", 1)[0])[:140] or "student"
        username = base
        suffix = 1
        while User.objects.filter(username=username).exists():
            suffix += 1
            username = f"{base}-{suffix}"
        return username

    @staticmethod
    def _new_student_id():
        student_id = f"SSA-{uuid4().hex[:12].upper()}"
        while StudentProfile.objects.filter(student_id__iexact=student_id).exists():
            student_id = f"SSA-{uuid4().hex[:12].upper()}"
        return student_id

    def create(self, validated_data):
        password = validated_data["password"]
        email = validated_data["email"]
        full_name = validated_data["full_name"]
        with transaction.atomic():
            user = User.objects.create_user(
                username=self._new_username(email),
                email=email,
                first_name=full_name[:150],
                password=password,
            )
            Profile.objects.create(user=user, role="student")
            StudentProfile.objects.create(
                user=user,
                student_id=self._new_student_id(),
                full_name=full_name,
                email=email,
                joining_date=timezone.localdate(),
            )
        return user


class StaffAccountCreateSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=160)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    confirm_password = serializers.CharField(write_only=True, trim_whitespace=False)
    phone = serializers.CharField(max_length=30, required=False, allow_blank=True)
    is_active = serializers.BooleanField(default=True)

    def validate(self, attrs):
        if "role" in self.initial_data:
            raise serializers.ValidationError({
                "role": "Account role is assigned by the server."
            })
        attrs["full_name"] = attrs["full_name"].strip()
        attrs["email"] = attrs["email"].strip().lower()
        if not attrs["full_name"]:
            raise serializers.ValidationError({"full_name": "Enter a full name."})
        if User.objects.filter(email__iexact=attrs["email"]).exists() or \
                StudentProfile.objects.filter(email__iexact=attrs["email"]).exists():
            raise serializers.ValidationError({
                "email": "An account with this email already exists."
            })
        if attrs["password"] != attrs["confirm_password"]:
            raise serializers.ValidationError({
                "confirm_password": "Passwords do not match."
            })
        try:
            validate_password(
                attrs["password"],
                user=User(email=attrs["email"], first_name=attrs["full_name"][:150]),
            )
        except DjangoValidationError as error:
            raise serializers.ValidationError({"password": list(error.messages)}) from error
        return attrs

    @staticmethod
    def create_user(attrs, role):
        email = attrs["email"]
        username_base = slugify(email.split("@", 1)[0])[:140] or role
        username = username_base
        suffix = 1
        while User.objects.filter(username=username).exists():
            suffix += 1
            username = f"{username_base}-{suffix}"
        first_name, _, last_name = attrs["full_name"].partition(" ")
        user = User.objects.create_user(
            username=username,
            email=email,
            password=attrs["password"],
            first_name=first_name[:150],
            last_name=last_name[:150],
            is_active=attrs["is_active"],
        )
        Profile.objects.create(user=user, role=role)
        return user


class HRAccountCreateSerializer(StaffAccountCreateSerializer):
    department = serializers.CharField(max_length=120, required=False, allow_blank=True)
    job_title = serializers.CharField(max_length=120, required=False, allow_blank=True)

    def create(self, validated_data):
        with transaction.atomic():
            user = self.create_user(validated_data, "hr")
            HRProfile.objects.create(
                user=user,
                phone=validated_data.get("phone", ""),
                department=validated_data.get("department", ""),
                job_title=validated_data.get("job_title", ""),
            )
        return user


class TrainerAccountCreateSerializer(StaffAccountCreateSerializer):
    qualifications = serializers.CharField(required=False, allow_blank=True)
    skills = serializers.CharField(required=False, allow_blank=True)
    experience_years = serializers.IntegerField(min_value=0, max_value=100, default=0)
    assigned_course = serializers.PrimaryKeyRelatedField(
        queryset=Course.objects.all(), required=False, allow_null=True
    )

    def create(self, validated_data):
        course = validated_data.pop("assigned_course", None)
        with transaction.atomic():
            user = self.create_user(validated_data, "trainer")
            trainer = TrainerProfile.objects.create(
                user=user,
                full_name=validated_data["full_name"],
                phone=validated_data.get("phone", ""),
                qualifications=validated_data.get("qualifications", ""),
                skills=validated_data.get("skills", ""),
                experience_years=validated_data.get("experience_years", 0),
                approved=False,
            )
            if course:
                course.trainers.add(trainer)
        return user


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, email):
        return email.strip().lower()


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    confirm_password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate(self, attrs):
        if attrs["password"] != attrs["confirm_password"]:
            raise serializers.ValidationError({
                "confirm_password": "Passwords do not match."
            })
        try:
            validate_password(attrs["password"], user=self.context.get("user"))
        except DjangoValidationError as error:
            raise serializers.ValidationError({"password": list(error.messages)}) from error
        return attrs


class StudentSerializer(serializers.ModelSerializer):
    attendance_percentage = serializers.SerializerMethodField()
    course = serializers.PrimaryKeyRelatedField(
        queryset=Course.objects.all(), write_only=True, required=False
    )
    batch = serializers.PrimaryKeyRelatedField(
        queryset=Batch.objects.all(), write_only=True, required=False
    )
    course_id = serializers.SerializerMethodField()
    batch_id = serializers.SerializerMethodField()
    course_name = serializers.SerializerMethodField()
    batch_name = serializers.SerializerMethodField()
    class Meta:
        model = StudentProfile
        fields = (
            "id", "student_id", "full_name", "email", "phone", "qualification", "resume", "joining_date",
            "enrollment_status", "attendance_percentage", "user", "course",
            "batch", "course_id", "batch_id", "course_name", "batch_name",
        )
        read_only_fields = ("user", "course_name", "batch_name")
        extra_kwargs = {
            "enrollment_status": {"required": False},
            "resume": {"use_url": False},
        }

    def get_fields(self):
        fields = super().get_fields()
        request = self.context.get("request")
        if request and request.user.is_authenticated and request.user.profile.role == "student":
            editable_fields = {"full_name", "email", "phone", "qualification", "resume"}
            for name, field in fields.items():
                if name not in editable_fields:
                    field.read_only = True
        return fields

    def validate(self, attrs):
        request = self.context.get("request")
        if "account_password" in self.initial_data:
            raise serializers.ValidationError({
                "account_password": "Student login accounts are not created from student records."
            })
        if request and request.user.profile.role == "student":
            editable_fields = {"full_name", "email", "phone", "qualification", "resume"}
            forbidden_fields = set(self.initial_data) - editable_fields
            if forbidden_fields:
                raise serializers.ValidationError({
                    name: "Students may only update their own contact details, qualification, and resume."
                    for name in forbidden_fields
                })
        if self.initial_data.get("enrollment_status") == "":
            raise serializers.ValidationError({
                "enrollment_status": "Select a valid enrollment status."
            })
        enrollment = self._primary_enrollment(self.instance) if self.instance else None
        course = attrs.get("course", enrollment.course if enrollment else None)
        batch = attrs.get("batch", enrollment.batch if enrollment else None)
        if bool(course) != bool(batch):
            raise serializers.ValidationError({
                "batch": "Select both a course and a batch to enroll the student."
            })
        if course and batch and batch.course_id != course.id:
            raise serializers.ValidationError({
                "batch": "The selected batch must belong to the selected course."
            })
        if enrollment and batch and StudentEnrollment.objects.filter(
            student=self.instance, batch=batch
        ).exclude(pk=enrollment.pk).exists():
            raise serializers.ValidationError({
                "batch": "The student is already enrolled in the selected batch."
            })
        return attrs

    def validate_resume(self, resume):
        if resume.size > 5 * 1024 * 1024:
            raise serializers.ValidationError("Resume must be 5 MB or smaller.")
        if not resume.name.lower().endswith((".pdf", ".doc", ".docx")):
            raise serializers.ValidationError("Upload a PDF, DOC, or DOCX resume.")
        return resume

    def validate_student_id(self, student_id):
        student_id = student_id.strip()
        profiles = StudentProfile.objects.filter(student_id__iexact=student_id)
        if self.instance:
            profiles = profiles.exclude(pk=self.instance.pk)
        if profiles.exists():
            raise serializers.ValidationError(
                "A student with this Student ID already exists."
            )
        return student_id

    def validate_email(self, email):
        email = email.strip().lower()
        profiles = StudentProfile.objects.filter(email__iexact=email)
        users = User.objects.filter(email__iexact=email)
        if self.instance:
            profiles = profiles.exclude(pk=self.instance.pk)
            users = users.exclude(pk=self.instance.user_id)
        if profiles.exists() or users.exists():
            raise serializers.ValidationError(
                "A student or account with this email already exists."
            )
        return email

    def create(self, validated_data):
        course = validated_data.pop("course", None)
        batch = validated_data.pop("batch", None)

        with transaction.atomic():
            student = super().create(validated_data)
            if course and batch:
                enrollment_status = {
                    "completed": "completed",
                    "inactive": "withdrawn",
                }.get(student.enrollment_status, "active")
                StudentEnrollment.objects.create(
                    student=student,
                    course=course,
                    batch=batch,
                    enrolled_on=student.joining_date,
                    status=enrollment_status,
                )
        return student

    def update(self, instance, validated_data):
        email = validated_data.get("email")
        full_name = validated_data.get("full_name")
        update_enrollment = "course" in validated_data or "batch" in validated_data
        course = validated_data.pop("course", None)
        batch = validated_data.pop("batch", None)
        with transaction.atomic():
            student = super().update(instance, validated_data)
            if update_enrollment:
                enrollment = self._primary_enrollment(instance)
                if enrollment:
                    enrollment.course = course or enrollment.course
                    enrollment.batch = batch or enrollment.batch
                    enrollment.save(update_fields=("course", "batch"))
                else:
                    enrollment_status = {
                        "completed": "completed",
                        "inactive": "withdrawn",
                    }.get(student.enrollment_status, "active")
                    StudentEnrollment.objects.create(
                        student=student,
                        course=course,
                        batch=batch,
                        enrolled_on=student.joining_date,
                        status=enrollment_status,
                    )
                if hasattr(instance, "_prefetched_objects_cache"):
                    instance._prefetched_objects_cache.pop("enrollments", None)
            if student.user_id and (email or full_name):
                if email:
                    student.user.email = email
                if full_name:
                    student.user.first_name = full_name[:150]
                update_fields = []
                if email:
                    update_fields.append("email")
                if full_name:
                    update_fields.append("first_name")
                student.user.save(update_fields=update_fields)
        return student

    @staticmethod
    def _enrollments(obj):
        return obj.enrollments.all()

    @classmethod
    def _primary_enrollment(cls, obj):
        if not obj:
            return None
        enrollments = cls._enrollments(obj)
        prefetched = getattr(obj, "_prefetched_objects_cache", {}).get("enrollments")
        if prefetched is not None:
            return next(iter(prefetched), None)
        return enrollments.order_by("id").first()

    def get_course_id(self, obj):
        enrollment = self._primary_enrollment(obj)
        return enrollment.course_id if enrollment else None

    def get_batch_id(self, obj):
        enrollment = self._primary_enrollment(obj)
        return enrollment.batch_id if enrollment else None

    def get_course_name(self, obj):
        return ", ".join(dict.fromkeys(
            enrollment.course.name for enrollment in self._enrollments(obj)
        ))

    def get_batch_name(self, obj):
        return ", ".join(dict.fromkeys(
            enrollment.batch.name for enrollment in self._enrollments(obj)
        ))

    def get_attendance_percentage(self, obj):
        total = getattr(obj, "attendance_count", None)
        present = getattr(obj, "attendance_present", None)
        if total is None or present is None:
            total = obj.attendance_records.count()
            present = obj.attendance_records.filter(status__in=("present", "late")).count()
        return round(present * 100 / total) if total else 0


class TrainerSerializer(serializers.ModelSerializer):
    email = serializers.SerializerMethodField()
    is_active = serializers.SerializerMethodField()
    course_names = serializers.SlugRelatedField(
        source="courses", many=True, read_only=True, slug_field="name"
    )
    assigned_course = serializers.PrimaryKeyRelatedField(
        queryset=Course.objects.all(), required=False, allow_null=True, write_only=True
    )

    class Meta:
        model = TrainerProfile
        fields = (
            "id", "user", "full_name", "email", "phone", "is_active", "qualifications",
            "skills", "experience_years", "approved", "course_names", "assigned_course",
            "updated_at",
        )
        read_only_fields = ("updated_at",)
        extra_kwargs = {"user": {"required": False, "allow_null": True}}

    def get_fields(self):
        fields = super().get_fields()
        role = self.context["request"].user.profile.role
        if role == "student":
            for name in ("user", "email", "phone", "is_active", "approved", "updated_at"):
                fields.pop(name, None)
        elif role == "trainer":
            fields["user"].read_only = True
            fields["approved"].read_only = True
            fields.pop("is_active", None)
        elif role != "hr":
            fields["approved"].read_only = True
        if role != "hr":
            fields.pop("assigned_course", None)
        return fields

    def get_email(self, obj):
        return obj.user.email if obj.user else None

    def get_is_active(self, obj):
        return obj.user.is_active if obj.user else None

    def validate_user(self, user):
        if user and (
            not hasattr(user, "profile") or user.profile.role != "trainer"
        ):
            raise serializers.ValidationError(
                "Only a trainer account can own a trainer profile."
            )
        return user

    def create(self, validated_data):
        assigned_course = validated_data.pop("assigned_course", None)
        trainer = super().create(validated_data)
        if assigned_course:
            trainer.courses.add(assigned_course)
        return trainer

    def update(self, instance, validated_data):
        assigned_course = validated_data.pop("assigned_course", serializers.empty)
        trainer = super().update(instance, validated_data)
        if assigned_course is not serializers.empty:
            if assigned_course is None:
                trainer.courses.clear()
            else:
                trainer.courses.add(assigned_course)
        return trainer

    def to_representation(self, instance):
        data = super().to_representation(instance)
        user = self.context["request"].user
        if user.profile.role == "student":
            data["course_names"] = list(
                instance.courses.filter(
                    enrollments__student__user=user
                ).values_list("name", flat=True).distinct()
            )
        return data


class CourseSerializer(serializers.ModelSerializer):
    trainer_names = serializers.SlugRelatedField(
        source="trainers", many=True, read_only=True, slug_field="full_name"
    )
    enrollment_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Course
        fields = (
            "id", "course_id", "name", "description", "duration", "schedule_type",
            "start_date", "end_date", "trainers", "trainer_names", "status",
            "placement_preparation", "proposed_by", "enrollment_count",
        )
        read_only_fields = ("proposed_by",)
        extra_kwargs = {
            "trainers": {"required": False},
            "duration": {"required": True},
            "schedule_type": {"required": True},
            "status": {"required": True},
        }

    def get_fields(self):
        fields = super().get_fields()
        if self.context["request"].user.profile.role == "trainer":
            fields["status"].read_only = True
        return fields

    def validate(self, attrs):
        user = self.context["request"].user
        if user.profile.role == "trainer" and self.instance:
            owns_proposal = self.instance.proposed_by_id == user.id
            is_assigned = self.instance.trainers.filter(user=user).exists()
            if not owns_proposal and not is_assigned:
                raise PermissionDenied("You may only update courses you manage.")
            if owns_proposal and self.instance.status != "proposed":
                raise PermissionDenied("Only a proposed course can be edited by its proposer.")
        if user.profile.role == "trainer" and "trainers" in attrs:
            own_profile = user.trainer_profile
            if any(trainer.pk != own_profile.pk for trainer in attrs["trainers"]):
                raise PermissionDenied("A trainer cannot assign other trainers to a course.")
        start = attrs.get("start_date", getattr(self.instance, "start_date", None))
        end = attrs.get("end_date", getattr(self.instance, "end_date", None))
        if start and end and end < start:
            raise serializers.ValidationError(
                {"end_date": "End date must not precede start date."}
            )
        return attrs

    def create(self, validated_data):
        if self.context["request"].user.profile.role == "trainer":
            validated_data["proposed_by"] = self.context["request"].user
            validated_data["status"] = "proposed"
            validated_data["trainers"] = [self.context["request"].user.trainer_profile]
        return super().create(validated_data)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if (
            self.context["request"].user.profile.role == "student"
            and not instance.enrollments.filter(
                student__user=self.context["request"].user
            ).exists()
        ):
            data.pop("trainers", None)
            data.pop("trainer_names", None)
        return data


class BatchSerializer(serializers.ModelSerializer):
    course_name = serializers.CharField(source="course.name", read_only=True)
    trainer_name = serializers.CharField(
        source="trainer.full_name", read_only=True, allow_null=True
    )

    class Meta:
        model = Batch
        fields = (
            "id", "batch_id", "name", "course", "course_name", "trainer",
            "trainer_name", "start_date", "end_date", "schedule", "status",
        )
        extra_kwargs = {"status": {"required": True}}

    def validate(self, attrs):
        start = attrs.get("start_date", getattr(self.instance, "start_date", None))
        end = attrs.get("end_date", getattr(self.instance, "end_date", None))
        if start and end and end < start:
            raise serializers.ValidationError(
                {"end_date": "End date must not precede start date."}
            )
        course = attrs.get("course", getattr(self.instance, "course", None))
        trainer = attrs.get("trainer", getattr(self.instance, "trainer", None))
        if course and trainer and not course.trainers.filter(pk=trainer.pk).exists():
            raise serializers.ValidationError(
                {"trainer": "Assign this trainer to the course first."}
            )
        return attrs


class EnrollmentSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    course_name = serializers.CharField(source="course.name", read_only=True)
    batch_name = serializers.CharField(source="batch.name", read_only=True)

    class Meta:
        model = StudentEnrollment
        fields = (
            "id", "student", "student_name", "course", "course_name", "batch",
            "batch_name", "enrolled_on", "status",
        )

    def validate(self, attrs):
        course = attrs.get("course", getattr(self.instance, "course", None))
        batch = attrs.get("batch", getattr(self.instance, "batch", None))
        if course and batch and batch.course_id != course.id:
            raise serializers.ValidationError(
                {"batch": "The selected batch must belong to the selected course."}
            )
        return attrs


class AttendanceSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    student_code = serializers.CharField(source="student.student_id", read_only=True)
    course = serializers.IntegerField(source="batch.course_id", read_only=True)
    course_name = serializers.CharField(source="batch.course.name", read_only=True)
    batch_name = serializers.CharField(source="batch.name", read_only=True)
    marked_by = serializers.PrimaryKeyRelatedField(read_only=True)
    marked_by_name = serializers.CharField(source="marked_by.username", read_only=True)

    class Meta:
        model = Attendance
        fields = (
            "id", "student", "student_code", "student_name", "course", "course_name",
            "batch", "batch_name", "date", "status", "marked_by", "marked_by_name",
        )

    def validate(self, attrs):
        user = self.context["request"].user
        batch = attrs.get("batch", getattr(self.instance, "batch", None))
        student = attrs.get("student", getattr(self.instance, "student", None))
        if batch and student:
            if user.profile.role == "trainer" and (
                not batch.trainer or batch.trainer.user_id != user.id
            ):
                raise PermissionDenied(
                    "You can only mark attendance for your assigned batches."
                )
            if not StudentEnrollment.objects.filter(
                student=student, batch=batch, status="active"
            ).exists():
                raise serializers.ValidationError(
                    {"student": "The student is not actively enrolled in this batch."}
                )
            duplicate = Attendance.objects.filter(
                student=student,
                batch=batch,
                date=attrs.get("date", getattr(self.instance, "date", None)),
            )
            if self.instance:
                duplicate = duplicate.exclude(pk=self.instance.pk)
            if duplicate.exists():
                raise serializers.ValidationError(
                    {"date": "Attendance already exists for this student, batch, and date."}
                )
        return attrs

    def create(self, validated_data):
        validated_data["marked_by"] = self.context["request"].user
        return super().create(validated_data)


class HRStaffSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    phone = serializers.SerializerMethodField()
    department = serializers.SerializerMethodField()
    job_title = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id", "username", "email", "full_name", "phone", "is_active",
            "department", "job_title",
        )
        read_only_fields = fields

    def get_full_name(self, obj):
        return obj.get_full_name() or obj.username

    def get_phone(self, obj):
        return obj.hr_profile.phone if hasattr(obj, "hr_profile") else ""

    def get_department(self, obj):
        return obj.hr_profile.department if hasattr(obj, "hr_profile") else ""

    def get_job_title(self, obj):
        return obj.hr_profile.job_title if hasattr(obj, "hr_profile") else ""


class PlacementDriveSerializer(serializers.ModelSerializer):
    class Meta:
        model = PlacementDrive
        fields = ("id", "company", "title", "date", "details", "status")


class PlacementRecordSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    drive_title = serializers.CharField(
        source="drive.title", read_only=True, allow_null=True
    )

    class Meta:
        model = PlacementRecord
        fields = (
            "id", "student", "student_name", "drive", "drive_title", "status",
            "interview_schedule", "outcome", "notes",
        )


class PublicCourseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Course
        fields = (
            "id", "course_id", "name", "description", "duration",
            "schedule_type", "start_date", "end_date", "placement_preparation",
        )


class PublicPlacementDriveSerializer(serializers.ModelSerializer):
    class Meta:
        model = PlacementDrive
        fields = ("id", "company", "title", "date")


class PublicEnquirySerializer(serializers.ModelSerializer):
    name = serializers.CharField(max_length=120, trim_whitespace=True)
    email = serializers.EmailField()
    phone = serializers.CharField(max_length=30, trim_whitespace=True)
    message = serializers.CharField(max_length=4000, trim_whitespace=True)

    class Meta:
        model = PublicEnquiry
        fields = ("name", "email", "phone", "enquiry_type", "message")

    def validate_name(self, value):
        if not value.strip():
            raise serializers.ValidationError("Enter your name.")
        return value.strip()

    def validate_email(self, value):
        return value.strip().lower()

    def validate_phone(self, value):
        if not value.strip():
            raise serializers.ValidationError("Enter your phone number.")
        return value.strip()

    def validate_message(self, value):
        if not value.strip():
            raise serializers.ValidationError("Enter a message.")
        return value.strip()


class AssignmentSerializer(serializers.ModelSerializer):
    batch_name = serializers.CharField(source="batch.name", read_only=True)
    course_name = serializers.CharField(source="batch.course.name", read_only=True)

    class Meta:
        model = Assignment
        fields = (
            "id", "batch", "batch_name", "course_name", "title", "description",
            "due_date", "created_by", "created_at",
        )
        read_only_fields = ("created_by", "created_at")

    def validate_batch(self, batch):
        user = self.context["request"].user
        if user.profile.role == "trainer" and (
            not batch.trainer or batch.trainer.user_id != user.id
        ):
            raise PermissionDenied("You can only assign work to your assigned batches.")
        return batch

    def create(self, validated_data):
        validated_data["created_by"] = self.context["request"].user
        return super().create(validated_data)


class StudentSubmissionSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    assignment_title = serializers.CharField(source="assignment.title", read_only=True)

    class Meta:
        model = StudentSubmission
        fields = (
            "id", "assignment", "assignment_title", "student", "student_name",
            "content", "submitted_at", "status", "score", "feedback",
        )
        read_only_fields = (
            "student", "submitted_at", "score", "feedback", "status"
        )

    def get_fields(self):
        fields = super().get_fields()
        role = self.context["request"].user.profile.role
        if role == "trainer":
            for name in (
                "assignment", "assignment_title", "student", "student_name",
                "content", "submitted_at",
            ):
                fields[name].read_only = True
            fields["score"].read_only = False
            fields["feedback"].read_only = False
            fields["status"].read_only = False
        elif role == "hr":
            fields["student"].read_only = True
            fields["score"].read_only = False
            fields["feedback"].read_only = False
            fields["status"].read_only = False
        return fields


class StudentResultSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    batch_name = serializers.CharField(source="batch.name", read_only=True)

    class Meta:
        model = StudentResult
        fields = (
            "id", "student", "student_name", "batch", "batch_name", "title",
            "score", "maximum_score", "grade", "feedback", "recorded_on", "recorded_by",
        )
        read_only_fields = ("recorded_by",)

    def validate(self, attrs):
        student = attrs.get("student", getattr(self.instance, "student", None))
        batch = attrs.get("batch", getattr(self.instance, "batch", None))
        if student and batch and not StudentEnrollment.objects.filter(
            student=student, batch=batch
        ).exists():
            raise serializers.ValidationError(
                {"student": "The student must be enrolled in the result's batch."}
            )
        score = attrs.get("score", getattr(self.instance, "score", None))
        maximum = attrs.get(
            "maximum_score", getattr(self.instance, "maximum_score", None)
        )
        if score is not None and maximum is not None and score > maximum:
            raise serializers.ValidationError(
                {"score": "Score cannot exceed the maximum score."}
            )
        return attrs


class StudyMaterialSerializer(serializers.ModelSerializer):
    course_name = serializers.CharField(source="course.name", read_only=True)
    batch_name = serializers.CharField(source="batch.name", read_only=True)
    trainer_name = serializers.SerializerMethodField()
    file_type = serializers.SerializerMethodField()
    original_filename = serializers.SerializerMethodField()
    file = serializers.FileField(write_only=True)

    class Meta:
        model = StudyMaterial
        fields = (
            "id", "title", "description", "file", "course", "course_name",
            "batch", "batch_name", "uploaded_by", "trainer_name",
            "original_filename", "file_size", "file_type", "uploaded_at",
        )
        read_only_fields = (
            "uploaded_by", "trainer_name", "original_filename", "file_size",
            "uploaded_at",
        )

    def get_file_type(self, instance):
        return instance.file.name.rsplit(".", 1)[-1].upper()

    def get_trainer_name(self, instance):
        trainer = getattr(instance.uploaded_by, "trainer_profile", None)
        return trainer.full_name if trainer else (
            instance.uploaded_by.get_full_name() or instance.uploaded_by.username
        )

    def get_original_filename(self, instance):
        return instance.original_filename or instance.file.name.rsplit("/", 1)[-1]

    def validate_file(self, uploaded_file):
        try:
            validate_study_material_file(uploaded_file)
        except DjangoValidationError as error:
            raise serializers.ValidationError(error.messages) from error
        return uploaded_file

    def validate_title(self, title):
        title = title.strip()
        if not title:
            raise serializers.ValidationError("Enter a material title.")
        return title

    def validate(self, attrs):
        request = self.context["request"]
        try:
            trainer_profile = request.user.trainer_profile
        except TrainerProfile.DoesNotExist as error:
            raise PermissionDenied(
                "A trainer profile is required to upload study materials."
            ) from error

        course = attrs.get("course", getattr(self.instance, "course", None))
        batch = attrs.get("batch", getattr(self.instance, "batch", None))
        if course and batch and batch.course_id != course.pk:
            raise serializers.ValidationError({
                "batch": "Select a batch that belongs to the selected course."
            })
        if batch and batch.trainer_id != trainer_profile.pk:
            raise PermissionDenied(
                "You may only upload materials to batches assigned to you."
            )
        return attrs

    def create(self, validated_data):
        uploaded_file = validated_data["file"]
        return StudyMaterial.objects.create(
            **validated_data,
            uploaded_by=self.context["request"].user,
            original_filename=uploaded_file.name.replace("\\", "/").rsplit("/", 1)[-1][:255],
            file_size=uploaded_file.size,
        )


class StudentStudyMaterialSerializer(serializers.ModelSerializer):
    course_name = serializers.CharField(source="course.name", read_only=True)
    batch_name = serializers.CharField(source="batch.name", read_only=True)
    trainer_name = serializers.SerializerMethodField()
    file_type = serializers.SerializerMethodField()
    original_filename = serializers.SerializerMethodField()

    class Meta:
        model = StudyMaterial
        fields = (
            "id", "title", "description", "course", "course_name", "batch",
            "batch_name", "trainer_name", "original_filename", "file_size",
            "file_type", "uploaded_at",
        )
        read_only_fields = fields

    def get_file_type(self, instance):
        return instance.file.name.rsplit(".", 1)[-1].upper()

    def get_trainer_name(self, instance):
        trainer = getattr(instance.uploaded_by, "trainer_profile", None)
        return trainer.full_name if trainer else (
            instance.uploaded_by.get_full_name() or instance.uploaded_by.username
        )

    def get_original_filename(self, instance):
        return instance.original_filename or instance.file.name.rsplit("/", 1)[-1]
