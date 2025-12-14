import React from 'react';
import { Link } from 'react-router-dom';
import { FaTwitter, FaLinkedin, FaInstagram } from 'react-icons/fa';
import ThemeToggleButton from '../Header/ThemeToggleButton';
import useDarkMode from '../../hooks/useDarkMode';

const Footer = () => {
    const [darkMode, toggleDarkMode] = useDarkMode();

    return (
        <footer className="footer" role="contentinfo">
            <div className="footer-container">
                <div className="footer-content">
                    <div className="footer-main">
                        <div className="footer-sections">
                            <section className="footer-section" aria-labelledby="footer-texte">
                                <h3 id="footer-texte">Texte</h3>
                                <ul>
                                    <li><Link to="/antrag">Anträge & Anfragen</Link></li>
                                    <li><Link to="/presse-social">Presse & Social Media</Link></li>
                                    <li><Link to="/universal">Universal Grünerator</Link></li>
                                    <li><Link to="/gruene-jugend">Grüne Jugend</Link></li>
                                </ul>
                            </section>

                            <section className="footer-section" aria-labelledby="footer-tools">
                                <h3 id="footer-tools">Tools</h3>
                                <ul>
                                    <li><Link to="/suche">Suche</Link></li>
                                    <li><Link to="/kommunal">Kommunale Anträge</Link></li>
                                    <li><Link to="/barrierefreiheit">Barrierefreiheit</Link></li>
                                    <li><Link to="/kampagnen">Kampagnen</Link></li>
                                    <li><Link to="/datenbank/vorlagen">Vorlagen</Link></li>
                                </ul>
                            </section>

                            <section className="footer-section" aria-labelledby="footer-media">
                                <h3 id="footer-media">Bild und Video</h3>
                                <ul>
                                    <li><Link to="/reel">Reel</Link></li>
                                    <li><Link to="/sharepic">Sharepics</Link></li>
                                    <li><Link to="/imagine">Imagine</Link></li>
                                </ul>
                            </section>

                            <section className="footer-section" aria-labelledby="footer-legal">
                                <h3 id="footer-legal">Informationen</h3>
                                <ul>
                                    <li><Link to="/support">Support</Link></li>
                                    <li><Link to="/impressum">Impressum</Link></li>
                                    <li><Link to="/datenschutz">Datenschutz</Link></li>
                                    <li><a href="https://896ca129.sibforms.com/serve/MUIFAFnH3lov98jrw3d75u_DFByChA39XRS6JkBKqjTsN9gx0MxCvDn1FMnkvHLgzxEh1JBcEOiyHEkyzRC-XUO2DffKsVccZ4r7CCaYiugoiLf1a-yoTxDwoctxuzCsmDuodwrVwEwnofr7K42jQc-saIKeVuB_8UxrwS18QIaahZml1qMExNno2sEC7HyMy9Nz4f2f8-UJ4QmW" target="_blank" rel="noopener noreferrer">Newsletter</a></li>
                                </ul>
                            </section>

                            <section className="footer-section" aria-labelledby="footer-gpts">
                                <h3 id="footer-gpts">GPTs für ChatGPT</h3>
                                <ul>
                                    <li><a href="https://chat.openai.com/g/g-ZZwx8kZS3-grunerator-social-media" target="_blank" rel="noopener noreferrer">Social Media</a></li>
                                    <li><a href="https://chatgpt.com/g/g-Npcb04iH7-grunerator-pressemitteilungen" target="_blank" rel="noopener noreferrer">Pressemitteilung</a></li>
                                </ul>
                            </section>
                        </div>
                    </div>

                    <div className="footer-bottom">
                        <div className="footer-social" role="group" aria-label="Social Media Links">
                            <a href="https://twitter.com/MoritzWaech" target="_blank" rel="noopener noreferrer" className="footer-social-icon" aria-label="Twitter von Moritz Wächter">
                                <FaTwitter aria-hidden="true" />
                            </a>
                            <a href="https://www.instagram.com/moritz_waechter/?hl=bg" target="_blank" rel="noopener noreferrer" className="footer-social-icon" aria-label="Instagram von Moritz Wächter">
                                <FaInstagram aria-hidden="true" />
                            </a>
                            <a href="https://www.linkedin.com/in/moritz-w%C3%A4chter-6ab033210" target="_blank" rel="noopener noreferrer" className="footer-social-icon" aria-label="LinkedIn von Moritz Wächter">
                                <FaLinkedin aria-hidden="true" />
                            </a>
                            <span className="footer-divider" aria-hidden="true">·</span>
                            <ThemeToggleButton darkMode={darkMode} toggleDarkMode={toggleDarkMode} />
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