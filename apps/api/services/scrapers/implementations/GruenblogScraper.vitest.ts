/**
 * Auf gruenblog.com umschließt `.entry-content` das ganze Elementor-Template,
 * nicht nur den Artikel. Bis #4280 begann deshalb jeder `full_text` mit dem
 * Login-Formular des Merken-Knopfs und endete mit Like-Zähler, Social-Icons
 * und den Teasern dreier fremder Artikel. Das Markup unten ist aus
 * https://gruenblog.com/kein-sex-ohne-ja/ (Stand 08.10.2026) gekürzt — die
 * Klassen sind die echten.
 */
import { describe, expect, it } from 'vitest';

import { extractGruenblogArticle } from './GruenblogScraper.js';

const html = `<!doctype html><html><head><title>Kein Sex ohne Ja</title></head><body>
<article class="post-9883 post type-post"><div class="entry-content clear"><div class="elementor elementor-9883">
  <div class="elementor-element e-con">
    <div class="elementor-widget-container"><p>Machen</p><p>Gesellschaft</p></div>
    <div data-object_id="9883" class="cbxwpbkmarkwrap cbxwpbkmarkwrap_guest">
      <a role="button" data-bookmark-label="Bookmark">Bookmark</a>
      <div class="cbx-guest-wrap"><p>Please login to bookmark</p><a>Close</a>
        <form><p class="login-username"><label>Benutzername oder E-Mail-Adresse</label></p>
        <p class="login-password"><label>Passwort</label></p>
        <p class="login-remember"><label><input type="checkbox" /> Angemeldet bleiben</label></p></form>
        <p class="cbx-guest-register">No account yet? <a>Register</a></p>
      </div>
    </div>
    <h3>Kein Sex ohne Ja</h3>
  </div>
  <div class="elementor-element elementor-widget-text-editor">
    <p>In einem Jurastudium lernt man erstaunliche Dinge.</p>
  </div>
  <div class="elementor-element e-con">
    <div class="elementor-widget-shortcode"><span class="oacs-spl-like-button-wrapper"><a class="oacs-spl-like-button">51 Das Thema interessiert mich!</a></span></div>
    <div class="elementor-widget-social-icons"><div class="elementor-social-icons-wrapper">
      <a class="elementor-social-icon">Instagram</a><a class="elementor-social-icon">Facebook</a><a class="elementor-social-icon">Linkedin</a>
    </div></div>
  </div>
  <div class="elementor-element content-width-medium blog-3col e-con">
    <p>Das könnte dich auch interessieren …</p>
    <div class="cbxwpbkmarkwrap"><p>Please login to bookmark</p></div>
    <h2>Positive Power</h2><p>Porträt einer Mutbürgerin.</p>
  </div>
</div></div></article></body></html>`;

describe('extractGruenblogArticle', () => {
  const { text } = extractGruenblogArticle(html);

  it('drops the bookmark login form before the heading', () => {
    expect(text).not.toMatch(/Bookmark|Please login|Benutzername|Passwort|Angemeldet|Register/);
    expect(text).toBe(
      'Machen\n\nGesellschaft\n\n### Kein Sex ohne Ja\n\nIn einem Jurastudium lernt man erstaunliche Dinge.'
    );
  });

  it('drops like counter, social icons and teasers of other articles', () => {
    expect(text).not.toMatch(
      /interessiert mich|Instagram|Linkedin|könnte dich auch|Positive Power/
    );
  });
});
