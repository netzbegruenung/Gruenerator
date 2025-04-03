// gruenerator_frontend/src/components/common/editor/utils/PlatformSectionBlot.js
import Quill from 'quill';

const Block = Quill.import('blots/block');

class PlatformSectionBlot extends Block {
  static blotName = 'platform-section';
  static tagName = 'div';
  static className = 'platform-section'; // Klasse, die Quill zu diesem Blot hinzufügt

  static create(value) {
    const node = super.create(value);
    // Füge data-platform hinzu, wenn es im Wert übergeben wird (beim programmatischen Einfügen)
    if (value && typeof value.platform === 'string' && value.platform) {
      node.setAttribute('data-platform', value.platform);
    }
    // Stelle sicher, dass die Klasse immer gesetzt ist
    node.classList.add(this.className);
    return node;
  }

  // Liest Attribute aus dem DOM-Knoten, um das Format-Objekt für den Blot zu erstellen
  static formats(domNode) {
    const formats = {};
    if (domNode.hasAttribute('data-platform')) {
      formats.platform = domNode.getAttribute('data-platform');
    }
    // Gib auch die Klasse zurück, falls benötigt, obwohl sie statisch ist
    // formats.class = this.className; // Normalerweise nicht nötig für statische Klassen
    return formats;
  }

  // Wird aufgerufen, um Attribute auf den Blot anzuwenden (z.B. über formatText)
  format(name, value) {
    if (name === 'platform' && value) {
       this.domNode.setAttribute('data-platform', value);
    } else {
       // Wichtig: Rufe super.format auf, um Standard-Attribute wie 'align' zu behandeln
       super.format(name, value);
    }
  }

  // Stellt sicher, dass die Klasse nicht verloren geht
  optimize(context) {
    super.optimize(context);
    if (this.domNode.tagName === this.statics.tagName && !this.domNode.classList.contains(this.className)) {
        this.domNode.classList.add(this.className);
    }
  }

  // Erlaube Standard-Blockinhalte als Kinder (h2, p, ul etc.)
  // Quill sollte dies von Block erben, aber zur Sicherheit:
  static allowedChildren = Block.allowedChildren;
  static defaultChild = Block.defaultChild;
}


export default PlatformSectionBlot;