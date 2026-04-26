import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  description?: string;
  trend?: string;
}

export function StatCard({ title, value, icon: Icon, description, trend }: StatCardProps) {
  return (
    <div className="stat-card">
      <div className="relative flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <div className="role-icon-tile w-10 h-10 rounded-lg flex items-center justify-center">
          <Icon className="w-5 h-5 text-[hsl(var(--role-secondary))]" />
        </div>
      </div>
      <p className="role-text-gradient relative mt-2 text-3xl font-bold">{value}</p>
      {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
      {trend && <p className="text-xs text-success mt-1">{trend}</p>}
    </div>
  );
}
