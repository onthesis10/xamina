import { createFileRoute } from '@tanstack/react-router'
// Route guard + layout per role
export const Route = createFileRoute('/_app/_layout')({
    beforeLoad: ({ context }) => {
        if (!context.auth.isAuthenticated) {
            throw redirect({ to: '/login' });
        }
    },

    component: () => {
        const { user } = useAuthStore();

        return (
            <div className="flex h-screen">
                <Sidebar role={user.role} />
                <main className="flex-1 overflow-auto">
                    <Topbar user={user} />
                    <Outlet /> {/* child routes */}
                </main>
            </div>
        );
    },
});

// RoleGuard component
export function RoleGuard({
    roles, children
}: {
    roles: Role[];
    children: ReactNode;
}) {
    const { user } = useAuthStore();
    if (!roles.includes(user.role)) {
        return <Navigate to="/dashboard" />;
    }
    return <>{children}</>;
}
