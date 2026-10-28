
from django.urls import path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    AttendanceViewSet,
    AssignmentViewSet,
    BatchViewSet,
    CourseViewSet,
    CreateHRAccountView,
    CreateTrainerAccountView,
    EnrollmentViewSet,
    HRStaffViewSet,
    PlacementDriveViewSet,
    PlacementRecordViewSet,
    PublicCourseListAPIView,
    PublicEnquiryCreateAPIView,
    PublicPlacementDriveListAPIView,
    StudentViewSet,
    StudentResultViewSet,
    StudentSubmissionViewSet,
    StudentStudyMaterialPreviewView,
    StudentStudyMaterialViewSet,
    StudyMaterialViewSet,
    TrainerViewSet,
    api_status,
    dashboard_api,
    google_link_api,
    google_login_api,
    login_api,
    password_reset_confirm_api,
    password_reset_request_api,
    register_student_api,
)
from communications.views import (
    MessageConversationView,
    MessageConversationsView,
    MessageRecipientsView,
    ProfilePhotoView,
    SendMessageView,
    TrainerFeedbackOptionsView,
    TrainerFeedbackSummaryView,
    TrainerFeedbackView,
    UnreadMessageCountView,
)

router = DefaultRouter()
router.register("students", StudentViewSet, basename="student")
router.register("trainers", TrainerViewSet, basename="trainer")
router.register("courses", CourseViewSet, basename="course")
router.register("batches", BatchViewSet, basename="batch")
router.register("enrollments", EnrollmentViewSet, basename="enrollment")
router.register("attendance", AttendanceViewSet, basename="attendance")
router.register("assignments", AssignmentViewSet, basename="assignment")
router.register("submissions", StudentSubmissionViewSet, basename="submission")
router.register("results", StudentResultViewSet, basename="result")
router.register("study-materials", StudyMaterialViewSet, basename="study-material")
router.register("materials", StudentStudyMaterialViewSet, basename="student-study-material")
router.register("hr-staff", HRStaffViewSet, basename="hr-staff")
router.register("placements/drives", PlacementDriveViewSet, basename="placement-drive")
router.register("placements/records", PlacementRecordViewSet, basename="placement-record")

urlpatterns = [
    path("status/", api_status, name="api-status"),
    path("public/courses/", PublicCourseListAPIView.as_view(), name="public-courses"),
    path(
        "public/placement-drives/",
        PublicPlacementDriveListAPIView.as_view(),
        name="public-placement-drives",
    ),
    path(
        "public/enquiries/",
        PublicEnquiryCreateAPIView.as_view(),
        name="public-enquiry-create",
    ),
    path("staff/hr-accounts/", CreateHRAccountView.as_view(), name="create-hr-account"),
    path("staff/trainer-accounts/", CreateTrainerAccountView.as_view(), name="create-trainer-account"),
    path("auth/login/", login_api, name="login-api"),
    path("auth/token/refresh/", TokenRefreshView.as_view(), name="token-refresh"),
    path("auth/register/", register_student_api, name="register-api"),
    path("auth/google/", google_login_api, name="google-login-api"),
    path("auth/google/link/", google_link_api, name="google-link-api"),
    path("auth/password-reset/", password_reset_request_api, name="password-reset-api"),
    path(
        "auth/password-reset/confirm/",
        password_reset_confirm_api,
        name="password-reset-confirm-api",
    ),
    path("dashboard/", dashboard_api, name="dashboard-api"),
    path("profile/photo/", ProfilePhotoView.as_view(), name="profile-photo"),
    path("messages/recipients/", MessageRecipientsView.as_view(), name="message-recipients"),
    path("messages/conversations/", MessageConversationsView.as_view(), name="message-conversations"),
    path(
        "messages/conversations/<int:conversation_id>/",
        MessageConversationView.as_view(),
        name="message-conversation",
    ),
    path("messages/send/", SendMessageView.as_view(), name="message-send"),
    path("messages/unread-count/", UnreadMessageCountView.as_view(), name="message-unread-count"),
    path(
        "trainer-feedback/options/",
        TrainerFeedbackOptionsView.as_view(),
        name="trainer-feedback-options",
    ),
    path("trainer-feedback/summary/", TrainerFeedbackSummaryView.as_view(), name="trainer-feedback-summary"),
    path("trainer-feedback/", TrainerFeedbackView.as_view(), name="trainer-feedback"),
    path(
        "materials/<int:pk>/preview/",
        StudentStudyMaterialPreviewView.as_view(),
        name="student-study-material-preview",
    ),
] + router.urls
