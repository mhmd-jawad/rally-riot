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
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500/20 to-yellow-500/10 border border-orange-400/20 flex items-center justify-center">
          <Icon className="w-5 h-5 text-orange-400" />
        </div>
      </div>
      <p className="text-3xl font-bold mt-2 bg-gradient-to-r from-orange-300 to-yellow-400 bg-clip-text text-transparent">{value}</p>
      {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
      {trend && <p className="text-xs text-success mt-1">{trend}</p>}
    </div>
  );
}
