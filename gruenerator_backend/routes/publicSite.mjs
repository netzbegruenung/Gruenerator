import express from 'express';

const router = express.Router();

router.get('*', (req, res) => {
    if (!req.siteData) {
        return res.status(404).send(`
            <!DOCTYPE html>
            <html lang="de">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Site nicht gefunden</title>
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        height: 100vh;
                        margin: 0;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                    }
                    .container {
                        text-align: center;
                        padding: 2rem;
                    }
                    h1 { font-size: 3rem; margin: 0; }
                    p { font-size: 1.2rem; opacity: 0.9; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>404</h1>
                    <p>Diese Site existiert nicht oder ist nicht veröffentlicht.</p>
                </div>
            </body>
            </html>
        `);
    }

    const site = req.siteData;
    const socialLinks = site.social_links || {};
    const sections = site.sections || [];
    const theme = site.theme || 'gruene';
    const accentColor = site.accent_color || '#46962b';

    const themeStyles = {
        gruene: {
            primary: accentColor,
            background: '#f5f5f5',
            text: '#2c3e50',
            card: '#ffffff'
        },
        modern: {
            primary: accentColor,
            background: '#ffffff',
            text: '#1a1a1a',
            card: '#f8f9fa'
        },
        professional: {
            primary: accentColor,
            background: '#f8f9fa',
            text: '#2c3e50',
            card: '#ffffff'
        }
    };

    const colors = themeStyles[theme] || themeStyles.gruene;

    const socialLinksHtml = Object.entries(socialLinks)
        .filter(([_, url]) => url)
        .map(([platform, url]) => {
            const icons = {
                twitter: '𝕏',
                facebook: 'f',
                instagram: '📷',
                linkedin: 'in',
                github: 'gh',
                website: '🌐'
            };
            return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="social-link">${icons[platform] || platform}</a>`;
        })
        .join('');

    const sectionsHtml = sections.map(section => {
        switch (section.type) {
            case 'text':
                return `<section class="content-section">
                    ${section.title ? `<h2>${section.title}</h2>` : ''}
                    <p>${section.content || ''}</p>
                </section>`;
            case 'contact':
                return `<section class="content-section contact-section">
                    <h2>Kontakt</h2>
                    ${site.contact_email ? `<p>📧 <a href="mailto:${site.contact_email}">${site.contact_email}</a></p>` : ''}
                </section>`;
            default:
                return '';
        }
    }).join('');

    res.send(`
        <!DOCTYPE html>
        <html lang="de">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${site.site_title}</title>
            ${site.meta_description ? `<meta name="description" content="${site.meta_description}">` : ''}
            ${site.meta_keywords && site.meta_keywords.length ? `<meta name="keywords" content="${site.meta_keywords.join(', ')}">` : ''}
            <meta property="og:title" content="${site.site_title}">
            ${site.meta_description ? `<meta property="og:description" content="${site.meta_description}">` : ''}
            ${site.profile_image ? `<meta property="og:image" content="${site.profile_image}">` : ''}
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                    background: ${colors.background};
                    color: ${colors.text};
                    line-height: 1.6;
                }
                .hero {
                    background: linear-gradient(135deg, ${colors.primary} 0%, ${colors.primary}dd 100%);
                    ${site.background_image ? `background-image: linear-gradient(135deg, ${colors.primary}ee 0%, ${colors.primary}cc 100%), url('${site.background_image}');` : ''}
                    background-size: cover;
                    background-position: center;
                    color: white;
                    padding: 4rem 2rem;
                    text-align: center;
                    min-height: 400px;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                }
                .profile-image {
                    width: 150px;
                    height: 150px;
                    border-radius: 50%;
                    object-fit: cover;
                    border: 4px solid white;
                    margin-bottom: 1.5rem;
                    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                }
                .hero h1 {
                    font-size: 2.5rem;
                    margin-bottom: 0.5rem;
                    text-shadow: 0 2px 4px rgba(0,0,0,0.2);
                }
                .hero p {
                    font-size: 1.2rem;
                    opacity: 0.95;
                    max-width: 600px;
                }
                .container {
                    max-width: 900px;
                    margin: 0 auto;
                    padding: 2rem;
                }
                .bio-section {
                    background: ${colors.card};
                    padding: 2rem;
                    margin: 2rem 0;
                    border-radius: 8px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }
                .content-section {
                    background: ${colors.card};
                    padding: 2rem;
                    margin: 1.5rem 0;
                    border-radius: 8px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }
                .content-section h2 {
                    color: ${colors.primary};
                    margin-bottom: 1rem;
                }
                .social-links {
                    display: flex;
                    gap: 1rem;
                    justify-content: center;
                    margin-top: 1.5rem;
                }
                .social-link {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: 45px;
                    height: 45px;
                    background: white;
                    color: ${colors.primary};
                    text-decoration: none;
                    border-radius: 50%;
                    font-weight: bold;
                    transition: transform 0.2s;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.15);
                }
                .social-link:hover {
                    transform: scale(1.05);
                }
                .contact-section a {
                    color: ${colors.primary};
                    text-decoration: none;
                }
                .contact-section a:hover {
                    text-decoration: underline;
                }
                footer {
                    text-align: center;
                    padding: 2rem;
                    color: #666;
                    font-size: 0.9rem;
                }
                @media (max-width: 768px) {
                    .hero h1 { font-size: 2rem; }
                    .hero p { font-size: 1rem; }
                    .container { padding: 1rem; }
                    .profile-image { width: 120px; height: 120px; }
                }
            </style>
        </head>
        <body>
            <div class="hero">
                ${site.profile_image ? `<img src="${site.profile_image}" alt="${site.site_title}" class="profile-image">` : ''}
                <h1>${site.site_title}</h1>
                ${site.tagline ? `<p>${site.tagline}</p>` : ''}
                ${socialLinksHtml ? `<div class="social-links">${socialLinksHtml}</div>` : ''}
            </div>
            <div class="container">
                ${site.bio ? `<div class="bio-section"><p>${site.bio}</p></div>` : ''}
                ${sectionsHtml}
            </div>
            <footer>
                <p>Erstellt mit Grünerator Sites</p>
            </footer>
        </body>
        </html>
    `);
});

export default router;