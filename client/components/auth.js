import { safeHexColor } from '../utils/color.js';

const API_URL = window.location.origin.includes('localhost')
  ? 'http://localhost:5000/api'
  : 'https://holodraw.onrender.com/api';

export class AuthManager {
  constructor() {
    localStorage.removeItem('holodraw_token');
    localStorage.removeItem('holodraw_user');

    this.user = null;
    this.isGuest = true;
    this.isAuthenticated = false;
    this.isLogin = true;
    this.onAuthChange = null;
    this.refreshTimer = null;

    this.authModal = document.getElementById('auth-modal');
    this.authForm = document.getElementById('auth-form');
    this.authTitle = document.getElementById('auth-title');
    this.authSubmit = document.getElementById('auth-submit');
    this.authError = document.getElementById('auth-error');
    this.authToggle = document.getElementById('auth-toggle');
    this.authSwitchText = document.getElementById('auth-switch-text');
    this.usernameField = document.getElementById('username-field');
    this.usernameInput = document.getElementById('username-input');
    this.emailInput = document.getElementById('email-input');
    this.passwordInput = document.getElementById('password-input');
    this.guestBtn = document.getElementById('guest-btn');
    this.userAvatarText = document.getElementById('user-avatar-text');
    this.dropdownUsername = document.getElementById('dropdown-username');
    this.userDropdown = document.getElementById('user-dropdown');
    this.userMenuBtn = document.getElementById('user-menu-btn');
    this.logoutBtn = document.getElementById('logout-btn');

    this.setupEvents();
  }

  setupEvents() {
    this.authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleAuth();
    });

    this.authToggle.addEventListener('click', () => {
      this.isLogin = !this.isLogin;
      this.authTitle.textContent = this.isLogin ? 'Welcome Back' : 'Create Account';
      this.authSubmit.textContent = this.isLogin ? 'Sign In' : 'Create Account';
      this.authSwitchText.textContent = this.isLogin ? "Don't have an account?" : 'Already have an account?';
      this.authToggle.textContent = this.isLogin ? 'Sign Up' : 'Sign In';
      this.usernameField.classList.toggle('hidden', this.isLogin);
      this.authError.classList.add('hidden');
    });

    this.guestBtn.addEventListener('click', () => {
      this.isGuest = true;
      this.isAuthenticated = true;
      this.user = null;
      this.authModal.classList.add('hidden');
      this.updateUI();
      if (this.onAuthChange) this.onAuthChange(null, true);
    });

    this.userMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.userDropdown.classList.toggle('hidden');
    });

    document.addEventListener('click', () => {
      this.userDropdown.classList.add('hidden');
    });

    this.logoutBtn.addEventListener('click', () => {
      this.logout();
    });
  }

  api(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    return fetch(API_URL + path, {
      ...options,
      headers,
      credentials: 'include'
    });
  }

  setSession(user) {
    this.user = user || null;
    this.isGuest = !this.user;
    this.isAuthenticated = !!this.user;
    this.updateUI();
    this.startRefreshTimer();
  }

  clearSession() {
    this.user = null;
    this.isGuest = true;
    this.isAuthenticated = false;
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    localStorage.removeItem('holodraw_token');
    localStorage.removeItem('holodraw_user');
    this.updateUI();
  }

  startRefreshTimer() {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = setInterval(() => {
      this.refreshSession();
    }, 10 * 60 * 1000);
  }

  async refreshSession() {
    try {
      const res = await this.api('/auth/refresh', { method: 'POST' });
      if (!res.ok) return false;
      const data = await res.json();
      if (data.user) this.user = data.user;
      return true;
    } catch (err) {
      return false;
    }
  }

  async restoreSession() {
    try {
      let res = await this.api('/auth/me');
      if (res.status === 401 && await this.refreshSession()) {
        res = await this.api('/auth/me');
      }
      if (!res.ok) {
        this.clearSession();
        return false;
      }
      const data = await res.json();
      this.setSession(data.user);
      return true;
    } catch (err) {
      this.clearSession();
      return false;
    }
  }

  async handleAuth() {
    const email = this.emailInput.value.trim();
    const password = this.passwordInput.value;
    const username = this.usernameInput.value.trim();

    this.authError.classList.add('hidden');

    const endpoint = this.isLogin ? '/auth/login' : '/auth/register';
    const body = this.isLogin ? { email, password } : { email, password, username };

    try {
      const res = await this.api(endpoint, {
        method: 'POST',
        body: JSON.stringify(body)
      });

      const data = await res.json();

      if (!res.ok) {
        this.authError.textContent = data.error || 'Authentication failed';
        this.authError.classList.remove('hidden');
        return;
      }

      this.setSession(data.user);
      this.authModal.classList.add('hidden');
      if (this.onAuthChange) this.onAuthChange(this.user, false);
    } catch (err) {
      this.authError.textContent = 'Connection error. Please try again.';
      this.authError.classList.remove('hidden');
    }
  }

  updateUI() {
    const name = this.user?.username || 'Guest';
    this.userAvatarText.textContent = name.charAt(0).toUpperCase();
    this.dropdownUsername.textContent = name;
  }

  getUserColor() {
    return safeHexColor(this.user?.color, '#666666');
  }

  getUsername() {
    return this.user?.username || 'Guest_' + Math.random().toString(36).substring(2, 6);
  }

  getUserId() {
    return this.user?._id || null;
  }

  async logout() {
    try {
      await this.api('/auth/logout', { method: 'POST' });
    } catch (err) {
      // The local session is cleared either way.
    }
    this.clearSession();
    window.location.reload();
  }

  show() {
    if (!this.user) {
      this.authModal.classList.remove('hidden');
    }
  }
}
