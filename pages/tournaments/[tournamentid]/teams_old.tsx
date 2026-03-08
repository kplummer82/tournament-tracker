import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';

type Team = {
  id: number;
  name: string;
  division: string;
  season: string;
  year: number;
  sport: string;
};

const DIVISIONS = ['6U','7U','8U','9U','10U','11U','12U','13U','14U','HS'] as const;
const SEASONS = ['Spring','Summer','Fall','Winter'] as const;
const SPORTS  = ['Boys Baseball','Girls Softball'] as const;

export default function TournamentTeamsPage() {
  const router = useRouter();
  const { tournamentid } = router.query;

  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchTeams = useCallback(async () => {
    if (!router.isReady || !tournamentid) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/tournaments/${tournamentid}/teams`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load teams');
      setTeams(data);
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Error loading teams');
    } finally {
      setLoading(false);
    }
  }, [router.isReady, tournamentid]);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  const onAddClick = () => {
    setEditingTeam(null);
    setModalOpen(true);
  };

  const onEditClick = (t: Team) => {
    setEditingTeam(t);
    setModalOpen(true);
  };

  const onDeleteClick = async (id: number) => {
    if (!confirm('Delete this team? This removes it from all tournaments.')) return;
    const res = await fetch(`/api/teams/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setTeams((prev) => prev.filter((x) => x.id !== id));
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data?.error || 'Delete failed');
    }
  };

  const header = useMemo(() => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '16px 0' }}>
      <h2 style={{ margin: 0 }}>Teams</h2>
      <button onClick={onAddClick} style={primaryBtn}>+ Add Team</button>
    </div>
  ), []);

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <Link href="/tournaments" style={{ textDecoration: 'none' }}>← Back to All Tournaments</Link>
      <h1 style={{ marginTop: 12, marginBottom: 16 }}>Tournament Teams</h1>

      {header}

      {!router.isReady || loading ? (
        <div>Loading…</div>
      ) : error ? (
        <div style={{ color: 'crimson' }}>{error}</div>
      ) : teams.length === 0 ? (
        <div style={emptyState}>
          <p>No teams yet.</p>
          <button onClick={onAddClick} style={primaryBtn}>Add the first team</button>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Team Name</th>
                <th style={th}>Division</th>
                <th style={th}>Season</th>
                <th style={th}>Year</th>
                <th style={th}>Sport</th>
                <th style={thRight}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((t) => (
                <tr key={t.id}>
                  <td style={td}>{t.name}</td>
                  <td style={td}>{t.division}</td>
                  <td style={td}>{t.season}</td>
                  <td style={td}>{t.year}</td>
                  <td style={td}>{t.sport}</td>
                  <td style={tdRight}>
                    <button onClick={() => onEditClick(t)} style={ghostBtn}>Edit</button>
                    <button onClick={() => onDeleteClick(t.id)} style={dangerBtn}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && router.isReady && typeof tournamentid === 'string' && (
        <TeamModal
          tournamentid={Number(tournamentid)}
          initial={editingTeam}
          onClose={() => setModalOpen(false)}
          onSaved={async () => {
            setModalOpen(false);
            await fetchTeams();
          }}
        />
      )}
    </div>
  );
}

function TeamModal({
  tournamentid,
  initial,
  onClose,
  onSaved,
}: {
  tournamentid: number;
  initial: Team | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [division, setDivision] = useState(initial?.division ?? '8U');
  const [season, setSeason] = useState(initial?.season ?? 'Spring');
  const [year, setYear] = useState(initial?.year?.toString() ?? new Date().getFullYear().toString());
  const [sport, setSport] = useState(initial?.sport ?? 'Boys Baseball');
  const [saving, setSaving] = useState(false);
  const isEdit = !!initial;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (isEdit) {
        const res = await fetch(`/api/teams/${initial!.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            division,
            season,
            year: Number(year),
            sport,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || 'Update failed');
        }
      } else {
        const res = await fetch(`/api/tournaments/${tournamentid}/teams`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            division,
            season,
            year: Number(year),
            sport,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || 'Create failed');
        }
      }
      await onSaved();
    } catch (err: any) {
      alert(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={backdrop}>
      <div style={modal}>
        <h3 style={{ marginTop: 0 }}>{isEdit ? 'Edit Team' : 'Add Team'}</h3>
        <form onSubmit={onSubmit}>
          <div style={fieldRow}>
            <label style={label}>Team Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} style={input} required />
          </div>

          <div style={twoCol}>
            <div style={col}>
              <label style={label}>Division</label>
              <select value={division} onChange={(e) => setDivision(e.target.value)} style={input}>
                {DIVISIONS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div style={col}>
              <label style={label}>Season</label>
              <select value={season} onChange={(e) => setSeason(e.target.value)} style={input}>
                {SEASONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div style={twoCol}>
            <div style={col}>
              <label style={label}>Year</label>
              <input type="number" value={year} onChange={(e) => setYear(e.target.value)} style={input} required />
            </div>
            <div style={col}>
              <label style={label}>Sport</label>
              <select value={sport} onChange={(e) => setSport(e.target.value)} style={input}>
                {SPORTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:16 }}>
            <button type="button" onClick={onClose} style={ghostBtn} disabled={saving}>Cancel</button>
            <button type="submit" style={primaryBtn} disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Team'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** styles (inline for easy drop-in) */
const table: React.CSSProperties = { borderCollapse: 'collapse', width: '100%' };
const th: React.CSSProperties = { textAlign: 'left', padding: '10px 8px', borderBottom: '1px solid #e5e7eb', fontWeight: 600, fontSize: 14 };
const thRight: React.CSSProperties = { ...th, textAlign: 'right' };
const td: React.CSSProperties = { padding: '10px 8px', borderBottom: '1px solid #f1f5f9', fontSize: 14, verticalAlign: 'middle' };
const tdRight: React.CSSProperties = { ...td, textAlign: 'right', whiteSpace: 'nowrap' };

const primaryBtn: React.CSSProperties = { padding: '8px 12px', border: 'none', borderRadius: 6, cursor: 'pointer', background: '#2563eb', color: 'white', fontWeight: 600 };
const ghostBtn: React.CSSProperties   = { padding: '8px 12px', borderRadius: 6, cursor: 'pointer', background: 'transparent', border: '1px solid #cbd5e1' };
const dangerBtn: React.CSSProperties  = { ...ghostBtn, color: '#b91c1c', borderColor: '#fecaca' };
const emptyState: React.CSSProperties = { padding: 24, border: '1px dashed #cbd5e1', borderRadius: 8, display: 'inline-flex', flexDirection:'column', gap: 8 };

const backdrop: React.CSSProperties   = { position:'fixed', inset:0, background:'rgba(0,0,0,0.3)', display:'grid', placeItems:'center', zIndex: 50 };
const modal: React.CSSProperties      = { width: 520, maxWidth:'90vw', background:'white', borderRadius:12, padding:20, boxShadow: '0 10px 30px rgba(0,0,0,0.2)' };
const input: React.CSSProperties      = { width:'100%', padding:'8px 10px', borderRadius:6, border:'1px solid #e5e7eb' };
const label: React.CSSProperties      = { display:'block', marginBottom:6, fontWeight:600, fontSize:13, color:'#334155' };
const fieldRow: React.CSSProperties   = { marginBottom:12 };
const twoCol: React.CSSProperties     = { display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 };
const col: React.CSSProperties        = { display:'flex', flexDirection:'column' };
