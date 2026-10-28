
from django.core.exceptions import ObjectDoesNotExist
from rest_framework.permissions import BasePermission


class HasSSARole(BasePermission):
    message = "You do not have permission to access this SSA resource."

    ACTION_METHODS = {
        "list": "GET",
        "retrieve": "GET",
        "create": "POST",
        "update": "PUT",
        "partial_update": "PATCH",
        "destroy": "DELETE",
    }

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False

        try:
            role = request.user.profile.role
        except (AttributeError, ObjectDoesNotExist):
            return False

        permissions = getattr(view, "role_permissions", {})
        action = getattr(view, "action", None)
        method = self.ACTION_METHODS.get(action, request.method)
        allowed_roles = permissions.get(action, permissions.get(method, ()))
        if not allowed_roles and not permissions:
            allowed_roles = ("manager", "hr", "trainer", "student")

        return role in allowed_roles
