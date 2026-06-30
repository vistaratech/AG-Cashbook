import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../utils/api';
import { BookOpen, LayoutDashboard, Clock, LogOut, Search, FolderOpen, FileSpreadsheet, ChevronDown, ChevronRight, Menu, X, User } from 'lucide-react';

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [registers, setRegisters] = useState([]);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedFolders, setExpandedFolders] = useState({});
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    loadRegisters();
  }, []);

  async function loadRegisters() {
    try {
      const res = await apiFetch('/api/registers');
      const data = await res.json();
      setRegisters(data.registers || []);
      setFolders(data.folders || []);
      // Expand all folders by default
      const expanded = {};
      (data.folders || []).forEach(f => { expanded[f.id] = true; });
      expanded['ungrouped'] = true;
      setExpandedFolders(expanded);
    } catch (err) {
      console.error('Failed to load registers:', err);
    } finally {
      setLoading(false);
    }
  }

  const filteredRegisters = registers.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase())
  );

  const grouped = folders.map(f => ({
    folder: f,
    registers: filteredRegisters.filter(r => r.folderId === f.id)
  })).filter(g => g.registers.length > 0);

  const ungrouped = filteredRegisters.filter(r => !r.folderId);

  const totalEntries = registers.reduce((sum, r) => sum + (r.entryCount || 0), 0);

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

      {/* Sidebar backdrop */}
      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} style={{ display: 'none' }} />}

      {/* Sidebar */}
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
            <div className="sidebar-avatar">
              {user?.name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{user?.name || 'User'}</div>
              <div className="sidebar-user-email">{user?.email || ''}</div>
            </div>
          </div>
          <button className="logout-btn" onClick={handleLogout}>
            <LogOut size={14} /> Sign Out
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="main-content">
        <div className="page-header">
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Welcome back, {user?.name || 'User'}</p>
        </div>

        {/* Stats */}
        <div className="stats-bar">
          <div className="stat-card">
            <div className="stat-icon"><FileSpreadsheet size={20} color="#10B981" /></div>
            <div className="stat-label">Registers</div>
            <div className="stat-value">{registers.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon"><FolderOpen size={20} color="#F59E0B" /></div>
            <div className="stat-label">Folders</div>
            <div className="stat-value">{folders.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon"><LayoutDashboard size={20} color="#3B82F6" /></div>
            <div className="stat-label">Total Entries</div>
            <div className="stat-value">{totalEntries.toLocaleString()}</div>
          </div>
        </div>

        {/* Search */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '20px' }}>
          <div className="search-bar" style={{ flex: 1, marginBottom: 0 }}>
            <Search size={16} />
            <input
              placeholder="Search registers..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button 
            onClick={() => navigate('/timeline')}
            className="student-search-btn"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '11px 20px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'var(--bg-card)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 700,
              transition: 'var(--transition)'
            }}
          >
            <User size={16} color="var(--accent)" />
            Student Search
          </button>
        </div>

        {loading ? (
          <div className="empty-state">
            <div className="loading-spinner" />
            <p>Loading registers...</p>
          </div>
        ) : registers.length === 0 ? (
          <div className="empty-state">
            <FileSpreadsheet size={40} />
            <p>No registers assigned to your account yet.</p>
            <p style={{ fontSize: '12px', marginTop: '4px' }}>Contact your administrator to get access.</p>
          </div>
        ) : (
          <>
            {grouped.map(({ folder, registers: folderRegs }) => (
              <div className="folder-group" key={folder.id}>
                <div className="folder-header" onClick={() => setExpandedFolders(prev => ({ ...prev, [folder.id]: !prev[folder.id] }))}>
                  {expandedFolders[folder.id] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <FolderOpen size={16} color="#F59E0B" />
                  {folder.name}
                  <span className="folder-count">{folderRegs.length} register{folderRegs.length !== 1 ? 's' : ''}</span>
                </div>
                {expandedFolders[folder.id] && (
                  <div className="register-grid">
                    {folderRegs.map(reg => (
                      <Link to={`/register/${reg.id}`} className="register-card" key={reg.id}>
                        <div className="register-card-name">{reg.name}</div>
                        <div className="register-card-meta">
                          <span className="register-card-badge">{reg.entryCount || 0} entries</span>
                          <span className="register-card-badge info">{reg.columns?.length || 0} columns</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {ungrouped.length > 0 && (
              <div className="folder-group">
                <div className="folder-header" onClick={() => setExpandedFolders(prev => ({ ...prev, ungrouped: !prev.ungrouped }))}>
                  {expandedFolders.ungrouped ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <FileSpreadsheet size={16} color="var(--text-muted)" />
                  Ungrouped
                  <span className="folder-count">{ungrouped.length}</span>
                </div>
                {expandedFolders.ungrouped && (
                  <div className="register-grid">
                    {ungrouped.map(reg => (
                      <Link to={`/register/${reg.id}`} className="register-card" key={reg.id}>
                        <div className="register-card-name">{reg.name}</div>
                        <div className="register-card-meta">
                          <span className="register-card-badge">{reg.entryCount || 0} entries</span>
                          <span className="register-card-badge info">{reg.columns?.length || 0} columns</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
