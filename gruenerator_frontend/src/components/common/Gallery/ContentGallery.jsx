import React, { useEffect, useMemo, useState } from 'react';
import { useContentGallery } from '../../../hooks/useContentGallery';
import GalleryLayout from './GalleryLayout';
import SearchBar from './SearchBar';
import CategorySelector from '../CategorySelector';

// Verfügbare Inhaltstypen
const contentTypes = [
  { id: 'all', label: 'Alle Kategorien' },
  { id: 'antraege', label: 'Anträge' },
  { id: 'generators', label: 'Grüneratoren' },
  { id: 'pr', label: 'Öffentlichkeitsarbeit', disabled: false }
];

// Suchoptionen
const searchModeOptions = [
  { value: 'title', label: 'Titel' },
  { value: 'fulltext', label: 'Volltext' },
  { value: 'examples', label: 'Beispiele (AI)' },
  { value: 'semantic', label: 'Semantisch' },
];

const ContentGallery = () => {
  // Base Gallery Hook für gemeinsame Funktionalität
  const {
    inputValue,
    searchTerm,
    searchMode,
    selectedCategory,
    contentType,
    setInputValue,
    setSearchMode,
    setSelectedCategory,
    setContentType
  } = useContentGallery('title');

  // Unified fetch from database
  const AUTH_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
  const PR_TYPES = ['instagram', 'facebook', 'twitter', 'linkedin', 'pressemitteilung', 'pr_text'];
  const ANTRAEGE_TYPES = ['antrag', 'kleine_anfrage', 'grosse_anfrage'];
  const GENERATOR_TYPES = ['template'];

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    const fetchSemantic = async () => {
      if (!searchTerm || !String(searchTerm).trim()) return null;

      // Map current contentType/selectedCategory to backend "type" param where appropriate
      let typeParam = undefined;
      if (contentType === 'pr') {
        // If a specific PR subtype is selected, pass it through
        const prSet = new Set(PR_TYPES);
        if (selectedCategory && selectedCategory !== 'all' && prSet.has(selectedCategory)) {
          typeParam = selectedCategory;
        }
      } else if (contentType === 'antraege') {
        typeParam = 'antrag';
      } else if (contentType === 'generators') {
        typeParam = 'template';
      }

      const url = `${AUTH_BASE_URL}/auth/examples/similar`;
      const body = {
        query: String(searchTerm).trim(),
        ...(typeParam ? { type: typeParam } : {}),
        limit: 200,
      };
      const res = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Semantische Suche fehlgeschlagen' }));
        throw new Error(err.message || 'Semantische Suche fehlgeschlagen');
      }
      const data = await res.json();
      // Endpoint returns { success, data: [...] }
      return Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
    };
    async function fetchData() {
      try {
        setLoading(true);
        setError(null);

        // Semantic vector search path
        if (searchMode === 'semantic' && searchTerm && String(searchTerm).trim()) {
          const semanticResults = await fetchSemantic();
          setItems(semanticResults || []);
          return;
        }

        // Default path: query unified database endpoint
        const params = new URLSearchParams();
        if (searchTerm) {
          params.append('searchTerm', searchTerm);
          if (searchMode) params.append('searchMode', searchMode);
        }
        if (selectedCategory && selectedCategory !== 'all') {
          params.append('category', selectedCategory);
        }
        // Filter by contentType via types param
        let types = [];
        if (contentType === 'pr') types = PR_TYPES;
        else if (contentType === 'antraege') types = ANTRAEGE_TYPES;
        else if (contentType === 'generators') types = GENERATOR_TYPES;
        if (types.length > 0) params.append('types', types.join(','));

        // Only examples and published
        params.append('onlyExamples', 'true');
        params.append('status', 'published');
        params.append('limit', '200');

        const url = `${AUTH_BASE_URL}/auth/database?${params.toString()}`;
        const res = await fetch(url, {
          method: 'GET',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ message: 'Failed to load database contents' }));
          throw new Error(err.message || 'Fehler beim Laden der Datenbank');
        }
        const data = await res.json();
        setItems(data?.data || []);
      } catch (e) {
        if (e.name !== 'AbortError') setError(e.message || String(e));
      } finally {
        setLoading(false);
      }
    }
    fetchData();
    return () => controller.abort();
  }, [AUTH_BASE_URL, searchTerm, searchMode, selectedCategory, contentType]);

  // Compute categories based on current content type scope
  const scopedItems = useMemo(() => {
    if (contentType === 'pr') return items.filter(i => PR_TYPES.includes(i.type));
    if (contentType === 'antraege') return items.filter(i => ANTRAEGE_TYPES.includes(i.type));
    if (contentType === 'generators') return items.filter(i => GENERATOR_TYPES.includes(i.type));
    return items;
  }, [items, contentType]);

  const categoriesForFilter = useMemo(() => {
    const set = new Set();
    scopedItems.forEach(it => {
      (Array.isArray(it.categories) ? it.categories : []).forEach(c => c && set.add(c));
    });
    const list = Array.from(set).sort().map(c => ({ id: c, label: c }));
    return list;
  }, [scopedItems]);

  const ContentCard = ({ item }) => {
    const text = item?.content_data?.content || item?.content_data?.caption || item?.description || '';
    return (
      <div className="gallery-item-card">
        <div>
          <h3 className="antrag-card-title">{item.title}</h3>
          {text && <p className="antrag-card-description">{String(text).slice(0, 180)}{String(text).length > 180 ? '…' : ''}</p>}
        </div>
        <p className="antrag-card-date">{item.type} · {new Date(item.created_at).toLocaleDateString('de-DE')}</p>
      </div>
    );
  };


  // Titel und Intro-Text je nach Inhaltstyp
  const getTitle = () => {
    switch (contentType) {
      case 'all': return 'Datenbank';
      case 'antraege': return 'Antragsdatenbank';
      case 'generators': return 'Grüneratoren-Datenbank';
      case 'pr': return 'Öffentlichkeitsarbeit-Datenbank';
      default: return 'Datenbank';
    }
  };

  const getIntroText = () => {
    switch (contentType) {
      case 'all': return 'Durchsuchen Sie unsere gesamte Datenbank mit allen Inhalten.';
      case 'antraege': return 'Durchsuchen und verwalten Sie hier eingereichte Anträge.';
      case 'generators': return 'Durchsuchen und verwalten Sie hier benutzerdefinierte Grüneratoren.';
      case 'pr': return 'Durchsuchen und verwalten Sie hier Texte für die Öffentlichkeitsarbeit.';
      default: return 'Durchsuchen Sie unsere Datenbank.';
    }
  };

  // Content basierend auf dem ausgewählten Typ rendern
  const renderContent = () => {
    if (loading) return <p>Lade Inhalte…</p>;
    if (error) return <p className="error-message">{error}</p>;

    // Wenn "Alle" ausgewählt ist, gruppiere Abschnitte
    if (contentType === 'all') {
      const antraege = items.filter(i => ANTRAEGE_TYPES.includes(i.type));
      const pr = items.filter(i => PR_TYPES.includes(i.type));
      const templates = items.filter(i => GENERATOR_TYPES.includes(i.type));
      return (
        <div className="all-content-container">
          <div className="content-section">
            <h2 className="content-section-title">Anträge</h2>
            <div className="content-section-grid">
              {antraege.map(item => (<ContentCard key={item.id} item={item} />))}
            </div>
          </div>
          <div className="content-section">
            <h2 className="content-section-title">Grüneratoren</h2>
            <div className="content-section-grid">
              {templates.map(item => (<ContentCard key={item.id} item={item} />))}
            </div>
          </div>
          <div className="content-section">
            <h2 className="content-section-title">Öffentlichkeitsarbeit</h2>
            <div className="content-section-grid">
              {pr.map(item => (<ContentCard key={item.id} item={item} />))}
            </div>
          </div>
        </div>
      );
    }

    // Einzelner Bereich
    const list = scopedItems;
    if (!list || list.length === 0) return <p>Keine Einträge gefunden.</p>;
    return (
      <div className="content-section-grid">
        {list.map(item => (<ContentCard key={item.id} item={item} />))}
      </div>
    );
  };

  const mainSearchBarElement = (
    <SearchBar
      searchTerm={inputValue}
      onSearchChange={setInputValue}
      searchDepthOptions={searchModeOptions.map(opt => ({...opt, disabled: opt.disabled}))}
      currentSearchDepth={searchMode}
      onSearchDepthChange={setSearchMode}
      contentType={contentType}
      categories={[{ id: 'all', label: 'Alle Kategorien' }, ...categoriesForFilter]}
      selectedCategory={selectedCategory}
      onCategoryChange={setSelectedCategory}
      showCategoryFilter={contentType !== 'all' && categoriesForFilter && categoriesForFilter.length > 0}
    />
  );

  const contentTypeSelectorElement = (
    <CategorySelector
      categories={contentTypes}
      activeCategory={contentType}
      onCategoryChange={setContentType}
    />
  );

  return (
    <GalleryLayout
      title={getTitle()}
      introText={getIntroText()}
      mainSearchBar={mainSearchBarElement}
      contentTypeSelectorElement={contentTypeSelectorElement}
      categoryFilter={null}
    >
      {renderContent()}
    </GalleryLayout>
  );
};

export default ContentGallery; 