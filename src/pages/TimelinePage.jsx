import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../utils/api';
import { uploadToCloudinary } from '../utils/cloudinary';
import { BookOpen, LayoutDashboard, Clock, LogOut, Menu, X, Search, User, Book, CreditCard, ChevronRight, Edit3, Calendar, Upload } from 'lucide-react';

export default function TimelinePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // Modal & Form Edit States
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [tempCells, setTempCells] = useState({}); // Stores form values during modal edits
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  // Trigger search on query change (debounced)
  useEffect(() => {
    if (!searchQuery.trim()) {
      setRecords([]);
      return;
    }
    const timer = setTimeout(() => {
      fetchTimeline();
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  async function fetchTimeline() {
    try {
      setLoading(true);
      const res = await apiFetch(`/api/student-timeline?search=${encodeURIComponent(searchQuery.trim())}`);
      const data = await res.json();
      setRecords(data.records || []);
    } catch (err) {
      console.error('Timeline fetch error:', err);
    } finally {
      setLoading(false);
    }
  }

  function openDetailsModal(record) {
    setSelectedRecord(record);
    const cells = {};
    record.fields.forEach(f => {
      let val = f.value || '';
      if (f.columnType === 'date' && val) {
        const parts = val.split('-');
        if (parts.length === 3) {
          val = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
      }
      cells[String(f.columnId)] = val;
    });
    setTempCells(cells);
  }

  async function handleSaveAll() {
    if (!selectedRecord || saving) return;
    setSaving(true);

    const changedFields = [];
    
    // Identify changed fields and prepare values
    for (const f of selectedRecord.fields) {
      const colId = String(f.columnId);
      const originalValue = f.value || '';
      let newValue = tempCells[colId] || '';

      if (f.columnType === 'date' && newValue) {
        const parts = newValue.split('-');
        if (parts.length === 3) {
          newValue = `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
      }

      if (String(newValue) !== String(originalValue)) {
        // If it's a new base64 image upload, upload to Cloudinary first
        if (f.columnType === 'image' && newValue.startsWith('data:image/')) {
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
          columnName: f.columnName,
          columnType: f.columnType
        });
      }
    }

    if (changedFields.length === 0) {
      setSelectedRecord(null);
      setSaving(false);
      return;
    }

    try {
      for (const field of changedFields) {
        await apiFetch(`/api/entries/${selectedRecord.registerId}/${selectedRecord.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            columnId: field.columnId,
            value: field.value,
            columnName: field.columnName
          })
        });
      }

      // Update local state list
      setRecords(prev => prev.map(r => {
        if (r.id === selectedRecord.id) {
          const updatedFields = r.fields.map(f => {
            const change = changedFields.find(cf => String(cf.columnId) === String(f.columnId));
            if (change) {
              return { ...f, value: change.value };
            }
            return f;
          });

          // Also update studentName, course, or rollNo if their columns changed!
          let studentName = r.studentName;
          let course = r.course;
          let rollNo = r.rollNo;

          updatedFields.forEach(f => {
            if (f.columnName.toLowerCase().includes('name') && f.value) {
              studentName = f.value;
            }
            if ((f.columnName.toLowerCase().includes('course') || f.columnName.toLowerCase().includes('department') || f.columnName.toLowerCase().includes('dept') || f.columnName.toLowerCase().includes('branch')) && f.value) {
              course = f.value;
            }
            if ((f.columnName.toLowerCase().includes('id') || f.columnName.toLowerCase().includes('rb') || f.columnName.toLowerCase().includes('roll')) && f.value) {
              rollNo = f.value;
            }
          });

          return {
            ...r,
            fields: updatedFields,
            studentName,
            course,
            rollNo
          };
        }
        return r;
      }));

      showToast('Changes saved successfully', 'success');
      setSelectedRecord(null);
    } catch (err) {
      showToast('Failed to save changes', 'error');
    } finally {
      setSaving(false);
    }
  }

  function showToast(message, type = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  function handleLogout() {
    logout();
    navigate('/login');
  }

  function renderFormFieldInput(fld) {
    const colId = String(fld.columnId);
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

    if (fld.columnType === 'image') {
      const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onloadend = () => {
          setTempCells(prev => ({ ...prev, [colId]: reader.result })); // Save Base64
        };
        reader.readAsDataURL(file);
      };

      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
          {val ? (
            <div style={{ position: 'relative', width: 'fit-content' }}>
              <img
                src={val}
                alt={fld.columnName}
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
                  onClick={() => setTempCells(prev => ({ ...prev, [colId]: '' }))}
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

    if (fld.columnType === 'dropdown' && fld.dropdownOptions && fld.dropdownOptions.length > 0) {
      return (
        <select
          value={val}
          onChange={e => setTempCells(prev => ({ ...prev, [colId]: e.target.value }))}
          disabled={!isEditable}
          style={inputStyle}
          className="form-select-theme"
        >
          <option value="">Select</option>
          {fld.dropdownOptions.map((opt, idx) => (
            <option key={idx} value={opt}>{opt}</option>
          ))}
        </select>
      );
    }

    if (fld.columnType === 'date') {
      return (
        <input
          type="date"
          value={val}
          onChange={e => setTempCells(prev => ({ ...prev, [colId]: e.target.value }))}
          disabled={!isEditable}
          style={inputStyle}
        />
      );
    }

    if (fld.columnType === 'number' || fld.columnType === 'currency') {
      return (
        <input
          type="number"
          value={val}
          onChange={e => setTempCells(prev => ({ ...prev, [colId]: e.target.value }))}
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
        onChange={e => setTempCells(prev => ({ ...prev, [colId]: e.target.value }))}
        disabled={!isEditable}
        style={inputStyle}
        placeholder="—"
      />
    );
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
          <h1 className="page-title">Student Search & Entry</h1>
          <p className="page-subtitle">Search by student name, ID, course, or department to view and edit details across all registers</p>
        </div>

        {/* Search */}
        <div className="search-bar animate-fade" style={{ marginBottom: '28px' }}>
          <Search size={16} />
          <input
            placeholder="Type student name, ID, department, or roll number..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            autoFocus
          />
        </div>

        {loading ? (
          <div className="empty-state"><div className="loading-spinner" /><p>Finding student records...</p></div>
        ) : records.length === 0 ? (
          <div className="empty-state animate-fade">
            <User size={44} style={{ opacity: 0.2 }} />
            <p style={{ fontWeight: 600 }}>{searchQuery ? 'No records found' : 'Ready to search'}</p>
            <p style={{ fontSize: '12px', marginTop: '4px' }}>
              {searchQuery ? 'Try searching with a different name or spelling.' : 'Enter student name, ID, or department above to find records.'}
            </p>
          </div>
        ) : (
          <div className="data-table-wrapper animate-fade">
            <div className="data-table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: '60px', textAlign: 'center' }}>#</th>
                    <th>STU ID</th>
                    <th>STUDENT NAME</th>
                    <th>COURSE</th>
                    <th>REGISTER</th>
                    <th style={{ width: '120px', textAlign: 'center' }}>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((rec, rIdx) => (
                    <tr key={rec.id} onClick={() => openDetailsModal(rec)} style={{ cursor: 'pointer' }}>
                      <td className="row-number-cell">{rIdx + 1}</td>
                      <td>{rec.rollNo || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                      <td style={{ fontWeight: 700 }}>{rec.studentName}</td>
                      <td>{rec.course || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                      <td>
                        <span style={{ fontSize: '11px', fontWeight: 700, padding: '4px 8px', borderRadius: '6px', background: 'rgba(26, 115, 232, 0.08)', color: 'var(--accent)' }}>
                          {rec.registerName}
                        </span>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '8px' }}>
                          Row #{rec.rowNumber}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); openDetailsModal(rec); }}
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
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Edit Details Modal */}
      {selectedRecord && (() => {
        return (
          <div 
            style={{
              position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.4)',
              backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
              zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: 'fadeIn 0.2s ease-out'
            }} 
            onClick={() => !saving && setSelectedRecord(null)}
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
                      {selectedRecord.studentName}
                    </h3>
                    <div style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {selectedRecord.course && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Book size={12} color="var(--text-muted)" /> {selectedRecord.course}</span>}
                      {selectedRecord.rollNo && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><CreditCard size={12} color="var(--text-muted)" /> Roll No: {selectedRecord.rollNo}</span>}
                      <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', background: 'rgba(26, 115, 232, 0.08)', color: 'var(--accent)' }}>
                        {selectedRecord.registerName}
                      </span>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => !saving && setSelectedRecord(null)} 
                  disabled={saving}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '6px', display: 'flex', borderRadius: '50%' }}
                  className="modal-close-btn"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Modal Fields list (Single column, line-by-line) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxHeight: '55vh', overflowY: 'auto', paddingRight: '6px' }} className="modal-fields-container">
                {selectedRecord.fields.map(fld => {
                  const colId = String(fld.columnId);
                  const isPaymentCol = fld.columnName.toLowerCase().includes('pay') || fld.columnName.toLowerCase().includes('fee') || fld.columnName.toLowerCase().includes('bill');

                  return (
                    <div 
                      key={colId} 
                      style={{ 
                        display: 'flex', flexDirection: 'column', gap: '6px'
                      }}
                    >
                      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {fld.columnName}
                        {isPaymentCol && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent)' }} />}
                      </label>
                      
                      {renderFormFieldInput(fld)}
                    </div>
                  );
                })}
              </div>

              {/* Modal Footer */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '28px', paddingTop: '18px', borderTop: '1px solid var(--border)' }}>
                <button 
                  onClick={() => setSelectedRecord(null)} 
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
