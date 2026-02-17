import { html, render, useState, useEffect, useCallback, useRef } from 'https://unpkg.com/htm@3.1.1/preact/standalone.module.js';
import { analyzeSong, generateSheet } from './api.js';
import { renderABC, validateABC, clearRender } from './renderer.js';
import { initFirebase, storage } from './storage.js';

// ===== Firebase Config =====
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDz2OdZtz0VEFpLyCS5i9NmnXHlmaLG8tY",
  authDomain: "sheet-music-9c1e9.firebaseapp.com",
  projectId: "sheet-music-9c1e9",
  storageBucket: "sheet-music-9c1e9.firebasestorage.app",
  messagingSenderId: "818687449563",
  appId: "1:818687449563:web:be05c9d599c0e08038effe",
  measurementId: "G-RFX12JTGVQ"
};

// ===== Toast System =====
let toastTimeout = null;
function showToast(message, type = 'success') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('show'));

  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ===== App Component =====
function App() {
  const [view, setView] = useState('search'); // 'search' | 'library'
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState('simple'); // 'simple' | 'detailed'
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [error, setError] = useState(null);
  const [currentSong, setCurrentSong] = useState(null);
  const [savedSongs, setSavedSongs] = useState([]);
  const [firebaseOk, setFirebaseOk] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const sheetRef = useRef(null);

  // Initialize Firebase
  useEffect(() => {
    if (FIREBASE_CONFIG.apiKey) {
      initFirebase(FIREBASE_CONFIG)
        .then(() => { setFirebaseOk(true); loadSavedSongs(); })
        .catch(err => console.warn('Firebase init failed:', err));
    }
  }, []);

  // Render sheet music when currentSong changes
  useEffect(() => {
    if (!currentSong) return;

    const abcData = mode === 'detailed' && currentSong.detailed
      ? currentSong.detailed.abcNotation
      : currentSong.simple?.abcNotation;

    if (abcData) {
      setTimeout(() => renderABC('sheet-music', abcData), 50);
    }
  }, [currentSong, mode]);

  // PWA install prompt
  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // Register service worker
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  async function loadSavedSongs() {
    try {
      const songs = await storage.listSongs();
      setSavedSongs(songs);
    } catch (err) {
      console.warn('Failed to load saved songs:', err);
    }
  }

  async function handleSearch(e) {
    e.preventDefault();
    if (!query.trim() || loading) return;

    setLoading(true);
    setError(null);
    setCurrentSong(null);
    clearRender('sheet-music');

    try {
      setLoadingStep('Analyzing song...');
      const result = await analyzeSong(query.trim(), mode);
      setCurrentSong(result);

      if (mode === 'detailed' && !result.detailed) {
        setLoadingStep('Generating piano arrangement...');
        const sheetData = await generateSheet({
          title: result.title,
          artist: result.artist,
          simple: result.simple
        });
        setCurrentSong(prev => ({ ...prev, detailed: sheetData }));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  }

  async function handleSave() {
    if (!currentSong || !firebaseOk) {
      showToast('Cannot save - Firebase not configured', 'error');
      return;
    }

    try {
      const saved = await storage.saveSong(currentSong);
      showToast('Song saved!');
      await loadSavedSongs();
    } catch (err) {
      showToast('Failed to save: ' + err.message, 'error');
    }
  }

  async function handleDelete(songId) {
    try {
      await storage.deleteSong(songId);
      showToast('Song deleted');
      setSavedSongs(prev => prev.filter(s => s.id !== songId));
      if (currentSong?.id === songId) setCurrentSong(null);
    } catch (err) {
      showToast('Failed to delete: ' + err.message, 'error');
    }
  }

  function handleLoadSaved(song) {
    setCurrentSong(song);
    setView('search');
    setMode(song.detailed ? 'detailed' : 'simple');
  }

  async function handleModeSwitch(newMode) {
    setMode(newMode);

    if (newMode === 'detailed' && currentSong && !currentSong.detailed) {
      setLoading(true);
      setLoadingStep('Generating piano arrangement...');
      setError(null);

      try {
        const sheetData = await generateSheet({
          title: currentSong.title,
          artist: currentSong.artist,
          simple: currentSong.simple
        });
        setCurrentSong(prev => ({ ...prev, detailed: sheetData }));
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
        setLoadingStep('');
      }
    }
  }

  async function handleInstall() {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  // ===== Render =====
  return html`
    <div class="header">
      <h1>Piano Sheet Music</h1>
      <div class="header-actions">
        ${currentSong && html`
          <button class="btn-icon" onClick=${handleSave} title="Save song">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
              <polyline points="17 21 17 13 7 13 7 21"/>
              <polyline points="7 3 7 8 15 8"/>
            </svg>
          </button>
        `}
      </div>
    </div>

    <nav class="nav-tabs">
      <button class="nav-tab ${view === 'search' ? 'active' : ''}"
        onClick=${() => setView('search')}>Search</button>
      <button class="nav-tab ${view === 'library' ? 'active' : ''}"
        onClick=${() => { setView('library'); loadSavedSongs(); }}>Library</button>
    </nav>

    ${view === 'search' ? html`
      <div class="search-container">
        <form class="search-box" onSubmit=${handleSearch}>
          <input class="search-input"
            type="text"
            placeholder="Song title or artist..."
            value=${query}
            onInput=${(e) => setQuery(e.target.value)}
            disabled=${loading}
          />
          <button class="search-btn" type="submit" disabled=${loading || !query.trim()}>
            ${loading ? '...' : 'Go'}
          </button>
        </form>
      </div>

      <div class="mode-toggle">
        <button class="mode-btn ${mode === 'simple' ? 'active' : ''}"
          onClick=${() => handleModeSwitch('simple')}>
          Simple (Chords)
        </button>
        <button class="mode-btn ${mode === 'detailed' ? 'active' : ''}"
          onClick=${() => handleModeSwitch('detailed')}>
          Detailed (Full)
        </button>
      </div>

      <div class="content">
        ${loading && html`
          <div class="loading-container">
            <div class="spinner"></div>
            <div class="loading-text">${loadingStep || 'Loading...'}</div>
          </div>
        `}

        ${error && html`
          <div class="error-message">${error}</div>
        `}

        ${!loading && !error && !currentSong && html`
          <div class="empty-state">
            <div class="empty-state-icon">&#9835;</div>
            <div class="empty-state-text">Search for any song</div>
            <div class="empty-state-hint">Get chords or full piano sheet music</div>
          </div>
        `}

        ${currentSong && !loading && html`
          <${SongCard}
            song=${currentSong}
            mode=${mode}
          />
        `}
      </div>
    ` : html`
      <div class="content" style="padding-top: 16px">
        ${savedSongs.length === 0 ? html`
          <div class="empty-state">
            <div class="empty-state-icon">&#9834;</div>
            <div class="empty-state-text">No saved songs yet</div>
            <div class="empty-state-hint">Search and save songs to access them here</div>
          </div>
        ` : savedSongs.map(song => html`
          <div class="saved-song-item" key=${song.id} onClick=${() => handleLoadSaved(song)}>
            <div class="saved-song-info">
              <div class="song-title">${song.title}</div>
              <div class="song-artist">${song.artist}</div>
            </div>
            <div class="saved-song-actions">
              <button class="btn-icon" onClick=${(e) => { e.stopPropagation(); handleDelete(song.id); }}
                title="Delete">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
              </button>
            </div>
          </div>
        `)}
      </div>
    `}

    ${installPrompt && html`
      <div class="install-prompt">
        <span class="install-prompt-text">Add to home screen for the best experience</span>
        <button class="btn btn-save" onClick=${handleInstall}>Install</button>
        <button class="btn-icon" onClick=${() => setInstallPrompt(null)}>✕</button>
      </div>
    `}
  `;
}

// ===== Song Card Component =====
function SongCard({ song, mode }) {
  const showDetailed = mode === 'detailed' && song.detailed;
  const simple = song.simple;

  return html`
    <div class="song-card">
      <div class="song-card-header">
        <div>
          <div class="song-title">${song.title}</div>
          <div class="song-artist">${song.artist}</div>
        </div>
      </div>

      ${simple && html`
        <div class="song-meta">
          ${simple.key && html`<span class="meta-badge">Key: ${simple.key}</span>`}
          ${simple.timeSignature && html`<span class="meta-badge">${simple.timeSignature}</span>`}
          ${simple.tempo && html`<span class="meta-badge">${simple.tempo}</span>`}
        </div>
      `}

      ${!showDetailed && simple?.chordProgression && html`
        ${simple.chordProgression.map(section => html`
          <div class="chord-section" key=${section.section}>
            <div class="chord-section-title">${section.section}</div>
            <div class="chord-row">
              ${section.chords.map(chord => html`
                <span class="chord" key=${chord}>${chord}</span>
              `)}
            </div>
          </div>
        `)}
      `}

      ${showDetailed && song.detailed?.sections && html`
        <div class="section-tabs">
          ${song.detailed.sections.map(s => html`
            <button class="section-tab" key=${s}>${s}</button>
          `)}
        </div>
      `}

      <div class="sheet-music-container" style="margin-top: 12px">
        <div id="sheet-music"></div>
      </div>

      ${song.detailed?.notes && showDetailed && html`
        <p style="margin-top: 10px; font-size: 0.85rem; color: var(--text-secondary)">
          ${song.detailed.notes}
        </p>
      `}
    </div>
  `;
}

// ===== Mount =====
render(html`<${App} />`, document.getElementById('app'));
