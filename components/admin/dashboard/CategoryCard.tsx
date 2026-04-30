import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";

type CategoryCardProps = {
  icon: LucideIcon;
  title: string;
  metrics: { label: string; value: number | string }[];
  href?: string;
  linkLabel?: string;
  children?: React.ReactNode;
};

export default function CategoryCard({ icon: Icon, title, metrics, href, linkLabel, children }: CategoryCardProps) {
  return (
    <div className="bg-card border rounded-lg p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-semibold text-sm">{title}</h3>
        </div>
        {href && (
          <Link
            href={href}
            className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
          >
            {linkLabel || "View details"}
            <ArrowRight className="w-3 h-3" />
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {metrics.map((m) => (
          <div key={m.label}>
            <p className="font-display text-xl font-bold tracking-tight">{typeof m.value === "number" ? m.value.toLocaleString() : m.value}</p>
            <p className="text-xs text-muted-foreground">{m.label}</p>
          </div>
        ))}
      </div>

      {children}
    </div>
  );
}
