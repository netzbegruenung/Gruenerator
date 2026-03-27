import { FaTwitter, FaLinkedin, FaInstagram } from 'react-icons/fa';
import { Link } from 'react-router-dom';

const Footer = () => {
  return (
    <footer
      className="bg-background py-lg text-foreground border-t border-[var(--border-subtle)] max-[575px]:py-md"
      role="contentinfo"
    >
      <div className="max-w-[1200px] mx-auto px-lg max-[575px]:px-md">
        <div className="w-full">
          <div className="flex flex-row items-center justify-between gap-lg max-sm:flex-col max-sm:text-center max-sm:gap-md">
            <div
              className="flex gap-4 items-center shrink-0"
              role="group"
              aria-label="Social Media Links"
            >
              <a
                href="https://twitter.com/MoritzWaech"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground text-[1.25em] transition-colors duration-300 hover:text-primary-500"
                aria-label="Twitter von Moritz Wächter"
              >
                <FaTwitter aria-hidden="true" />
              </a>
              <a
                href="https://www.instagram.com/moritz_waechter/?hl=bg"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground text-[1.25em] transition-colors duration-300 hover:text-primary-500"
                aria-label="Instagram von Moritz Wächter"
              >
                <FaInstagram aria-hidden="true" />
              </a>
              <a
                href="https://www.linkedin.com/in/moritz-w%C3%A4chter-6ab033210"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground text-[1.25em] transition-colors duration-300 hover:text-primary-500"
                aria-label="LinkedIn von Moritz Wächter"
              >
                <FaLinkedin aria-hidden="true" />
              </a>
            </div>
            <p className="m-0 text-[0.85em] text-foreground opacity-70 text-right max-sm:text-center max-[575px]:text-[0.8em] [&_a]:text-link [&_a]:underline [&_a]:transition-colors [&_a]:duration-300 [&_a:hover]:text-primary-500">
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
