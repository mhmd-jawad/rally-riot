import { Bell, LogOut, Menu } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { NotificationsDropdown } from "@/components/NotificationsDropdown";
import { useNavigate } from "react-router-dom";

export function AppHeader() {
  const { profile, role, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <header className="app-header h-14 border-b backdrop-blur-xl flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="text-muted-foreground hover:text-[hsl(var(--role-secondary))] transition-colors" />
        <span className="text-sm font-medium text-muted-foreground capitalize">
          <span className="role-text-gradient font-semibold">{role}</span> Dashboard
        </span>
      </div>
      <div className="flex items-center gap-2">
        <NotificationsDropdown />
        <span className="text-sm text-muted-foreground hidden sm:inline">{profile?.full_name}</span>
        <Button variant="ghost" size="icon" onClick={handleSignOut} title="Sign out" className="hover:bg-primary/10 hover:text-[hsl(var(--role-secondary))]">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
