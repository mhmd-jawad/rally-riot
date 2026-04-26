import {
  LayoutDashboard, Users, Trophy, Link2, FileText, DollarSign,
  Calendar, ClipboardCheck, Megaphone, User, CreditCard, Bot, BarChart3, MessageSquare
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
  { title: "Attendance", url: "/admin/attendance", icon: BarChart3 },
  { title: "Events", url: "/admin/events", icon: Calendar },
  { title: "Community Hub", url: "/admin/community", icon: MessageSquare },
];

const coachItems = [
  { title: "Dashboard", url: "/coach", icon: LayoutDashboard },
  { title: "Events", url: "/coach/events", icon: Calendar },
  { title: "Attendance", url: "/coach/attendance", icon: ClipboardCheck },
  { title: "Announcements", url: "/coach/announcements", icon: Megaphone },
  { title: "Community Hub", url: "/coach/community", icon: MessageSquare },
];

const parentItems = [
  { title: "Dashboard", url: "/parent", icon: LayoutDashboard },
  { title: "Child Schedule", url: "/parent/schedule", icon: Calendar },
  { title: "Registration", url: "/parent/registration", icon: FileText },
  { title: "Payments", url: "/parent/payments", icon: CreditCard },
  { title: "Community Hub", url: "/parent/community", icon: MessageSquare },
];

const playerItems = [
  { title: "Dashboard", url: "/player", icon: LayoutDashboard },
  { title: "My Schedule", url: "/player/schedule", icon: Calendar },
  { title: "Community Hub", url: "/player/community", icon: MessageSquare },
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
        <div className="p-4 border-b border-sidebar-border/70">
          {!collapsed && (
            <div className="flex h-14 items-center">
              <img
                src="/rallyriot.png"
                alt="RallyRiot"
                className="h-12 w-auto max-w-[190px] object-contain drop-shadow-[0_10px_24px_rgba(249,115,22,0.32)]"
              />
            </div>
          )}
          {collapsed && (
            <div className="mx-auto flex h-11 w-11 items-center justify-center overflow-hidden rounded-lg">
              <img
                src="/rallyriot.png"
                alt="RallyRiot"
                className="h-10 w-10 object-contain drop-shadow-[0_8px_18px_rgba(249,115,22,0.35)]"
              />
            </div>
          )}
        </div>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[hsl(var(--role-secondary))]/80 uppercase text-xs tracking-widest">{roleLabel} Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url.split("/").length <= 2}
                      className="sidebar-nav-link transition-colors"
                      activeClassName="sidebar-nav-link-active font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {(role === "coach" || role === "parent" || role === "admin") && (
          <div className="px-2 pb-2">
            <button
              onClick={() => window.dispatchEvent(new CustomEvent("rally:open-ai-chat"))}
              className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-[hsl(var(--role-secondary))] hover:bg-sidebar-accent transition-colors border border-[hsl(var(--role-primary)_/_0.28)]"
            >
              <Bot className="h-4 w-4 flex-shrink-0" />
              {!collapsed && <span>AI Assistant</span>}
            </button>
          </div>
        )}
        {!collapsed && profile && (
          <div className="mt-auto p-4 border-t border-sidebar-border">
            <div className="flex items-center gap-2">
              <div className="role-icon-tile w-8 h-8 rounded-full flex items-center justify-center">
                <User className="w-4 h-4 text-[hsl(var(--role-secondary))]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-sidebar-accent-foreground truncate">{profile.full_name}</p>
                <p className="text-xs text-[hsl(var(--role-secondary))]/70 truncate">{roleLabel}</p>
              </div>
            </div>
          </div>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
