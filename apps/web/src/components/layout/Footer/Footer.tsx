import { FaTwitter, FaLinkedin, FaInstagram } from 'react-icons/fa';
import { Link } from 'react-router-dom';

const Footer = () => {
  return (
    <footer className="footer" role="contentinfo">
      <div className="footer-container">
        <div className="footer-content">
          <div className="footer-bottom">
            <div className="footer-social" role="group" aria-label="Social Media Links">
              <a
                href="https://twitter.com/MoritzWaech"
                target="_blank"
                rel="noopener noreferrer"
                className="footer-social-icon"
                aria-label="Twitter von Moritz Wächter"
              >
                <FaTwitter aria-hidden="true" />
              </a>
              <a
                href="https://www.instagram.com/moritz_waechter/?hl=bg"
                target="_blank"
                rel="noopener noreferrer"
                className="footer-social-icon"
                aria-label="Instagram von Moritz Wächter"
              >
                <FaInstagram aria-hidden="true" />
              </a>
              <a
                href="https://www.linkedin.com/in/moritz-w%C3%A4chter-6ab033210"
                target="_blank"
                rel="noopener noreferrer"
                className="footer-social-icon"
                aria-label="LinkedIn von Moritz Wächter"
              >
                <FaLinkedin aria-hidden="true" />
              </a>
            </div>
            <p>
              © 2026. Eine Website von Moritz Wächter. Alle Rechte vorbehalten. Der Grünerator wird
              unterstützt von der{' '}
              <a href="https://netzbegruenung.de/" target="_blank" rel="noopener noreferrer">
                netzbegrünung
              </a>
              . <Link to="/impressum">Impressum</Link> · <Link to="/datenschutz">Datenschutz</Link>
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
