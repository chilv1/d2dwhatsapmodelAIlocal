/**
 * Protected dashboard layout — sidebar + content area.
 * Auth đã được middleware check, layout chỉ lấy session để hiển thị user info.
 */
import { redirect } from 'next/navigation';
import { auth, signOut } from '@/auth';
import { Sidebar } from '@/components/sidebar';
import { getSetting } from '@/lib/settings';

async function logoutAction() {
  'use server';
  await signOut({ redirectTo: '/login' });
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  // Feature flags — default ON nếu setting chưa tồn tại
  const [leaderboardRaw, branchesRaw] = await Promise.all([
    getSetting('feature.leaderboard_enabled'),
    getSetting('feature.branches_enabled'),
  ]);
  const featureFlags = {
    leaderboard: leaderboardRaw !== '0', // default ON
    branches: branchesRaw !== '0', // default ON
  };

  return (
    <div className="flex min-h-screen bg-muted/30">
      <Sidebar
        userEmail={session.user.email || ''}
        userName={session.user.name || 'User'}
        userRole={session.user.role || 'viewer'}
        logoutAction={logoutAction}
        featureFlags={featureFlags}
      />
      <main className="flex-1 overflow-auto">
        <div className="p-8 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
