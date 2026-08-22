import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  deleteDocument,
  getProfile,
  listDocuments,
  openDocument,
  uploadVaultDocument,
} from '../api'
import { useProfiles } from '../context/ProfileContext'

const TYPES = [
  ['lab', '🧪', 'لیب رپورٹ', 'Lab report'],
  ['prescription', '📝', 'نسخہ', 'Prescription paper'],
  ['xray', '🩻', 'ایکس رے', 'X-ray'],
  ['mri', '🧠', 'ایم آر آئی', 'MRI / scan'],
  ['skin', '🖼️', 'جلد کی تصویر', 'Skin photo'],
  ['other', '📄', 'دیگر', 'Other document'],
]
const ICONS = Object.fromEntries(TYPES.map(([type, icon]) => [type, icon]))

function fmtBytes(bytes) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function DocumentsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { refresh } = useProfiles()
  const fileRef = useRef(null)
  const [profile, setProfile] = useState(null)
  const [documents, setDocuments] = useState([])
  const [documentType, setDocumentType] = useState('lab')
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    const [patient, items] = await Promise.all([getProfile(id), listDocuments(id)])
    setProfile(patient)
    setDocuments(items)
  }

  useEffect(() => {
    let alive = true
    Promise.all([getProfile(id), listDocuments(id)])
      .then(([patient, items]) => {
        if (alive) {
          setProfile(patient)
          setDocuments(items)
        }
      })
      .catch((err) => alive && setError(err.message))
    return () => { alive = false }
  }, [id])

  async function onUpload(event) {
    event.preventDefault()
    if (documentType === 'lab') {
      navigate(`/profile/${id}/lab`)
      return
    }
    if (documentType === 'prescription') {
      navigate(`/profile/${id}/prescription`)
      return
    }
    if (!file) return setError('Please choose a file first.')
    setBusy(true)
    setError('')
    try {
      await uploadVaultDocument(id, documentType, file, title, notes)
      setFile(null)
      setTitle('')
      setNotes('')
      if (fileRef.current) fileRef.current.value = ''
      await Promise.all([load(), refresh()])
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function onDelete(document) {
    if (!window.confirm(`Delete “${document.title}” from this patient's vault?`)) return
    try {
      await deleteDocument(document.id)
      await Promise.all([load(), refresh()])
    } catch (err) {
      setError(err.message)
    }
  }

  if (!profile && !error) return <div className="center-state"><div className="spinner" /></div>

  return (
    <div className="page">
      <button className="back-link" onClick={() => navigate(`/profile/${id}`)}>‹ Patient record</button>
      <div className="section-title">
        <span className="ur urdu">{profile?.display_name} کی دستاویزات</span>
        <span className="en">Private document vault — only this patient</span>
      </div>

      <form className="card document-upload" onSubmit={onUpload}>
        <div className="section-title" style={{ margin: 0 }}>
          <span className="ur urdu">نئی دستاویز محفوظ کریں</span>
          <span className="en">Upload a photo, scan, or PDF (maximum 15 MB)</span>
        </div>
        <div className="document-type-grid">
          {TYPES.map(([type, icon, urdu, english]) => (
            <button
              type="button"
              key={type}
              className={`document-type ${documentType === type ? 'active' : ''}`}
              onClick={() => setDocumentType(type)}
            >
              <span>{icon}</span><span className="urdu">{urdu}</span><small>{english}</small>
            </button>
          ))}
        </div>
        {!['lab', 'prescription'].includes(documentType) && (
          <input
            ref={fileRef}
            className="form-input"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,application/pdf,.dcm,.dicom"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
            required
          />
        )}
        <input
          className="form-input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Title (optional), e.g. Chest X-ray — Aug 2026"
          maxLength={200}
        />
        <textarea
          className="form-input document-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Patient history or note about this document (optional)"
          maxLength={2000}
        />
        {documentType === 'prescription' && (
          <div className="notice notice-info">
            <span className="ur urdu">یہاں نسخہ صرف محفوظ ہوگا۔ ادویات شامل کرنے کے لیے نسخہ اسکین کریں اور ہر چیز کی تصدیق کریں۔</span>
            Prescription papers use the confirmation scanner. Nothing enters the Vault until you confirm every field.
          </div>
        )}
        {documentType === 'lab' && (
          <div className="notice notice-info">
            Lab reports use structured value extraction and highlight only values that are clearly outside the printed reference range.
          </div>
        )}
        {['xray', 'mri', 'skin'].includes(documentType) && (
          <div className="notice notice-info">
            Nabz extracts supportive context without diagnosing: radiology types use visible report text only, and skin photos use neutral visible observations.
          </div>
        )}
        {error && <div className="form-error">{error}</div>}
        <button className="btn btn-primary" disabled={busy}>
          {documentType === 'prescription'
            ? '📝 Open prescription confirmation'
            : documentType === 'lab'
              ? '🧪 Open lab extraction'
            : busy ? 'Saving…' : '🔒 Save to this patient’s vault'}
        </button>
      </form>

      <div className="section-title">
        <span className="ur urdu">محفوظ دستاویزات</span>
        <span className="en">{documents.length} files for {profile?.display_name}</span>
      </div>
      {documents.length === 0 ? (
        <div className="card empty-documents">No documents uploaded for this patient yet.</div>
      ) : (
        <div className="document-list">
          {documents.map((document) => (
            <div className="document-row" key={document.id}>
              <span className="document-icon">{ICONS[document.document_type] || '📄'}</span>
              <div className="document-info">
                <strong>{document.title}</strong>
                <span>{document.original_filename}{fmtBytes(document.size_bytes) ? ` · ${fmtBytes(document.size_bytes)}` : ''}</span>
                <span>{new Date(document.created_at).toLocaleDateString('en-GB')}</span>
                {document.notes && <small>{document.notes}</small>}
                {document.extracted_summary && (
                  <div className="document-extraction">
                    <small>AI-extracted supportive context · verify against original</small>
                    <p>{document.extracted_summary}</p>
                    {document.extracted_facts?.length > 0 && (
                      <ul>{document.extracted_facts.map((fact) => <li key={fact}>{fact}</li>)}</ul>
                    )}
                    {document.attention_items?.length > 0 && (
                      <div className="document-attention">
                        Review with clinician: {document.attention_items.join(' · ')}
                      </div>
                    )}
                  </div>
                )}
                {['ai_unavailable', 'failed', 'unreadable', 'stored_only'].includes(document.extraction_status) && (
                  <small>Structured extraction unavailable — original file stored safely.</small>
                )}
              </div>
              <div className="document-actions">
                <button onClick={() => openDocument(document)} aria-label="View document">View</button>
                {document.deletable && <button className="danger-link" onClick={() => onDelete(document)} aria-label="Delete document">Delete</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
