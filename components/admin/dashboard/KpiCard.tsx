import { type LucideIcon } from "lucide-react";

type KpiCardProps = {
  icon: LucideIcon;
  label: string;
  value: number;
  badge?: { label: string; variant: "amber" | "green" | "red" | "muted" };
  subtitle?: string;
  accent: "blue" | "green" | "orange" | "purple";
  pulse?: boolean;
};

const ACCENT_BORDER: Record<KpiCardProps["accent"], string> = {
  blue: "border-l-blue-500",
  green: "border-l-emerald-500",
  orange: "border-l-primary",
  purple: "border-l-violet-500",
};

const ACCENT_ICON_BG: Record<KpiCardProps["accent"], string> = {
  blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  green: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  orange: "bg-primary/10 text-primary",
  purple: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
};

const BADGE_VARIANT: Record<NonNullable<KpiCardProps["badge"]>["variant"], string> = {
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  green: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  red: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  muted: "bg-muted text-muted-foreground",
};

export default function KpiCard({ icon: Icon, label, value, badge, subtitle, accent, pulse }: KpiCardProps) {
  return (
    <div
      className={`bg-card border border-l-4 ${ACCENT_BORDER[accent]} rounded-lg p-5 flex flex-col gap-3 hover:-translate-y-0.5 hover:shadow-md transition-all`}
    >
      <div className="flex items-center justify-between">
        <div className={`p-2 rounded-md ${ACCENT_ICON_BG[accent]}`}>
          <Icon className="w-5 h-5" />
        </div>
        {badge && badge.label && (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1.5 ${BADGE_VARIANT[badge.variant]}`}>
            {pulse && (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-current" />
              </span>
            )}
            {badge.label}
          </span>
        )}
      </div>
      <div>
        <p className="font-display text-3xl font-bold tracking-tight">{value.toLocaleString()}</p>
        <p className="text-sm text-muted-foreground mt-0.5">{label}</p>
      </div>
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  );
}
