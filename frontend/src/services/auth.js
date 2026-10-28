export const dashboardPaths = {
  manager: "/manager/dashboard",
  hr: "/hr/dashboard",
  trainer: "/trainer/dashboard",
  student: "/student/dashboard",
};

export function saveAuthentication(data) {
  localStorage.setItem("ssa_access", data.access);
  localStorage.setItem("ssa_refresh", data.refresh);
  localStorage.setItem("ssa_user", JSON.stringify(data.user));
}

export function clearAuthentication() {
  localStorage.removeItem("ssa_access");
  localStorage.removeItem("ssa_refresh");
  localStorage.removeItem("ssa_user");
}
