import { createRootRoute, createRoute, createRouter, Outlet, redirect } from "@tanstack/react-router";

import { AppLayoutPage, appBeforeLoad } from "@/routes/_app/_layout";
import { BillingRoutePage } from "@/routes/_app/billing";
import { ClassesRoutePage } from "@/routes/_app/classes";
import { DashboardPage } from "@/routes/_app/dashboard";
import { ExamsRoutePage } from "@/routes/_app/exams";
import { ExamMonitorRoutePage } from "@/routes/_app/exams/monitor";
import { MyCertificatesRoutePage } from "@/routes/_app/my-certificates";
import { MyExamsRoutePage } from "@/routes/_app/my-exams";
import { MyExamResultRoutePage } from "@/routes/_app/my-exams/result";
import { MyExamSessionRoutePage } from "@/routes/_app/my-exams/session";
import { PlatformTenantsRoutePage } from "@/routes/_app/platform/tenants";
import { PlatformBillingRoutePage } from "@/routes/_app/platform/billing";
import { PlatformConsoleRoutePage } from "@/routes/_app/platform/console";
import { PlatformAuditLogsRoutePage } from "@/routes/_app/platform/audit-logs";
import { PrivacyRoutePage } from "@/routes/_app/privacy";
import { QuestionBankRoutePage } from "@/routes/_app/question-bank";
import { ReportsRoutePage } from "@/routes/_app/reports";
import { UsersRoutePage } from "@/routes/_app/users";
import { LoginRoutePage } from "@/routes/_auth/login";
import { RootLayout } from "@/routes/__root";
import { DesignSystemRoutePage } from "@/routes/design-system";
import { PricingRoutePage } from "@/routes/pricing";
import { LandingPage } from "@/routes";
import { useAuthStore } from "@/store/auth.store";
import type { Role } from "@/types/common.types";

const requireRole = (roles: Role[]) => {
  const user = useAuthStore.getState().user;
  if (!user) throw redirect({ to: "/auth/login" });
  if (!roles.includes(user.role)) throw redirect({ to: "/app/dashboard" });
};

const rootRoute = createRootRoute({ component: RootLayout });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: LandingPage,
});

const authRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth",
  component: () => <Outlet />,
});

const designSystemRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/design-system",
  component: DesignSystemRoutePage,
});

const pricingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/pricing",
  component: PricingRoutePage,
});

const loginRoute = createRoute({
  getParentRoute: () => authRoute,
  path: "/login",
  beforeLoad: () => {
    const user = useAuthStore.getState().user;
    if (user) throw redirect({ to: "/app/dashboard" });
  },
  component: LoginRoutePage,
});

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/app",
  beforeLoad: appBeforeLoad,
  component: AppLayoutPage,
});

const dashboardRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/dashboard",
  component: DashboardPage,
});

const billingRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/billing",
  beforeLoad: () => requireRole(["admin"]),
  component: BillingRoutePage,
});

const usersRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/users",
  beforeLoad: () => requireRole(["admin", "super_admin"]),
  component: UsersRoutePage,
});

const classesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/classes",
  beforeLoad: () => requireRole(["admin", "super_admin"]),
  component: ClassesRoutePage,
});

const questionRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/question-bank",
  beforeLoad: () => requireRole(["admin", "guru", "super_admin"]),
  component: QuestionBankRoutePage,
});

const examsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/exams",
  beforeLoad: () => requireRole(["admin", "guru", "super_admin"]),
  component: ExamsRoutePage,
});

const reportsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/reports",
  beforeLoad: () => requireRole(["admin", "guru", "super_admin"]),
  component: ReportsRoutePage,
});

const examMonitorRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/exams/monitor/$examId",
  beforeLoad: () => requireRole(["admin", "guru", "super_admin"]),
  component: ExamMonitorRoutePage,
});

const myExamsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/my-exams",
  beforeLoad: () => requireRole(["siswa"]),
  component: MyExamsRoutePage,
});

const myCertificatesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/my-certificates",
  beforeLoad: () => requireRole(["siswa"]),
  component: MyCertificatesRoutePage,
});

const privacyRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/privacy",
  component: PrivacyRoutePage,
});

const myExamSessionRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/my-exams/session/$submissionId",
  beforeLoad: () => requireRole(["siswa"]),
  component: MyExamSessionRoutePage,
});

const myExamResultRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/my-exams/result/$submissionId",
  beforeLoad: () => requireRole(["siswa"]),
  component: MyExamResultRoutePage,
});

const platformTenantsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/platform/tenants",
  beforeLoad: () => requireRole(["super_admin"]),
  component: PlatformTenantsRoutePage,
});

const platformBillingRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/platform/billing",
  beforeLoad: () => requireRole(["super_admin"]),
  component: PlatformBillingRoutePage,
});

const platformConsoleRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/platform/console",
  beforeLoad: () => requireRole(["super_admin"]),
  component: PlatformConsoleRoutePage,
});

const platformAuditLogsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/platform/audit-logs",
  beforeLoad: () => requireRole(["super_admin"]),
  component: PlatformAuditLogsRoutePage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  designSystemRoute,
  pricingRoute,
  authRoute.addChildren([loginRoute]),
  appRoute.addChildren([
    dashboardRoute,
    billingRoute,
    usersRoute,
    classesRoute,
    questionRoute,
    examsRoute,
    examMonitorRoute,
    reportsRoute,
    myExamsRoute,
    myCertificatesRoute,
    privacyRoute,
    myExamSessionRoute,
    myExamResultRoute,
    platformConsoleRoute,
    platformAuditLogsRoute,
    platformTenantsRoute,
    platformBillingRoute,
  ]),
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
