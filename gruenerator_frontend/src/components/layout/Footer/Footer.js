import React from 'react';
import { Link } from 'react-router-dom';
import { FaTwitter, FaLinkedin, FaInstagram } from 'react-icons/fa';
import '../../../assets/styles/common/variables.css';
import '../../../assets/styles/common/global.css';
import '../../../assets/styles/components/footer.css';

const Footer = () => {
    return (
        <footer className="footer">
            <div className="footer-container">
                <div className="footer-left">
                    <div className="footer-logo">
                        <Link to="/"><img src="/images/Logo_Sand.svg" alt="Grünerator Logo" /></Link>
                    </div>
                    <nav className="footer-nav">
                        <ul>
                            <li><Link to="/pressemitteilung">Pressemitteilung</Link></li>
                            <li><Link to="/antragsgenerator">Anträge</Link></li>
                            <li><Link to="/socialmedia">Social Media</Link></li>
                            <li><Link to="/rede">Politische Rede</Link></li>
                            <li><Link to="/antragsversteher">Antrags-Erklärer</Link></li>
                            <li><Link to="/impressum">Impressum</Link></li>
                            <li><Link to="/datenschutz">Datenschutz</Link></li>
                        </ul>
                    </nav>
                    <div className="footer-bottom">
                        <p>© 2024. Eine Website von Moritz Wächter. Alle Rechte vorbehalten. Der Grünerator wird unterstützt von der <a href="https://netzbegruenung.de/" target="_blank" rel="noopener noreferrer">netzbegrünung</a>. 
                            Du kannst <a href="https://netzbegruenung.de/verein/mitgliedsantrag/" target="_blank" rel="noopener noreferrer">hier Mitglied werden</a>.
                        </p>
                    </div>
                </div>
                <div className="footer-right">
                    <a href="https://twitter.com/MoritzWaech" target="_blank" rel="noopener noreferrer" className="footer-social-icon">
                        <FaTwitter />
                    </a>
                    <a href="https://www.instagram.com/moritz_waechter/?hl=bg" target="_blank" rel="noopener noreferrer" className="footer-social-icon">
                        <FaInstagram />
                    </a>
                    <a href="https://www.linkedin.com/in/moritz-w%C3%A4chter-6ab033210" target="_blank" rel="noopener noreferrer" className="footer-social-icon">
                        <FaLinkedin />
                    </a>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
