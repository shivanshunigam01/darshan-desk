import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

export default function AdminOverviewPage() {
  const { operator } = useAuth();
  const isSuper = operator?.role === 'super_admin';

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-navy">Platform overview</h1>
      <Card>
        <CardHeader>
          <CardTitle>Scope</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-700">
          <p>Agency administrators manage license and single-tenant analytics. Super admins use the command center for cross-agency reporting.</p>
          <div className="flex flex-wrap gap-2">
            {isSuper && (
              <Link to="/admin/command-center">
                <Button size="sm">Super Admin Command Center</Button>
              </Link>
            )}
            <Link to="/admin/license">
              <Button size="sm" variant="secondary">
                License management
              </Button>
            </Link>
            <Link to="/admin/analytics">
              <Button size="sm" variant="secondary">
                Agency booking analytics
              </Button>
            </Link>
            <Link to="/srivani/qa">
              <Button size="sm" variant="secondary">
                Reliability lab
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}