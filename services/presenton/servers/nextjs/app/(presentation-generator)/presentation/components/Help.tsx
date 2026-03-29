import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { HelpCircle, X, Search } from "lucide-react";
import React, { useState, useEffect, useRef } from "react";

const helpQuestions = [
  {
    id: 1,
    category: "Bilder",
    question: "Wie ändere ich ein Bild?",
    answer:
      "Klicke auf ein beliebiges Bild, um die Bild-Werkzeugleiste anzuzeigen. Du siehst Optionen zum Bearbeiten, Positionieren und Anpassen der Bildgröße im Container. Mit der Option „Bearbeiten" kannst du das aktuelle Bild ersetzen oder ändern.",
  },
  {
    id: 2,
    category: "Bilder",
    question: "Kann ich neue Bilder mit KI generieren?",
    answer:
      "Ja! Klicke auf ein beliebiges Bild und wähle „Bearbeiten" in der Werkzeugleiste. Im Seitenpanel findest du den Tab „KI-Generierung". Gib eine Beschreibung des gewünschten Bildes ein, und die KI erstellt ein Bild basierend auf deiner Beschreibung.",
  },
  {
    id: 3,
    category: "Bilder",
    question: "Wie lade ich eigene Bilder hoch?",
    answer:
      "Klicke auf ein beliebiges Bild und wähle „Bearbeiten" in der Werkzeugleiste. Klicke im Seitenpanel oben auf den Tab „Hochladen". Dort kannst du deine Dateien durchsuchen und auswählen. Nach dem Hochladen kannst du das Bild in dein Design einfügen.",
  },
  {
    id: 11,
    category: "KI-Prompts",
    question: "Kann ich das Folienlayout per Eingabe ändern?",
    answer:
      "Ja! Klicke auf das Zauberstab-Symbol oben links auf jeder Folie. Es öffnet sich ein Eingabefeld. Beschreibe deine Layout-Anforderungen und die KI passt das Folienlayout entsprechend an.",
  },
  {
    id: 12,
    category: "KI-Prompts",
    question: "Kann ich das Folienbild per Eingabe ändern?",
    answer:
      "Ja! Klicke auf das Zauberstab-Symbol oben links auf jeder Folie. Es öffnet sich ein Eingabefeld. Beschreibe das gewünschte Bild und die KI aktualisiert das Folienbild entsprechend.",
  },

  {
    id: 14,
    category: "KI-Prompts",
    question: "Kann ich den Inhalt per Eingabe ändern?",
    answer:
      "Ja! Klicke auf das Zauberstab-Symbol oben links auf jeder Folie. Es öffnet sich ein Eingabefeld. Beschreibe den gewünschten Inhalt und die KI aktualisiert Text und Inhalt der Folie entsprechend.",
  },
  {
    id: 4,
    category: "Text",
    question: "Wie kann ich Text formatieren und hervorheben?",
    answer:
      "Markiere einen beliebigen Text, um die Formatierungsleiste anzuzeigen. Du hast Optionen für Fett, Kursiv, Unterstrichen, Durchgestrichen und mehr.",
  },
  {
    id: 5,
    category: "Symbole",
    question: "Wie ändere ich Symbole?",
    answer:
      "Klicke auf ein vorhandenes Symbol, um es zu ändern. Im Symbol-Auswahlfenster kannst du Symbole durchsuchen oder die Suchfunktion verwenden, um bestimmte Symbole zu finden. Es stehen Tausende von Symbolen in verschiedenen Stilen zur Verfügung.",
  },
  {
    id: 16,
    category: "Layout",
    question: "Kann ich die Reihenfolge der Folien ändern?",
    answer:
      "Natürlich! Im Seitenpanel kannst du die Folien per Drag-and-Drop an die gewünschte Position verschieben.",
  },
  {
    id: 15,
    category: "Layout",
    question: "Kann ich eine Folie zwischen anderen einfügen?",
    answer:
      "Ja! Klicke einfach auf das Plus-Symbol unterhalb jeder Folie. Es werden alle verfügbaren Layouts angezeigt, aus denen du das gewünschte auswählen kannst.",
  },
  {
    id: 6,
    category: "Layout",
    question: "Kann ich weitere Abschnitte zu meinen Folien hinzufügen?",
    answer:
      "Auf jeden Fall! Bewege den Mauszeiger an den unteren Rand eines Textfelds oder Inhaltsblocks. Es erscheint ein „+"-Symbol. Klicke darauf, um einen neuen Abschnitt unterhalb des aktuellen hinzuzufügen. Du kannst auch das Einfügen-Menü nutzen, um bestimmte Abschnittstypen hinzuzufügen.",
  },

  {
    id: 8,
    category: "Export",
    question: "Wie exportiere ich meine Präsentation?",
    answer:
      "Klicke auf die Schaltfläche „Exportieren" oben rechts im Menü. Du kannst zwischen PDF und PowerPoint wählen.",
  },
];

