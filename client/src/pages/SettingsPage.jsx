import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.jsx';
import { applyTheme, getStoredTheme } from '../lib/theme.js';

export default function SettingsPage() {
  const { operator } = useAuth();
  const [theme, setTheme] = useState(getStoredTheme);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
  };

  return (
    <div className="mx-auto max-w-lg space-y-8 dd-enter">
      <PageHeader title="Settings" description="Profile and display preferences." />
      <Card className="border-[var(--dd-border)] bg-[var(--dd-surface)]">
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <CardContent>
          <button
            type="button"
            className="rounded-[var(--dd-radius-sm)] border border-[var(--dd-border)] px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--dd-accent-soft)]"
            onClick={toggleTheme}
          >
            Theme: {theme === 'dark' ? 'Dark' : 'Light'} (click to switch)
          </button>
        </CardContent>
      </Card>
      <Card className="border-[var(--dd-border)] bg-[var(--dd-surface)]">
        <CardHeader>
          <CardTitle>Operator profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <strong>Name:</strong> {operator?.displayName}
          </p>
          <p>
            <strong>Email:</strong> {operator?.email}
          </p>
          <p>
            <strong>Role:</strong> {operator?.role}
          </p>
          <p>
            <strong>Agency ID:</strong> {operator?.agencyId}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}