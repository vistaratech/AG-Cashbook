import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../utils/api';
import { uploadToCloudinary } from '../utils/cloudinary';
import { ArrowLeft, Search, BookOpen, LayoutDashboard, Clock, LogOut, Menu, X, ChevronUp, ChevronDown, Download, User, Book, CreditCard, Upload } from 'lucide-react';

export default function RegisterViewPage() {
  const { id } = useParams();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [register, setRegister] = useState(null);
  const [entries, setEntries] = useState([]);
  const [columns, setColumns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  
  // Modal & Form Edit States
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [tempCells, setTempCells] = useState({}); // Stores form values during modal edits
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    loadData();
  }, [id]);

  async function loadData() {
    try {
      setLoading(true);
      const [regRes, entriesRes] = await Promise.all([
        apiFetch(`/api/registers/${id}`),
        apiFetch(`/api/entries/${id}?page=1&limit=5000&search=${encodeURIComponent(search)}`)
      ]);
      const regData = await regRes.json();
      const entriesData = await entriesRes.json();

      setRegister(regData);
      setColumns(entriesData.columns || regData.columns || []);
      setEntries(entriesData.entries || []);
    } catch (err) {
      console.error('Load error:', err);
    } finally {
      setLoading(false);
    }
  }

  // Helper to dynamically select summary columns to display in main table
  const getSummaryColumns = () => {
    const nameCol = columns.find(c => c.name.toLowerCase().includes('name') && c.name.toLowerCase().includes('student')) 
      || columns.find(c => c.name.toLowerCase().includes('name'));
    const courseCol = columns.find(c => c.name.toLowerCase().includes('course'));
    const idCol = columns.find(c => c.name.toLowerCase().includes('id') || c.name.toLowerCase().includes('rb') || c.name.toLowerCase().includes('roll'));

    const summaryCols = [];
    if (idCol) summaryCols.push(idCol);
    if (nameCol) summaryCols.push(nameCol);
    if (courseCol) summaryCols.push(courseCol);

    if (summaryCols.length < 3) {
      for (const col of columns) {
        if (!summaryCols.find(sc => sc.id === col.id)) {
          summaryCols.push(col);
        }
        if (summaryCols.length >= 3) break;
      }
    }

    return summaryCols;
  };

  const summaryCols = getSummaryColumns();

  // Sort entries
  const sortedEntries = [...entries].sort((a, b) => {
    if (!sortCol) return a.rowNumber - b.rowNumber;
    const valA = String(a.cells[sortCol] || '');
    const valB = String(b.cells[sortCol] || '');
    const numA = parseFloat(valA);
    const numB = parseFloat(valB);
    if (!isNaN(numA) && !isNaN(numB)) {
      return sortDir === 'asc' ? numA - numB : numB - numA;
    }
    return sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
  });

  // Client-side search
  const filteredEntries = search
    ? sortedEntries.filter(e =>
        Object.values(e.cells).some(v =>
          String(v || '').toLowerCase().includes(search.toLowerCase())
        )
      )
    : sortedEntries;

  function handleSort(colId) {
    if (sortCol === colId) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(colId);
      setSortDir('asc');
    }
  }

  // --- Modal Form Actions ---
  function openDetailsModal(entry) {
    setSelectedEntry(entry);
    
    // Copy cells and format Date inputs (HTML5 inputs expect YYYY-MM-DD)
    const formattedCells = { ...entry.cells };
    columns.forEach(col => {
      const colId = String(col.id);
      const val = formattedCells[colId] || '';
      if (col.type === 'date' && val) {
        const parts = val.split('-');
        if (parts.length === 3) {
          formattedCells[colId] = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
      }
    });
    
    setTempCells(formattedCells);
  }

  async function handleSaveAll() {
    if (!selectedEntry || saving) return;
    setSaving(true);

    const changedFields = [];
    const updatedCellsForState = { ...selectedEntry.cells };

    // Identify changed fields and prepare values
    for (const col of columns) {
      const colId = String(col.id);
      const originalValue = selectedEntry.cells[colId] || '';
      let newValue = tempCells[colId] || '';

      // Format date input value (YYYY-MM-DD) back to stored format (DD-MM-YYYY)
      if (col.type === 'date' && newValue) {
        const parts = newValue.split('-');
        if (parts.length === 3) {
          newValue = `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
      }

      if (String(newValue) !== String(originalValue)) {
        // If it's a new base64 image upload, upload to Cloudinary first
        if (col.type === 'image' && newValue.startsWith('data:image/')) {
          try {
            showToast('Uploading image to Cloudinary...', 'info');
            newValue = await uploadToCloudinary(newValue);
          } catch (err) {
            showToast(err.message || 'Image upload failed', 'error');
            setSaving(false);
            return;
          }
        }

        changedFields.push({
          columnId: colId,
          value: newValue,
          columnName: col.name
        });
        updatedCellsForState[colId] = newValue;
      }
    }

    if (changedFields.length === 0) {
      setSelectedEntry(null);
      setSaving(false);
      return;
    }

    try {
      // Send updates to backend sequentially
      for (const field of changedFields) {
        await apiFetch(`/api/entries/${id}/${selectedEntry.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            columnId: field.columnId,
            value: field.value,
            columnName: field.columnName
          })
        });
      }

      // Update local state list
      setEntries(prev => prev.map(e => {
        if (e.id === selectedEntry.id) {
          return { ...e, cells: updatedCellsForState };
        }
        return e;
      }));

      showToast('Changes saved successfully', 'success');
      setSelectedEntry(null);
    } catch (err) {
      showToast('Failed to save some changes', 'error');
    } finally {
      setSaving(false);
    }
  }

  function handleFieldChange(colId, val) {
    setTempCells(prev => ({ ...prev, [colId]: val }));
  }

  function showToast(message, type = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  function exportCSV() {
    if (!columns.length || !filteredEntries.length) return;
    const headers = ['#', ...columns.map(c => c.name)];
    const rows = filteredEntries.map(e => [
      e.rowNumber,
      ...columns.map(c => String(e.cells[String(c.id)] || '').replace(/"/g, '""'))
    ]);
    
    const csv = [
      headers.map(h => `"${h}"`).join(','),
      ...rows.map(r => r.map(v => `"${v}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${register?.name || 'cashbook'}_export.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('CSV exported successfully');
  }

  function handleLogout() {
    logout();
    navigate('/login');
  }

  // Render form fields inside modal layout
  function renderFormFieldInput(col) {
    const colId = String(col.id);
    const val = tempCells[colId] || '';
    const isEditable = user?.canEdit;

    const inputStyle = {
      width: '100%',
      padding: '10px 14px',
      background: isEditable ? 'var(--bg-input)' : '#f8fafc',
      color: 'var(--text-primary)',
      border: '1px solid var(--border)',
      outline: 'none',
      fontSize: '13px',
      fontWeight: 600,
      borderRadius: '8px',
      fontFamily: 'inherit',
      transition: 'var(--transition)'
    };

    if (col.type === 'image') {
      const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onloadend = () => {
          handleFieldChange(colId, reader.result); // Save Base64 data URL
        };
        reader.readAsDataURL(file);
      };

      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
          {val ? (
            <div style={{ position: 'relative', width: 'fit-content' }}>
              <img
                src={val}
                alt={col.name}
                style={{
                  maxWidth: '100%',
                  maxHeight: '180px',
                  borderRadius: '10px',
                  border: '1px solid var(--border)',
                  objectFit: 'contain'
                }}
              />
              {isEditable && (
                <button
                  type="button"
                  onClick={() => handleFieldChange(colId, '')}
                  style={{
                    position: 'absolute',
                    top: '8px',
                    right: '8px',
                    background: 'var(--danger)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '50%',
                    width: '24px',
                    height: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                  }}
                  title="Remove Image"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          ) : (
            <div
              style={{
                border: '2px dashed var(--border)',
                borderRadius: '10px',
                padding: '20px',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: '12px',
                background: '#f8fafc',
                cursor: isEditable ? 'pointer' : 'default'
              }}
              onClick={() => isEditable && document.getElementById(`file-input-${colId}`).click()}
            >
              No image uploaded
            </div>
          )}
          
          {isEditable && (
            <div>
              <input
                id={`file-input-${colId}`}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                onClick={() => document.getElementById(`file-input-${colId}`).click()}
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-secondary)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'var(--transition)'
                }}
                className="upload-btn-theme"
              >
                <Upload size={14} />
                {val ? 'Change Image' : 'Upload Image'}
              </button>
            </div>
          )}
        </div>
      );
    }

    if (col.type === 'dropdown' && col.dropdownOptions && col.dropdownOptions.length > 0) {
      return (
        <select
          value={val}
          onChange={e => handleFieldChange(colId, e.target.value)}
          disabled={!isEditable}
          style={inputStyle}
          className="form-select-theme"
        >
          <option value="">Select</option>
          {col.dropdownOptions.map((opt, idx) => (
            <option key={idx} value={opt}>{opt}</option>
          ))}
        </select>
      );
    }

    if (col.type === 'date') {
      return (
        <input
          type="date"
          value={val}
          onChange={e => handleFieldChange(colId, e.target.value)}
          disabled={!isEditable}
          style={inputStyle}
        />
      );
    }

    if (col.type === 'number' || col.type === 'currency') {
      return (
        <input
          type="number"
          value={val}
          onChange={e => handleFieldChange(colId, e.target.value)}
          disabled={!isEditable}
          style={inputStyle}
          placeholder="0"
        />
      );
    }

    return (
      <input
        type="text"
        value={val}
        onChange={e => handleFieldChange(colId, e.target.value)}
        disabled={!isEditable}
        style={inputStyle}
        placeholder="—"
      />
    );
  }

  // Locate ID, Name, and Course columns for clean modal headers
  const getModalHeaderDetails = (entry) => {
    const nameCol = columns.find(c => c.name.toLowerCase().includes('name'));
    const courseCol = columns.find(c => c.name.toLowerCase().includes('course'));
    const idCol = columns.find(c => c.name.toLowerCase().includes('id') || c.name.toLowerCase().includes('rb') || c.name.toLowerCase().includes('roll'));

    return {
      name: entry.cells[nameCol?.id] || 'Student Details',
      course: entry.cells[courseCol?.id] || '',
      id: entry.cells[idCol?.id] || ''
    };
  };

  return (
    <div className="app-layout">
      {/* Mobile topbar */}
      <div className="mobile-topbar">
        <button className="mobile-menu-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
          {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <span style={{ fontWeight: 700, fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {register?.name || 'Loading...'}
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

      <div className="main-content animate-fade">
        {/* Header */}
        <div className="register-view-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Link to="/" className="back-btn"><ArrowLeft size={14} /> Back</Link>
            <div>
              <h1 className="page-title" style={{ fontSize: '20px' }}>{register?.name || 'Loading...'}</h1>
              <p className="page-subtitle">{register?.entryCount || 0} entries · {columns.length} columns</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={exportCSV} className="back-btn" style={{ color: 'var(--accent)', borderColor: 'rgba(16,185,129,0.2)' }}>
              <Download size={14} /> Export CSV
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="search-bar" style={{ marginBottom: '20px' }}>
          <Search size={16} />
          <input
            placeholder="Search student name or course..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="empty-state"><div className="loading-spinner" /><p>Loading data...</p></div>
        ) : (
          <div className="data-table-wrapper">
            <div className="data-table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: '60px', textAlign: 'center' }}>#</th>
                    {summaryCols.map(col => (
                      <th
                        key={col.id}
                        className={sortCol === String(col.id) ? 'sorted' : ''}
                        onClick={() => handleSort(String(col.id))}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {col.name}
                          {sortCol === String(col.id) && (
                            sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                          )}
                        </span>
                      </th>
                    ))}
                    <th style={{ width: '120px', textAlign: 'center' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.length === 0 ? (
                    <tr>
                      <td colSpan={summaryCols.length + 2} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                        No students found matching your search.
                      </td>
                    </tr>
                  ) : (
                    filteredEntries.map(entry => (
                      <tr key={entry.id} onClick={() => openDetailsModal(entry)} style={{ cursor: 'pointer' }}>
                        <td className="row-number-cell">{entry.rowNumber}</td>
                        {summaryCols.map(col => {
                          const val = entry.cells[String(col.id)];
                          if (col.type === 'image') {
                            return (
                              <td key={col.id}>
                                {val ? (
                                  <img
                                    src={val}
                                    alt="thumbnail"
                                    style={{
                                      width: '32px',
                                      height: '32px',
                                      borderRadius: '6px',
                                      objectFit: 'cover',
                                      border: '1px solid var(--border)'
                                    }}
                                  />
                                ) : (
                                  <span style={{ color: 'var(--text-muted)' }}>—</span>
                                )}
                              </td>
                            );
                          }
                          return (
                            <td key={col.id}>
                              {val || <span style={{ color: 'var(--text-muted)' }}>—</span>}
                            </td>
                          );
                        })}
                        <td style={{ textAlign: 'center' }}>
                          <button
                            onClick={(e) => { e.stopPropagation(); openDetailsModal(entry); }}
                            style={{
                              padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--accent)',
                              background: 'var(--accent-light)', color: 'var(--accent)', cursor: 'pointer',
                              fontSize: '11px', fontWeight: 700, transition: 'var(--transition)'
                            }}
                            className="view-btn"
                          >
                            View Details
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Vertical Detail Modal (Clean Form layout with explicit Save/Close buttons) */}
      {selectedEntry && (() => {
        const headerInfo = getModalHeaderDetails(selectedEntry);
        return (
          <div 
            style={{
              position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.4)',
              backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
              zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: 'fadeIn 0.2s ease-out'
            }} 
            onClick={() => !saving && setSelectedEntry(null)}
          >
            <div 
              onClick={e => e.stopPropagation()} 
              style={{
                background: 'var(--bg-secondary)', borderRadius: '20px', padding: '32px',
                width: '680px', maxWidth: '92vw', maxHeight: '88vh', overflowY: 'auto',
                border: '1px solid rgba(0, 0, 0, 0.08)', boxShadow: 'var(--shadow-lg)'
              }}
            >
              {/* Modal Header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px', borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
                <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyCenter: 'center', flexShrink: 0 }}>
                    <User size={22} color="var(--accent)" style={{ margin: 'auto' }} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                      {headerInfo.name}
                    </h3>
                    <div style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {headerInfo.course && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Book size={12} color="var(--text-muted)" /> {headerInfo.course}</span>}
                      {headerInfo.id && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><CreditCard size={12} color="var(--text-muted)" /> Roll No: {headerInfo.id}</span>}
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => !saving && setSelectedEntry(null)} 
                  disabled={saving}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '6px', display: 'flex', borderRadius: '50%' }}
                  className="modal-close-btn"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Modal Fields List (Single column, line-by-line) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxHeight: '55vh', overflowY: 'auto', paddingRight: '6px' }} className="modal-fields-container">
                {columns.map(col => {
                  const colId = String(col.id);
                  const isPaymentCol = col.name.toLowerCase().includes('pay') || col.name.toLowerCase().includes('fee') || col.name.toLowerCase().includes('bill');

                  return (
                    <div 
                      key={colId} 
                      style={{ 
                        display: 'flex', flexDirection: 'column', gap: '6px'
                      }}
                    >
                      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {col.name}
                        {isPaymentCol && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent)' }} />}
                      </label>
                      
                      {renderFormFieldInput(col)}
                    </div>
                  );
                })}
              </div>

              {/* Modal Footer with explicit Save and Close buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '28px', paddingTop: '18px', borderTop: '1px solid var(--border)' }}>
                <button 
                  onClick={() => setSelectedEntry(null)} 
                  disabled={saving}
                  style={{
                    padding: '10px 24px', borderRadius: '10px', border: '1px solid var(--border)',
                    background: 'var(--bg-card)', color: 'var(--text-secondary)', cursor: 'pointer',
                    fontSize: '13px', fontWeight: 700, transition: 'var(--transition)'
                  }}
                  className="modal-footer-close-btn"
                >
                  Cancel
                </button>
                {user?.canEdit && (
                  <button 
                    onClick={handleSaveAll} 
                    disabled={saving}
                    style={{
                      padding: '10px 24px', borderRadius: '10px', border: 'none',
                      background: 'linear-gradient(135deg, #1a73e8, #1557b0)', color: 'white', cursor: 'pointer',
                      fontSize: '13px', fontWeight: 700, transition: 'var(--transition)',
                      boxShadow: '0 4px 12px rgba(26, 115, 232, 0.2)'
                    }}
                    className="modal-save-btn"
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Toast notifications */}
      {toast && (
        <div className={`toast ${toast.type}`}>
          {toast.type === 'success' ? '✓' : '✕'} {toast.message}
        </div>
      )}

      {/* Additional UI hover styles */}
      <style>{`
        .view-btn:hover {
          background: var(--accent) !important;
          color: white !important;
          box-shadow: 0 4px 12px rgba(26, 115, 232, 0.2);
        }
        .modal-close-btn:hover {
          background: rgba(0, 0, 0, 0.04) !important;
          color: var(--text-primary) !important;
        }
        .modal-footer-close-btn:hover {
          background: #f1f5f9 !important;
          color: var(--text-primary) !important;
        }
        .modal-save-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(26, 115, 232, 0.3) !important;
        }
        .modal-save-btn:active {
          transform: translateY(0);
        }
        .modal-save-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }
        .form-select-theme {
          appearance: none;
          background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
          background-repeat: no-repeat;
          background-position: right 12px center;
          background-size: 14px;
          padding-right: 36px !important;
        }
        @media (max-width: 600px) {
          .modal-fields-container {
            grid-template-columns: 1fr !important;
          }
          .modal-fields-container > div {
            grid-column: span 1 !important;
          }
        }
      `}</style>
    </div>
  );
}
