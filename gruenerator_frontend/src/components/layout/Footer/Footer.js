import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { FaTwitter, FaLinkedin, FaInstagram } from 'react-icons/fa';
import useAccessibility from '../../hooks/useAccessibility';
import { addAriaLabelsToElements, enhanceFocusVisibility } from '../../utils/accessibilityHelpers';

const Footer = () => {
    const { announce, focusElement, setupKeyboardNav } = useAccessibility();
    const footerRef = useRef(null);
    const skipToMainContentRef = useRef(null);

    useEffect(() => {
        enhanceFocusVisibility();

        const footerElements = footerRef.current.querySelectorAll('a, button');
        const cleanup = setupKeyboardNav(Array.from(footerElements));

        addAriaLabelsToElements([
            { element: skipToMainContentRef.current, label: 'Zum Hauptinhalt springen' },
            { element: footerRef.current.querySelector('.footer-logo a'), label: 'Grünerator Homepage' },
            { element: footerRef.current.querySelector('a[href="/pressemitteilung"]'), label: 'Pressemitteilung Seite' },
            { element: footerRef.current.querySelector('a[href="/antrag"]'), label: 'Anträge Seite' },
            { element: footerRef.current.querySelector('a[href="/socialmedia"]'), label: 'Social Media Seite' },
            { element: footerRef.current.querySelector('a[href="/rede"]'), label: 'Politische Rede Seite' },
            { element: footerRef.current.querySelector('a[href="/antragscheck"]'), label: 'Antragscheck Seite' },
            { element: footerRef.current.querySelector('a[href="/wahlprogramm"]'), label: 'Wahlprogramm Seite' },
            { element: footerRef.current.querySelector('a[href="/impressum"]'), label: 'Impressum Seite' },
            { element: footerRef.current.querySelector('a[href="/datenschutz"]'), label: 'Datenschutz Seite' },
            { element: footerRef.current.querySelector('a[href="https://896ca129.sibforms.com/serve/MUIFAFnH3lov98jrw3d75u_DFByChA39XRS6JkBKqjTsN9gx0MxCvDn1FMnkvHLgzxEh1JBcEOiyHEkyzRC-XUO2DffKsVccZ4r7CCaYiugoiLf1a-yoTxDwoctxuzCsmDuodwrVwEwnofr7K42jQc-saIKeVuB_8UxrwS18QIaahZml1qMExNno2sEC7HyMy9Nz4f2f8-UJ4QmW"]'), label: 'Newsletter Anmeldung' },
        ]);

        return cleanup;
    }, [setupKeyboardNav]);

    const handleFooterFocus = () => {
        announce('Sie befinden sich im Footer-Bereich der Website.');
    };

    const handleSkipToMainContent = (e) => {
        e.preventDefault();
        focusElement('main-content');
        announce('Sie haben zum Hauptinhalt gesprungen.');
    };

    return (
        <footer className="footer" ref={footerRef} onFocus={handleFooterFocus}>
            <a 
                href="#main-content" 
                className="skip-link" 
                ref={skipToMainContentRef}
                onClick={handleSkipToMainContent}
            >
                Zum Hauptinhalt springen
            </a>
            <div className="footer-container">
                <div className="footer-content">
                    <div className="footer-main">
                        <div className="footer-logo">
                            <Link to="/" onClick={() => announce('Navigation zur Homepage')}>
                                <img src="/images/Logo_Sand.svg" alt="Grünerator Logo" />
                            </Link>
                        </div>
                        
                        <div className="footer-sections">
                            <div className="footer-section">
                                <h3>Texte</h3>
                                <ul>
                                    <li><Link to="/antrag" onClick={() => announce('Navigation zur Anträge Seite')}>Anträge</Link></li>
                                    <li><Link to="/pressemitteilung" onClick={() => announce('Navigation zur Pressemitteilung Seite')}>Pressemitteilung</Link></li>
                                    <li><Link to="/socialmedia" onClick={() => announce('Navigation zur Social Media Seite')}>Social Media</Link></li>
                                    <li><Link to="/rede" onClick={() => announce('Navigation zur Politische Rede Seite')}>Politische Rede</Link></li>
                                    <li><Link to="/universal" onClick={() => announce('Navigation zum Universal Grünerator')}>Universal Grünerator</Link></li>
                                    <li><Link to="/antragscheck" onClick={() => announce('Navigation zur Antragscheck Seite')}>Antragscheck</Link></li>
                                    <li><Link to="/wahlprogramm" onClick={() => announce('Navigation zur Wahlprogramm Seite')}>Wahlprogramm</Link></li>
                                    <li><Link to="/btw-kompass" onClick={() => announce('Navigation zum BTW Programm-Kompass')}>BTW Programm-Kompass</Link></li>
                                </ul>
                            </div>

                            <div className="footer-section combined-section">
                                <div className="subsection">
                                    <h3>Sharepics & Grafik</h3>
                                    <ul>
                                        <li><Link to="/vorlagen" onClick={() => announce('Navigation zu Canva-Vorlagen')}>Canva-Vorlagen</Link></li>
                                        <li><Link to="/sharepic" onClick={() => announce('Navigation zum Sharepic Grünerator')}>Sharepic Grünerator</Link></li>
                                    </ul>
                                </div>

                                <div className="subsection">
                                    <h3>GPTs für ChatGPT</h3>
                                    <ul>
                                        <li><a href="https://chat.openai.com/g/g-ZZwx8kZS3-grunerator-social-media" target="_blank" rel="noopener noreferrer" onClick={() => announce('Öffne GPT Social Media')}>Social Media</a></li>
                                        <li><a href="https://chatgpt.com/g/g-Npcb04iH7-grunerator-pressemitteilungen" target="_blank" rel="noopener noreferrer" onClick={() => announce('Öffne GPT Pressemitteilung')}>Pressemitteilung</a></li>
                                    </ul>
                                </div>
                            </div>

                            <div className="footer-section">
                                <h3>Rechtliches & Info</h3>
                                <ul>
                                    <li><Link to="/impressum" onClick={() => announce('Navigation zur Impressum Seite')}>Impressum</Link></li>
                                    <li><Link to="/datenschutz" onClick={() => announce('Navigation zur Datenschutz Seite')}>Datenschutz</Link></li>
                                    <li><a href="https://896ca129.sibforms.com/serve/MUIFAFnH3lov98jrw3d75u_DFByChA39XRS6JkBKqjTsN9gx0MxCvDn1FMnkvHLgzxEh1JBcEOiyHEkyzRC-XUO2DffKsVccZ4r7CCaYiugoiLf1a-yoTxDwoctxuzCsmDuodwrVwEwnofr7K42jQc-saIKeVuB_8UxrwS18QIaahZml1qMExNno2sEC7HyMy9Nz4f2f8-UJ4QmW" target="_blank" rel="noopener noreferrer" onClick={() => announce('Öffne Newsletter Anmeldung')}>Newsletter</a></li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    <div className="footer-bottom">
                        <div className="footer-social">
                            <a href="https://twitter.com/MoritzWaech" target="_blank" rel="noopener noreferrer" className="footer-social-icon" onClick={() => announce('Öffne Twitter Profil von Moritz Wächter')}>
                                <FaTwitter aria-hidden="true" />
                                <span className="sr-only">Twitter</span>
                            </a>
                            <a href="https://www.instagram.com/moritz_waechter/?hl=bg" target="_blank" rel="noopener noreferrer" className="footer-social-icon" onClick={() => announce('Öffne Instagram Profil von Moritz Wächter')}>
                                <FaInstagram aria-hidden="true" />
                                <span className="sr-only">Instagram</span>
                            </a>
                            <a href="https://www.linkedin.com/in/moritz-w%C3%A4chter-6ab033210" target="_blank" rel="noopener noreferrer" className="footer-social-icon" onClick={() => announce('Öffne LinkedIn Profil von Moritz Wächter')}>
                                <FaLinkedin aria-hidden="true" />
                                <span className="sr-only">LinkedIn</span>
                            </a>
                        </div>
                        <p>© 2025. Eine Website von Moritz Wächter. Alle Rechte vorbehalten. Der Grünerator wird unterstützt von der <a href="https://netzbegruenung.de/" target="_blank" rel="noopener noreferrer">netzbegrünung</a>. 
                            Du kannst <a href="https://netzbegruenung.de/verein/mitgliedsantrag/" target="_blank" rel="noopener noreferrer">hier Mitglied werden</a>.
                        </p>
                    </div>
                </div>
            </div>
        </footer>
    );
};

export default Footer;