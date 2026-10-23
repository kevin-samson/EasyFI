import type { ReactNode } from 'react';
import { Sidebar } from '@/components/shell/Sidebar';
import { ThemeSync } from '@/components/shell/ThemeSync';
import { load, serverApi } from '@/lib/api/server';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const api = await serverApi();
  const me = await load(api.GET('/me'));
  return (
    <div className="md:flex">
      <ThemeSync theme={me.theme} />
      <Sidebar user={{ displayName: me.displayName, email: me.email }} />
      <main id="main" className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-[1240px] px-4 pt-6 pb-16 sm:px-6 md:px-8 lg:px-8 lg:pt-8">
          {children}
        </div>
      </main>
    </div>
  );
}
