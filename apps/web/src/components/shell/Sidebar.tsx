'use client';

import { LogOut, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { api } from '@/lib/api/client';
import { cn } from '@/lib/cn';
import { Logo } from './Logo';
import { isActive, type NavItem, PRIMARY_NAV, SECONDARY_NAV } from './nav';

export type ShellUser = { displayName: string; email: string | null };

function NavLink({
  item,
  active,
  rail,
  onNavigate,
  small,
}: {
  item: NavItem;
  active: boolean;
  rail?: boolean;
  onNavigate?: () => void;
  small?: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      title={rail ? item.label : undefined}
      className={cn(
        'group flex items-center gap-3 rounded-[9px] transition-colors',
        rail
          ? 'h-10 w-10 justify-center lg:h-[36px] lg:w-full lg:justify-start lg:px-4'
          : 'h-[36px] px-4',
        small ? 'text-[13px]' : 'text-[14px]',
        active
          ? 'bg-surface-3 font-semibold text-fg'
          : 'text-muted hover:bg-surface-2 hover:text-fg',
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          'shrink-0',
          small ? 'h-[15px] w-[15px]' : 'h-[17px] w-[17px]',
          active ? 'text-brand' : 'text-faint group-hover:text-muted',
        )}
        strokeWidth={active ? 2.2 : 1.8}
      />
      <span className={cn('truncate', rail && 'sr-only lg:not-sr-only lg:whitespace-nowrap')}>
        {item.label}
      </span>
    </Link>
  );
}

function UserChip({ user, rail }: { user: ShellUser; rail?: boolean }) {
  const initials = user.displayName
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2);
  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-2.5',
        rail && 'justify-center lg:flex-1 lg:justify-start',
      )}
    >
      <span
        aria-hidden
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[12px] font-semibold text-fg"
      >
        {initials}
      </span>
      <span className={cn('min-w-0', rail && 'hidden lg:block')}>
        <span className="block truncate text-[13px] font-medium text-fg">{user.displayName}</span>
        {user.email ? (
          <span className="block truncate text-[11px] text-faint">{user.email}</span>
        ) : null}
      </span>
      <SignOutButton className={cn(rail && 'hidden lg:inline-flex')} />
    </div>
  );
}

function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label="Sign out"
      title="Sign out"
      onClick={async () => {
        await api.POST('/auth/sign-out');
        router.replace('/sign-in');
        router.refresh();
      }}
      className={cn(
        'ml-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-faint hover:bg-surface-2 hover:text-fg',
        className,
      )}
    >
      <LogOut aria-hidden className="h-4 w-4" />
    </button>
  );
}

/**
 * App navigation.
 * - lg+: 220px sidebar with labels
 * - md–lg: 72px icon rail
 * - < md: top bar + slide-in drawer
 */
export function Sidebar({ user }: { user: ShellUser }) {
  const pathname = usePathname() ?? '/';
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      {/* Phone top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-rail/95 px-4 backdrop-blur md:hidden">
        <Link href="/" aria-label="EasyFI home">
          <Logo />
        </Link>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
            aria-expanded={open}
            aria-controls="mobile-nav"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-fg hover:bg-surface-2"
          >
            <Menu className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </header>

      {/* Phone drawer */}
      <div
        className={cn('fixed inset-0 z-40 md:hidden', open ? 'visible' : 'invisible')}
        aria-hidden={!open}
      >
        <div
          className={cn(
            'absolute inset-0 bg-black/60 transition-opacity',
            open ? 'opacity-100' : 'opacity-0',
          )}
          onClick={close}
        />
        <nav
          id="mobile-nav"
          aria-label="Main"
          className={cn(
            'absolute inset-y-0 left-0 flex w-[272px] flex-col border-r border-line bg-rail px-3 pt-4 pb-5 transition-transform',
            open ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <div className="mb-6 flex items-center justify-between pl-2">
            <Logo />
            <button
              type="button"
              onClick={close}
              aria-label="Close navigation"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
          <ul className="space-y-1">
            {PRIMARY_NAV.map((item) => (
              <li key={item.href}>
                <NavLink item={item} active={isActive(pathname, item.href)} onNavigate={close} />
              </li>
            ))}
          </ul>
          <ul className="mt-auto space-y-0.5 border-t border-line pt-3">
            {SECONDARY_NAV.map((item) => (
              <li key={item.href}>
                <NavLink
                  item={item}
                  small
                  active={isActive(pathname, item.href)}
                  onNavigate={close}
                />
              </li>
            ))}
          </ul>
          <div className="mt-3 px-2">
            <UserChip user={user} />
          </div>
        </nav>
      </div>

      {/* Tablet rail / desktop sidebar */}
      <nav
        aria-label="Main"
        className="sticky top-0 hidden h-screen shrink-0 flex-col border-r border-line bg-rail px-3 pt-5 pb-4 md:flex md:w-[72px] md:items-center lg:w-[220px] lg:items-stretch"
      >
        <Link href="/" aria-label="EasyFI home" className="mb-8 flex lg:pl-2.5">
          <Logo compact className="lg:hidden" />
          <Logo className="hidden lg:inline-flex" />
        </Link>
        <ul className="space-y-1.5">
          {PRIMARY_NAV.map((item) => (
            <li key={item.href}>
              <NavLink item={item} rail active={isActive(pathname, item.href)} />
            </li>
          ))}
        </ul>
        <div className="mt-auto w-full space-y-3">
          <ul className="space-y-0.5">
            {SECONDARY_NAV.map((item) => (
              <li key={item.href} className="flex justify-center lg:block">
                <NavLink item={item} rail small active={isActive(pathname, item.href)} />
              </li>
            ))}
          </ul>
          <div className="flex flex-col items-center gap-3 border-t border-line pt-3 lg:flex-row lg:justify-between lg:pl-2">
            <UserChip user={user} rail />
            <ThemeToggle />
          </div>
        </div>
      </nav>
    </>
  );
}
