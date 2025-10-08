// Notification utilities
import { qs } from './dom.js';

export function getNotificationContainer() {
  let container = qs('#notifications');
  if (!container) {
    container = document.createElement('div');
    container.id = 'notifications';
    container.className = 'notifications-container';
    document.body.appendChild(container);
  }
  return container;
}

export function showNotification(message, type = 'info') {
  if (document.hidden) return;
  const container = getNotificationContainer();
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : type === 'warning' ? '⚠' : 'ⓘ';
  notification.innerHTML = `
    <span class="notification-icon">${icon}</span>
    <span class="notification-message">${message}</span>
    <button class="notification-close" onclick="this.parentElement.remove()">×</button>
  `;
  container.appendChild(notification);
  setTimeout(() => { if (notification.parentElement) notification.remove(); }, 5000);
}
