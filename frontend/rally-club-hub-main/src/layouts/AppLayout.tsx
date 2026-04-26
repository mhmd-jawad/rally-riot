import { Outlet, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { AppSidebar } from "@/components/AppSidebar";
import { AppHeader } from "@/components/AppHeader";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";

export function AppLayout({ allowedRoles }: { allowedRoles: string[] }) {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="app-shell flex min-h-screen items-center justify-center">
        <div className="space-y-4 w-64">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (role && !allowedRoles.includes(role)) {
    const path = role === "admin" ? "/admin" : role === "coach" ? "/coach" : role === "parent" ? "/parent" : "/player";
    return <Navigate to={path} replace />;
  }

  return (
    <SidebarProvider>
      <div className="app-shell min-h-screen flex w-full" data-role={role ?? "player"}>
        <AppSidebar />
        <div className="relative z-10 flex-1 flex flex-col min-w-0">
          <AppHeader />
          <main className="flex-1 p-4 sm:p-6 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
