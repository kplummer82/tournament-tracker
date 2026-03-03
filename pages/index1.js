// pages/index.js
import { useState, useEffect } from 'react';
import { Autocomplete, TextField, Box, Button, Typography, Stack } from '@mui/material';
import { useRouter } from 'next/router';
import CreateTournamentModal from '../components/CreateTournamentModal';

export default function Home() {
  const router = useRouter();

  // --- modal open/close state ---
  const [createOpen, setCreateOpen] = useState(false);

  // --- your existing state ---
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [filters, setFilters] = useState({
    name: '',
    city: '',
    state: '',
    year: '',
    division: '' // include division in filter state
  });

  // Fetch suggestions as user types (3+ chars)
  useEffect(() => {
    if (searchTerm.length >= 3) {
      fetch('/api/search-tournaments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchTerm })
      })
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) setSuggestions(data);
        })
        .catch((err) => console.error('Suggestion fetch error:', err));
    }
  }, [searchTerm]);

  const handleSearch = async () => {
    const res = await fetch('/api/search-tournaments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(filters),
    });
    const data = await res.json();
    setResults(Array.isArray(data) ? data : []);
  };

  return (
    <Box sx={{ padding: 4 }}>
      <Autocomplete
        freeSolo
        options={suggestions.map((opt) => `${opt.name} — ${opt.city}, ${opt.state}`)}
        onInputChange={(event, newInputValue) => {
          setSearchTerm(newInputValue);
        }}
        renderInput={(params) => (
          <TextField {...params} label="Quick Search" placeholder="Start typing..." sx={{ marginBottom: 2 }} />
        )}
      />

      <TextField
        label="Tournament Name"
        value={filters.name}
        onChange={(e) => setFilters({ ...filters, name: e.target.value })}
        sx={{ display: 'block', marginBottom: 2 }}
      />
      <TextField
        label="City"
        value={filters.city}
        onChange={(e) => setFilters({ ...filters, city: e.target.value })}
        sx={{ display: 'block', marginBottom: 2 }}
      />
      <TextField
        label="State"
        value={filters.state}
        onChange={(e) => setFilters({ ...filters, state: e.target.value })}
        sx={{ display: 'block', marginBottom: 2 }}
      />
      <TextField
        label="Year"
        value={filters.year}
        onChange={(e) => setFilters({ ...filters, year: e.target.value })}
        sx={{ display: 'block', marginBottom: 2 }}
      />
      <TextField
        label="Division"
        value={filters.division}
        onChange={(e) => setFilters({ ...filters, division: e.target.value })}
        sx={{ display: 'block', marginBottom: 2 }}
      />

      {/* Buttons row: Search + Create Tournament */}
      <Stack direction="row" spacing={2} sx={{ marginBottom: 4 }}>
        <Button variant="contained" onClick={handleSearch}>
          Search Tournaments
        </Button>
        <Button
          variant="outlined"
          color="primary"
          onClick={() => setCreateOpen(true)}
        >
          + Create Tournament
        </Button>
      </Stack>

      {results.length > 0 && (
        <Box>
          <Typography variant="h6">Search Results:</Typography>
          {results.map((r, idx) => (
            <Box key={idx} sx={{ padding: 1, borderBottom: '1px solid #ccc' }}>
              <strong>{r.name}</strong> <strong>{r.division}</strong> — {r.city}, {r.state} ({r.year})
            </Box>
          ))}
        </Box>
      )}

      {/* Modal mounts here so it overlays this page */}
      {createOpen && (
        <CreateTournamentModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => {
            setCreateOpen(false);
            router.push(`/tournaments/${id}`);
          }}
        />
      )}
    </Box>
  );
}