import Sidebar from '@/components/layout/Sidebar';
import SessionGuard from '@/components/layout/SessionGuard';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-slate-50">
        {children}
      </main>
      <SessionGuard />
    </div>
  );
}
