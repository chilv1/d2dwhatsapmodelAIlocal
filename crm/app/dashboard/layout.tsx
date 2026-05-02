/**
 * Protected dashboard layout — sidebar + content area.
 * Auth đã được middleware check, layout chỉ lấy session để hiển thị user info.
 */
import { redirect } from 'next/navigation';
import { auth, signOut } from '@/auth';
import { Sidebar } from '@/components/sidebar';

async function logoutAction() {
  'use server';
  await signOut({ redirectTo: '/login' });
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  return (
    <div className="flex min-h-screen bg-muted/30">
      <Sidebar
        userEmail={session.user.email || ''}
        userName={session.user.name || 'User'}
        userRole={session.user.role || 'viewer'}
        logoutAction={logoutAction}
      />
      <main className="flex-1 overflow-auto">
        <div className="p-8 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