const Help = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredQuestions, setFilteredQuestions] = useState(helpQuestions);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const modalRef = useRef<HTMLDivElement>(null);

  // Extract unique categories and create "All" category list
  useEffect(() => {
    const uniqueCategories = Array.from(
      new Set(helpQuestions.map((q) => q.category))
    );
    setCategories(["Alle", ...uniqueCategories]);
  }, []);

  // Filter questions based on search query and selected category
  useEffect(() => {
    let results = helpQuestions;

    // Filter by category if not "All"
    if (selectedCategory !== "Alle") {
      results = results.filter((q) => q.category === selectedCategory);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      results = results.filter(
        (q) =>
          q.question.toLowerCase().includes(query) ||
          q.answer.toLowerCase().includes(query)
      );
    }

    setFilteredQuestions(results);
  }, [searchQuery, selectedCategory]);

  // Close modal when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: any) => {
      if (
        modalRef.current &&
        !modalRef.current.contains(event.target) &&
        !event.target.closest(".help-button")
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleOpenClose = () => {
    setIsOpen(!isOpen);
  };

  // Animation helpers
  const modalClass = isOpen
    ? "opacity-100 scale-100"
    : "opacity-0 scale-95 pointer-events-none";

  return (
    <>
      {/* Help Button */}
      <button
        onClick={handleOpenClose}
        className="help-button hidden fixed bottom-6 right-6 h-12 w-12 z-50 bg-emerald-600 hover:bg-emerald-700 rounded-full md:flex justify-center items-center cursor-pointer shadow-lg transition-all duration-300 hover:shadow-xl"
        aria-label="Hilfezentrum"
      >
        {isOpen ? (
          <X className="text-white h-5 w-5" />
        ) : (
          <HelpCircle className="text-white h-5 w-5" />
        )}
      </button>

      {/* Help Modal */}
      <div
        className={`fixed bottom-20 right-6 z-50 max-w-md w-full transition-all duration-300 transform ${modalClass}`}
        ref={modalRef}
      >
        <div className="bg-white rounded-lg shadow-2xl border border-gray-200 overflow-hidden">
          {/* Header */}
          <div className="bg-emerald-600 text-white px-6 py-4 flex justify-between items-center">
            <h2 className="text-lg font-medium">Hilfezentrum</h2>
            <button
              onClick={() => setIsOpen(false)}
              className="hover:bg-emerald-700 p-1 rounded"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Search */}
          <div className="px-6 pt-4 pb-2">
            <div className="relative">
              <input
                type="text"
                placeholder="Hilfethemen suchen…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            </div>
          </div>

          {/* Category Pills */}
          <div className="px-6 pb-3 flex gap-2 overflow-x-auto hide-scrollbar">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-3 py-1 rounded-full text-sm whitespace-nowrap ${selectedCategory === category
                    ? "bg-emerald-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
              >
                {category}
              </button>
            ))}
          </div>

          {/* FAQ Accordion */}
          <div className="max-h-96 overflow-y-auto px-6 pb-6">
            {filteredQuestions.length > 0 ? (
              <Accordion type="single" collapsible className="w-full">
                {filteredQuestions.map((faq, index) => (
                  <AccordionItem
                    key={index}
                    value={`item-${index}`}
                    className="border-b border-gray-200 last:border-b-0"
                  >
                    <AccordionTrigger className="hover:no-underline py-3 px-1 text-left flex">
                      <div className="flex-1 pr-2">
                        <span className="text-gray-900 font-medium text-sm md:text-base">
                          {faq.question}
                        </span>
                        <span className="block text-xs text-emerald-600 mt-0.5">
                          {faq.category}
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-1 pb-3">
                      <div className="text-sm text-gray-600 leading-relaxed rounded bg-gray-50 p-3">
                        {faq.answer}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            ) : (
              <div className="py-8 text-center text-gray-500">
                <p>Keine Ergebnisse für „{searchQuery}"</p>
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedCategory("Alle");
                  }}
                  className="mt-2 text-emerald-600 hover:underline text-sm"
                >
                  Suche zurücksetzen
                </button>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-6 py-3 border-t border-gray-200 text-xs text-gray-500 text-center">
            Brauchst du weitere Hilfe?{" "}
            <a href="/contact" className="text-emerald-600 hover:underline">
              Support kontaktieren
            </a>
          </div>
        </div>
      </div>

      {/* Custom AccordionTrigger implementation (since shadcn's might not be available) */}
      {!AccordionTrigger && (
        <style jsx>{`
          .accordion-trigger {
            display: flex;
            width: 100%;
            justify-content: space-between;
            align-items: center;
            padding: 0.75rem 0;
            text-align: left;
            transition: all 0.2s;
          }
          .accordion-trigger:hover {
            background-color: rgba(0, 0, 0, 0.02);
          }
          .accordion-content {
            overflow: hidden;
            height: 0;
            transition: height 0.2s ease;
          }
          .accordion-content[data-state="open"] {
            height: auto;
          }
        `}</style>
      )}
    </>
  );
};

export default Help;
