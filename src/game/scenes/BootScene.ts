// Load the shared environment atlases before any map is painted.
import Phaser from 'phaser';
import { loadEnvironmentArt } from '../art/environmentArt';

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  create() {
    void loadEnvironmentArt().then(() => {
      if (!this.scene.isActive()) return;
      window.dispatchEvent(new CustomEvent('veyloria:loading', { detail: 1 }));
      this.scene.start('Menu');
    }).catch(error => {
      console.error(error);
      window.dispatchEvent(new CustomEvent('veyloria:art-error', { detail: String(error) }));
      const ui = document.getElementById('ui');
      if (ui) {
        document.getElementById('loading')?.remove();
        const message = document.createElement('div');
        message.className = 'loading'; message.setAttribute('role', 'alert');
        message.textContent = 'Unable to load the world artwork. Please check your connection and reload to retry.';
        ui.appendChild(message);
      }
    });
  }
}
