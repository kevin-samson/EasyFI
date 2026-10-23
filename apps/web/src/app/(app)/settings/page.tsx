import type { Metadata } from 'next';
import { AlertsPanel } from '@/components/settings/AlertsPanel';
import { GoalsPanel } from '@/components/settings/GoalsPanel';
import { InvitesPanel } from '@/components/settings/InvitesPanel';
import { ProfileForm } from '@/components/settings/ProfileForm';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { ShareLinksPanel } from '@/components/settings/ShareLinksPanel';
import { PageHeader } from '@/components/shell/PageHeader';
import { load, serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const api = await serverApi();
  const [me, portfolios, shareLinks, alerts, goals] = await Promise.all([
    load(api.GET('/me')),
    load(api.GET('/portfolios')),
    load(api.GET('/share-links')),
    load(api.GET('/alerts')),
    load(api.GET('/goals')),
  ]);
  const invites = me.isAdmin ? await load(api.GET('/invites')) : null;

  return (
    <>
      <PageHeader title="Settings" subtitle="Profile, sharing, alerts and FI goals." />
      <div className="space-y-5">
        <SettingsSection
          id="s-profile"
          title="Profile"
          description="Your name is shown in the app. Theme is saved to your account and applied on this device."
        >
          <ProfileForm me={me} />
        </SettingsSection>

        <SettingsSection
          id="s-goals"
          title="FI goal tracker"
          description="Your FI number is annual expenses divided by a safe withdrawal rate. Progress uses the value of every tracked portfolio."
        >
          <GoalsPanel goals={goals.goals} asOf={portfolios.asOf} />
        </SettingsSection>

        <SettingsSection
          id="s-alerts"
          title="Alerts"
          description="Sent by email when a rule triggers. Nothing is sent unless you turn it on."
        >
          <AlertsPanel alerts={alerts.alerts} />
        </SettingsSection>

        <SettingsSection
          id="s-share"
          title="Share links"
          description="Read-only snapshots of a portfolio. Anyone with the link sees weights only — no share counts, dollar values or account details."
        >
          <ShareLinksPanel
            links={shareLinks.links}
            portfolios={portfolios.portfolios.map((p) => ({ id: p.id, name: p.name }))}
          />
        </SettingsSection>

        {invites ? (
          <SettingsSection
            id="s-invites"
            title="Invite codes"
            description="EasyFI is invite-only. Send a friend the sign-up link; each friend gets their own private data."
          >
            <InvitesPanel invites={invites.invites} />
          </SettingsSection>
        ) : null}
      </div>
    </>
  );
}
