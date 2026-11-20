import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
export default function RequireSuperAdmin({ children }) {
  const { operator, loading } = useAuth();
  if (loading) {
    return (
      <p className="text-slate-600" role="status">
        Loading…
      </p>
    );
  }
  if (operator?.role !== 'super_admin') {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}