import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../utils/api';
import { BookOpen, LayoutDashboard, Clock, LogOut, Menu, X, ArrowRight, Edit3, LogIn, ChevronLeft, ChevronRight, User } from 'lucide-react';

export default function HistoryPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({});
  const [filter, setFilter] = useState('all'); // all, cashbook_edit, cashbook_login
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    loadHistory();
  }, [page, filter]);

  async function loadHistory() {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page, limit: 50 });
      if (filter !== 'all') params.set('action', filter);

      const res = await apiFetch(`/api/history?${params}`);
      const data = await res.json();
      setActivities(data.activities || []);
      setPagination(data.pagination || {});
    } catch (err) {
      console.error('History error:', err);
    } finally {
      setLoading(false);
    }
  }

  function formatDate(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="app-layout">
      {/* Mobile topbar */}
      <div className="mobile-topbar">
        <button className="mobile-menu-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
          {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <span style={{ fontWeight: 700, fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <img src="/logo-transparent.png" alt="Logo" style={{ width: '18px', height: '18px', objectFit: 'contain' }} /> AG Cashbook
        </span>
        <div style={{ width: '28px' }} />
      </div>

      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} style={{ display: 'none' }} />}

      <div className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <div className="sidebar-brand-icon" style={{ background: 'transparent', border: 'none', display: 'flex', padding: 0 }}>
              <img src="/logo-transparent.png" alt="Logo" style={{ width: '24px', height: '24px', objectFit: 'contain' }} />
            </div>
            AG Cashbook
          </div>
        </div>
        <div className="sidebar-nav">
          <Link to="/" className={`nav-item ${location.pathname === '/' ? 'active' : ''}`} onClick={() => setSidebarOpen(false)}>
            <LayoutDashboard size={16} /> Dashboard
          </Link>
          <Link to="/timeline" className={`nav-item ${location.pathname === '/timeline' ? 'active' : ''}`} onClick={() => setSidebarOpen(false)}>
            <User size={16} /> Student Search
          </Link>
          <Link to="/history" className={`nav-item ${location.pathname === '/history' ? 'active' : ''}`} onClick={() => setSidebarOpen(false)}>
            <Clock size={16} /> History
          </Link>
        </div>
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-avatar">{user?.name?.charAt(0)?.toUpperCase() || 'U'}</div>
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{user?.name || 'User'}</div>
              <div className="sidebar-user-email">{user?.email || ''}</div>
            </div>
          </div>
          <button className="logout-btn" onClick={handleLogout}><LogOut size={14} /> Sign Out</button>
        </div>
      </div>

      <div className="main-content">
        <div className="page-header animate-fade">
          <h1 className="page-title">History</h1>
          <p className="page-subtitle">All changes made from the Cashbook app</p>
        </div>

        {/* Filters */}
        <div className="filter-bar animate-fade">
          <select className="filter-select" value={filter} onChange={e => { setFilter(e.target.value); setPage(1); }}>
            <option value="all">All Activity</option>
            <option value="cashbook_edit">Edits Only</option>
            <option value="cashbook_login">Logins Only</option>
          </select>
        </div>

        {loading ? (
          <div className="empty-state"><div className="loading-spinner" /><p>Loading history...</p></div>
        ) : activities.length === 0 ? (
          <div className="empty-state">
            <Clock size={40} />
            <p>No history yet</p>
            <p style={{ fontSize: '12px', marginTop: '4px' }}>Activity will appear here when changes are made.</p>
          </div>
        ) : (
          <>
            <div className="history-list">
              {activities.map(act => (
                <div className="history-item" key={act.id}>
                  <div className="history-item-header">
                    <div className="history-user">
                      <div style={{
                        width: '28px', height: '28px', borderRadius: '50%',
                        background: 'linear-gradient(135deg, var(--accent), #059669)',
                        color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 700, fontSize: '11px', flexShrink: 0
                      }}>
                        {act.userName?.charAt(0)?.toUpperCase() || '?'}
                      </div>
                      <div>
                        <div>{act.userName || 'Unknown'}</div>
                        {act.registerName && (
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>
                            in {act.registerName}
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className={`history-action-badge ${act.action === 'cashbook_edit' ? 'edit' : 'login'}`}>
                        {act.action === 'cashbook_edit' ? (
                          <><Edit3 size={10} style={{ marginRight: '4px' }} /> Edit</>
                        ) : (
                          <><LogIn size={10} style={{ marginRight: '4px' }} /> Login</>
                        )}
                      </span>
                      <span className="history-time">{formatDate(act.timestamp)}</span>
                    </div>
                  </div>

                  {act.action === 'cashbook_edit' && act.details && (
                    <div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px', fontWeight: 500 }}>
                        Changed <strong style={{ color: 'var(--text-primary)' }}>{act.details.columnName || 'field'}</strong>
                      </div>
                      <div className="history-change">
                        <span className="history-old">{act.details.oldValue || '(empty)'}</span>
                        <ArrowRight size={14} className="history-arrow" />
                        <span className="history-new">{act.details.newValue || '(empty)'}</span>
                      </div>
                    </div>
                  )}

                  {act.action === 'cashbook_login' && (
                    <div className="history-action" style={{ marginTop: '4px' }}>
                      {typeof act.details === 'object' ? act.details.raw || 'User signed in' : (act.details || 'User signed in')}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '20px' }}>
                <button className="pagination-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft size={14} /> Previous
                </button>
                <span style={{ display: 'flex', alignItems: 'center', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, padding: '0 12px' }}>
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <button className="pagination-btn" disabled={page >= pagination.totalPages} onClick={() => setPage(p => p + 1)}>
                  Next <ChevronRight size={14} />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
