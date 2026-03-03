"use client";

import Link from "next/link";
import Header from "@/components/Header";
import { cn } from "@/lib/utils";

type AdminTab = "users" | "roles" | "brackets" | "governing-bodies";

const TAB_CONFIG: { value: AdminTab; label: string; href: string }[] = [
  { value: "users", label: "User Management", href: "/admin/users" },
  { value: "roles", label: "Role Management", href: "/admin/roles" },
  { value: "brackets", label: "System Brackets", href: "/admin/brackets" },
  { value: "governing-bodies", label: "Governing Bodies", href: "/admin/governing-bodies" },
];

type AdminLayoutProps = {
  children: React.ReactNode;
  activeTab: AdminTab;
};

export default function AdminLayout({ children, activeTab }: AdminLayoutProps) {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-7xl px-6 py-8">
        <h1 className="text-2xl font-bold mb-2">Admin</h1>
        <p className="text-muted-foreground text-sm mb-6">
          Manage users, roles, and system bracket templates.
        </p>
        <div
          role="tablist"
          className="mb-6 bg-muted/60 border border-border p-1 rounded-lg w-fit inline-flex gap-0.5"
        >
          {TAB_CONFIG.map(({ value, label, href }) => {
            const isActive = activeTab === value;
            return (
              <Link
                key={value}
                href={href}
                role="tab"
                aria-selected={isActive}
                className={cn(
                  "px-4 py-2 rounded-md text-sm font-medium transition-colors",
                  isActive
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
              </Link>
            );
          })}
        </div>
        {children}
      </main>
    </div>
  );
}
