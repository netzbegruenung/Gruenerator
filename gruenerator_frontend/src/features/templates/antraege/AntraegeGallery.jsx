import React, { useState, useEffect, useCallback, useRef } from 'react';
import { templatesSupabase as supabase } from '../../../components/utils/templatesSupabaseClient.js';

// Import reusable gallery components
import GalleryLayout from '../../../components/common/Gallery/GalleryLayout';
import SearchBar from '../../../components/common/Gallery/SearchBar';
import CategoryFilter from '../../../components/common/Gallery/CategoryFilter';
import AntragCardSkeleton from './components/AntragCardSkeleton'; // Adjust the path if necessary

// We will use the existing gallery CSS, assuming it's globally imported or linked
const DEBOUNCE_DELAY = 500; // Delay in milliseconds (e.g., 500ms)

// Define search mode options for the selector
const searchSteps = [
  { value: 'title', label: 'Titel' },
  { value: 'fulltext', label: 'Volltext' },
  { value: 'semantic', label: 'Inteligent (bald)', disabled: true },
];

const AntraegeGallery = () => {
  // --- Logging: Component Mount ---
  useEffect(() => {
    console.log("[AntraegeGallery] Komponente gemountet.");
  }, []);

  const [antraege, setAntraege] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [inputValue, setInputValue] = useState(''); // State for immediate input value
  const [searchTerm, setSearchTerm] = useState(''); // State for debounced search term
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchMode, setSearchMode] = useState('title'); // State for search mode remains

  // --- Ref to store the current searchMode without causing re-fetch on change ---
  const searchModeRef = useRef(searchMode);

  // --- Logging: State Change ---
  useEffect(() => {
    console.log("[AntraegeGallery] State Update - Anträge:", antraege);
  }, [antraege]);
  useEffect(() => {
    console.log("[AntraegeGallery] State Update - Kategorien:", categories);
  }, [categories]);
  useEffect(() => {
    console.log("[AntraegeGallery] State Update - Loading:", loading);
  }, [loading]);
   useEffect(() => {
    console.log("[AntraegeGallery] State Update - Error:", error);
  }, [error]);
  useEffect(() => {
    console.log("[AntraegeGallery] State Update - Debounced Search Term:", searchTerm);
   }, [searchTerm]);
  useEffect(() => {
    console.log("[AntraegeGallery] State Update - Input Value:", inputValue);
  }, [inputValue]);
  useEffect(() => {
    console.log("[AntraegeGallery] State Update - Search Mode:", searchMode);
    searchModeRef.current = searchMode;
  }, [searchMode]);

  // Debounce effect for search term
  useEffect(() => {
    // Set up a timer
    const handler = setTimeout(() => {
      console.log(`[AntraegeGallery] Debounce Timer abgelaufen. Setze searchTerm auf: "${inputValue}"`);
      setSearchTerm(inputValue); // Update debounced search term after delay
    }, DEBOUNCE_DELAY);

    // Clean up the timer if inputValue changes or component unmounts
    return () => {
      console.log("[AntraegeGallery] Debounce Timer wird zurückgesetzt.");
      clearTimeout(handler);
    };
  }, [inputValue]); // Re-run effect only when inputValue changes

  // Fetch categories once on mount
  useEffect(() => {
    const fetchCategories = async () => {
      // --- Logging: Category Fetch Start ---
      console.log("[AntraegeGallery] fetchCategories gestartet.");
      try {
        const { data: categoriesData, error: categoriesError } = await supabase
          .from('antraege_categories')
          .select('id, label')
          .order('label'); // Optional: order categories alphabetically

        if (categoriesError) throw categoriesError;
        
        // --- Logging: Category Fetch Success ---
        console.log("[AntraegeGallery] Kategorien erfolgreich geladen:", categoriesData);
        setCategories([{ id: 'all', label: 'Alle Kategorien' }, ...(categoriesData || [])]);

      } catch (error) {
        // --- Logging: Category Fetch Error ---
        console.error('[AntraegeGallery] Fehler beim Laden der Kategorien:', error);
        // Optionally set an error state specific to categories
      }
    };
    fetchCategories();
  }, []);

  // Fetch Anträge based on the debounced search term, selected category, and search mode
  const fetchAntraege = useCallback(async () => {
    const currentSearchMode = searchModeRef.current; // Read searchMode from Ref
    // --- Logging: Antrag Fetch Start ---
    console.log(`[AntraegeGallery] fetchAntraege gestartet. SearchMode (aus Ref): "${currentSearchMode}", Debounced Search: "${searchTerm}", Category: "${selectedCategory}"`);
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('antraege')
        .select(`
          id, 
          user_id, 
          template_id, 
          title, 
          status, 
          antragstext, 
          description,
          gliederung,
          antragsteller,
          kontakt_email,
          kontakt_erlaubt,
          created_at, 
          updated_at,
          antraege_to_categories!left(
            category_id,
            antraege_categories (
              id,
              label
            )
          ),
          antraege_to_tags!left(
            tag_id,
            antraege_tags ( 
              id,
              label
            )
          )
        `); 

      // Add search filter based on debounced searchTerm and searchMode
      if (searchTerm) { 
        const searchPattern = `%${searchTerm}%`;
        switch (currentSearchMode) {
          case 'title':
            console.log(`[AntraegeGallery] Wende Suchfilter (Titel) an: ${searchPattern}`);
            query = query.ilike('title', searchPattern);
            break;
          case 'fulltext':
            console.log(`[AntraegeGallery] Wende Suchfilter (Volltext) an: ${searchPattern}`);
            query = query.or(`title.ilike.${searchPattern},antragstext.ilike.${searchPattern}`);
            break;
          case 'semantic':
             console.warn('[AntraegeGallery] Semantische Suche ist noch nicht implementiert. Fallback zur Titelsuche.');
             query = query.ilike('title', searchPattern); // Fallback to title search for now
            break;
          default:
            console.warn(`[AntraegeGallery] Unbekannter Suchmodus: ${currentSearchMode}. Fallback zur Titelsuche.`);
            query = query.ilike('title', searchPattern); // Default Fallback
        }
      }

      // Execute the final query
      console.log("[AntraegeGallery] Führe finale Abfrage aus (mit LEFT JOINs). Query:", query.toString()); // Log the query being built
      const { data: antraegeData, error: antraegeError } = await query.order('created_at', { ascending: false }); 

      if (antraegeError) {
        console.error('[AntraegeGallery] Supabase Query Error:', antraegeError); 
        throw antraegeError;
      }

      console.log("[AntraegeGallery] Rohdaten von Supabase (mit LEFT JOINs):", JSON.stringify(antraegeData, null, 2)); 

      // --- Filterung nach Kategorie HIER anwenden (falls nötig) ---
      let filteredAntraegeData = antraegeData || [];
      if (selectedCategory !== 'all') {
          const categoryIdNumber = parseInt(selectedCategory, 10);
          console.log(`[AntraegeGallery] Filtert Ergebnisse clientseitig für Kategorie-ID: ${categoryIdNumber}`);
          if (!isNaN(categoryIdNumber)) {
              filteredAntraegeData = filteredAntraegeData.filter(antrag => 
                  antrag.antraege_to_categories?.some(jtc => jtc?.antraege_categories?.id === categoryIdNumber)
              );
          } else {
              console.error("[AntraegeGallery] Ungültige Kategorie ID für Filterung:", selectedCategory);
          }
           console.log(`[AntraegeGallery] Ergebnisse nach clientseitiger Filterung:`, JSON.stringify(filteredAntraegeData, null, 2));
      }

      // --- Data Transformation: Extract tags --- 
      const transformedAntraege = filteredAntraegeData.map(antrag => { 
        const tags = antrag.antraege_to_tags 
          ? antrag.antraege_to_tags
              .filter(jtt => jtt && jtt.antraege_tags && typeof jtt.antraege_tags.label !== 'undefined') 
              .map(jtt => jtt.antraege_tags.label) 
          : [];
        
        const categories = antrag.antraege_to_categories
          ? antrag.antraege_to_categories
              .filter(jtc => jtc && jtc.antraege_categories && typeof jtc.antraege_categories.label !== 'undefined')
              .map(jtc => ({ id: jtc.antraege_categories.id, label: jtc.antraege_categories.label }))
          : [];

        return {
          ...antrag, 
          tags: tags, 
          categories: categories, 
          antraege_to_tags: undefined, 
          antraege_to_categories: undefined,
        };
      });

      console.log("[AntraegeGallery] Transformierte Anträge (nach LEFT JOIN & Filter):", JSON.stringify(transformedAntraege, null, 2)); 
      setAntraege(transformedAntraege);

    } catch (error) {
       console.error('[AntraegeGallery] Fehler beim Laden der Anträge (Catch Block):', error);
       setError('Fehler beim Laden der Anträge.');
       setAntraege([]); 
    } finally {
      console.log("[AntraegeGallery] fetchAntraege abgeschlossen.");
      setLoading(false);
    }
  }, [searchTerm, selectedCategory]); // Dependency array remains the same

  // useEffect to trigger fetching Anträge when dependencies change
  useEffect(() => {
    console.log("[AntraegeGallery] useEffect (fetch trigger) ausgelöst, da fetchAntraege Referenz sich änderte.");
    fetchAntraege();
  }, [fetchAntraege]);

  const NUMBER_OF_SKELETONS = 6; // Define how many skeletons to show

  // Simple Card Component (Inline for now)
  // Changed onClick handler to open new tab
  // Display limited tags
  const AntragCard = ({ antrag }) => {
    const maxTagsToShow = 3;
    const tagsToDisplay = antrag.tags?.slice(0, maxTagsToShow) || [];
    const hasMoreTags = antrag.tags?.length > maxTagsToShow;

    const handleCardNavigation = (e) => {
      e.preventDefault(); // Prevent default if wrapped in <a> later
      console.log(`[AntraegeGallery] Navigating to /datenbank/antraege/${antrag.id}`);
      window.open(`/datenbank/antraege/${antrag.id}`, '_blank', 'noopener,noreferrer');
    };

    return (
      // Use CSS classes instead of inline styles
      // Consider wrapping in an <a> tag for semantics, styling might need adjustment
      <div
        className="gallery-item-card antrag-card" // Added 'antrag-card' for specific styles
        onClick={handleCardNavigation} // Use the new navigation handler
        role="link" // Add role for accessibility since it's a div acting like a link
        tabIndex={0} // Make it focusable
        onKeyPress={(e) => { if (e.key === 'Enter' || e.key === ' ') handleCardNavigation(e); }} // Keyboard navigation
      >
        <div> {/* Group title, description, and tags */}
          <h3 className="antrag-card-title"> 
            {antrag.title}
          </h3>
          
          {/* Description - always rendered if exists, styled via CSS */}
          {antrag.description && (
            <p className="antrag-card-description">{antrag.description}</p> 
          )}

          {/* Display limited tags */}
          {tagsToDisplay.length > 0 && (
            <div className="antrag-card-tags"> 
              {tagsToDisplay.map(tag => (
                <span key={tag} className="antrag-card-tag"> 
                  {tag}
                </span>
              ))}
              {hasMoreTags && <span className="antrag-card-tag-more">...</span>} 
            </div>
          )}
        </div>
        
        {/* Keep date at the bottom */}
        <p className="antrag-card-date"> 
          Erstellt am: {new Date(antrag.created_at).toLocaleDateString('de-DE')}
        </p>
      </div>
    );
  };

  return (
    <> {/* Use Fragment to return multiple root elements */}
      <GalleryLayout
        title="Antragsdatenbank"
        searchBar={
          <SearchBar
            searchTerm={inputValue}
            onSearchChange={setInputValue}
            searchDepthOptions={searchSteps}
            currentSearchDepth={searchMode}
            onSearchDepthChange={setSearchMode}
          />
        }
        categoryFilter={
          <CategoryFilter
            categories={categories}
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
          />
        }
        introText="Durchsuchen und verwalten Sie hier eingereichte Anträge."
      >
        {/* Conditional Rendering Logic */}
        {loading && (
          // Show Skeletons while loading
          Array.from({ length: NUMBER_OF_SKELETONS }).map((_, index) => (
            <AntragCardSkeleton key={index} />
          ))
        )}

        {!loading && error && (
           // Show error message if loading finished with error
          <p className="error-message">{error}</p>
        )}

        {!loading && !error && antraege.length === 0 && (
          // Show no results message if loading finished, no error, and no data
          <p className="no-results">Keine Anträge gefunden, die den Kriterien entsprechen.</p>
        )}

        {!loading && !error && antraege.length > 0 && (
           // Show actual data if loading finished, no error, and data exists
          antraege.map(antrag => (
            <AntragCard
              key={antrag.id}
              antrag={antrag}
            />
          ))
        )}
      </GalleryLayout>
    </>
  );
};

export default AntraegeGallery; 