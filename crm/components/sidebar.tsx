/**
 * Sidebar navigation cho dashboard.
 * Menu items được lọc theo role của user:
 *   - admin           : thấy tất cả
 *   - branch_manager  : ẩn Users + Audit
 *   - viewer          : ẩn Users + Audit (chỉ read-only các page khác)
 */
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Image as ImageIcon,
  Megaphone,
  Users,
  UserCog,
  BarChart3,
  Bell,
  LogOut,
  ScrollText,
  Cpu,
  Trophy,
  Building2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  milestone?: string;
  adminOnly?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/submissions', label: 'Submissions', icon: ImageIcon },
  { href: '/dashboard/campaigns', label: 'Campaigns', icon: Megaphone },
  { href: '/dashboard/promotors', label: 'Promotors', icon: Users },
  { href: '/dashboard/promotors/leaderboard', label: 'Leaderboard', icon: Trophy },
  { href: '/dashboard/reports', label: 'Reports', icon: BarChart3 },
  { href: '/dashboard/users', label: 'Users + RBAC', icon: UserCog, adminOnly: true },
  { href: '/dashboard/audit', label: 'Audit log', icon: ScrollText, adminOnly: true },
  { href: '/dashboard/branches', label: 'Branches', icon: Building2, adminOnly: true },
  { href: '/dashboard/notifications', label: 'Notifications', icon: Bell, adminOnly: true },
  { href: '/dashboard/config-ai', label: 'Config AI', icon: Cpu, adminOnly: true },
];

type SidebarProps = {
  userEmail: string;
  userName: string;
  userRole: string;
  logoutAction: () => Promise<void>;
};

export function Sidebar({ userEmail, userName, userRole, logoutAction }: SidebarProps) {
  const pathname = usePathname();

  const items = NAV_ITEMS.filter((item) => {
    if (item.adminOnly && userRole !== 'admin') return false;
    return true;
  });

  return (
    <aside className="w-64 min-h-screen bg-card border-r flex flex-col">
      <div className="p-6 border-b">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold">
            TB
          </div>
          <div>
            <div className="font-semibold text-sm">Telecom Big</div>
            <div className="text-xs text-muted-foreground">Campaign CRM</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-auto">
        {items.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href ||
            (item.href !== '/dashboard' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center justify-between gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                active
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-foreground hover:bg-accent',
              )}
            >
              <span className="flex items-center gap-3">
                <Icon className="h-4 w-4" />
                {item.label}
              </span>
              {item.milestone && (
                <span className="text-[10px] font-mono text-muted-foreground">
                  {item.milestone}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-4 space-y-3">
        <div className="text-sm">
          <div className="font-medium truncate">{userName}</div>
          <div className="text-xs text-muted-foreground truncate">{userEmail}</div>
          <div className="text-[10px] uppercase tracking-wide text-primary mt-1 font-medium">
            {userRole}
          </div>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="w-full flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Đăng xuất
          </button>
        </form>
      </div>
    </aside>
  );
}
