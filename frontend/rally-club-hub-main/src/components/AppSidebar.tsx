import {
  LayoutDashboard, Users, Trophy, Link2, FileText, DollarSign,
  Calendar, ClipboardCheck, Megaphone, User, CreditCard
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/contexts/AuthContext";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";

const adminItems = [
  { title: "Dashboard", url: "/admin", icon: LayoutDashboard },
  { title: "Users", url: "/admin/users", icon: Users },
  { title: "Teams", url: "/admin/teams", icon: Trophy },
  { title: "Parent-Child Links", url: "/admin/links", icon: Link2 },
  { title: "Registration Forms", url: "/admin/registrations", icon: FileText },
  { title: "Finance", url: "/admin/finance", icon: DollarSign },
];

const coachItems = [
  { title: "Dashboard", url: "/coach", icon: LayoutDashboard },
  { title: "Events", url: "/coach/events", icon: Calendar },
  { title: "Attendance", url: "/coach/attendance", icon: ClipboardCheck },
  { title: "Announcements", url: "/coach/announcements", icon: Megaphone },
];

const parentItems = [
  { title: "Dashboard", url: "/parent", icon: LayoutDashboard },
  { title: "Child Schedule", url: "/parent/schedule", icon: Calendar },
  { title: "Registration", url: "/parent/registration", icon: FileText },
  { title: "Payments", url: "/parent/payments", icon: CreditCard },
];

const playerItems = [
  { title: "Dashboard", url: "/player", icon: LayoutDashboard },
  { title: "My Schedule", url: "/player/schedule", icon: Calendar },
];

export function AppSidebar() {
  const { role, profile } = useAuth();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  const items = role === "admin" ? adminItems
    : role === "coach" ? coachItems
    : role === "parent" ? parentItems
    : playerItems;

  const roleLabel = role === "admin" ? "Admin" : role === "coach" ? "Coach" : role === "parent" ? "Parent" : "Player";

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <div className="p-4 border-b border-sidebar-border">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-yellow-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
                <Trophy className="w-4 h-4 text-black" />
              </div>
              <span className="font-bold text-sidebar-accent-foreground text-lg tracking-tight">RallyRiot</span>
            </div>
          )}
          {collapsed && (
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-yellow-500 flex items-center justify-center mx-auto shadow-lg shadow-orange-500/20">
              <Trophy className="w-4 h-4 text-black" />
            </div>
          )}
        </div>
        <SidebarGroup>
          <SidebarGroupLabel className="text-orange-400/60 uppercase text-xs tracking-widest">{roleLabel} Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url} end={item.url.split("/").length <= 2} className="hover:bg-sidebar-accent hover:text-orange-300 transition-colors" activeClassName="bg-sidebar-accent text-orange-400 font-medium border-l-2 border-orange-500">
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {!collapsed && profile && (
          <div className="mt-auto p-4 border-t border-sidebar-border">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500/20 to-yellow-500/10 border border-orange-400/20 flex items-center justify-center">
                <User className="w-4 h-4 text-orange-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-sidebar-accent-foreground truncate">{profile.full_name}</p>
                <p className="text-xs text-orange-400/60 truncate">{roleLabel}</p>
              </div>
            </div>
          </div>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
