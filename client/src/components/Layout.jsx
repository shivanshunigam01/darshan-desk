import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Layout() {
  const { operator, logout } = useAuth();

  return (
    <div className="shell">
      <aside className="sidebar">
        <p className="tag">DarshanDesk SaaS</p>
        <h1>SRIVANI Preparation</h1>
        <p className="muted" style={{ color: '#a8a29e', marginTop: '0.5rem' }}>
          {operator?.displayName}
        </p>
        <nav>
          <NavLink to="/srivani/prepare" className={({ isActive }) => (isActive ? 'active' : '')}>
            New preparation
          </NavLink>
          <NavLink to="/preparations" className={({ isActive }) => (isActive ? 'active' : '')}>
            All preparations
          </NavLink>
          <NavLink to="/srivani/quota" className={({ isActive }) => (isActive ? 'active' : '')}>
            Quota dashboard
          </NavLink>
          <NavLink to="/srivani/qa" className={({ isActive }) => (isActive ? 'active' : '')}>
            Reliability & QA
          </NavLink>
          <NavLink to="/srivani/history" className={({ isActive }) => (isActive ? 'active' : '')}>
            Booking history
          </NavLink>
        </nav>
        <button
          type="button"
          className="secondary"
          style={{ marginTop: '2rem', width: '100%' }}
          onClick={logout}
        >
          Sign out
        </button>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}