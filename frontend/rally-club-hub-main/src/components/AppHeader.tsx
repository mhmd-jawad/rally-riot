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
    <header className="h-14 border-b border-border bg-card/80 backdrop-blur-sm flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="text-muted-foreground hover:text-orange-400 transition-colors" />
        <span className="text-sm font-medium text-muted-foreground capitalize">
          <span className="text-orange-400">{role}</span> Dashboard
        </span>
      </div>
      <div className="flex items-center gap-2">
        <NotificationsDropdown />
        <span className="text-sm text-muted-foreground hidden sm:inline">{profile?.full_name}</span>
        <Button variant="ghost" size="icon" onClick={handleSignOut} title="Sign out" className="hover:text-orange-400 hover:bg-orange-500/10">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
