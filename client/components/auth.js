const API_URL = window.location.origin.includes('localhost')
  ? 'http://localhost:5000/api'
  : 'https://holodraw.onrender.com/api';

export class AuthManager {
  constructor() {
    this.token = localStorage.getItem('holodraw_token');
    this.user = JSON.parse(localStorage.getItem('holodraw_user') || 'null');
    this.isGuest = !this.token;

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

    this.isLogin = true;
    this.isAuthenticated = false;
    this.onAuthChange = null;

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
      this.authModal.classList.add('hidden');
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

    if (this.token) {
      this.validateToken();
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
      const res = await fetch(API_URL + endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await res.json();

      if (!res.ok) {
        this.authError.textContent = data.error || 'Authentication failed';
        this.authError.classList.remove('hidden');
        return;
      }

      this.token = data.token;
      this.user = data.user;
      this.isGuest = false;
      this.isAuthenticated = true;

      localStorage.setItem('holodraw_token', this.token);
      localStorage.setItem('holodraw_user', JSON.stringify(this.user));

      this.updateUI();
      this.authModal.classList.add('hidden');
      if (this.onAuthChange) this.onAuthChange(this.user, false);
    } catch (err) {
      this.authError.textContent = 'Connection error. Using guest mode.';
      this.authError.classList.remove('hidden');
    }
  }

  async validateToken() {
    try {
      const res = await fetch(API_URL + '/auth/me', {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      if (!res.ok) throw new Error('Invalid token');
      const data = await res.json();
      this.user = data.user;
      this.isGuest = false;
      this.isAuthenticated = true;
      localStorage.setItem('holodraw_user', JSON.stringify(this.user));
      this.updateUI();
      if (this.onAuthChange) this.onAuthChange(this.user, false);
    } catch (err) {
      this.token = null;
      this.user = null;
      this.isGuest = true;
      localStorage.removeItem('holodraw_token');
      localStorage.removeItem('holodraw_user');
    }
  }

  updateUI() {
    const name = this.user?.username || 'Guest';
    this.userAvatarText.textContent = name.charAt(0).toUpperCase();
    this.dropdownUsername.textContent = name;
  }

  getAuthHeaders() {
    if (this.token) {
      return { 'Authorization': `Bearer ${this.token}` };
    }
    return {};
  }

  getUserColor() {
    if (this.user?.color) return this.user.color;
    const hue = Math.floor(Math.random() * 360);
    return `hsl(${hue}, 70%, 60%)`;
  }

  getUsername() {
    return this.user?.username || 'Guest_' + Math.random().toString(36).substring(2, 6);
  }

  getUserId() {
    return this.user?._id || 'guest_' + Math.random().toString(36).substring(2, 8);
  }

  logout() {
    this.token = null;
    this.user = null;
    this.isGuest = true;
    this.isAuthenticated = false;
    localStorage.removeItem('holodraw_token');
    localStorage.removeItem('holodraw_user');
    this.updateUI();
    window.location.reload();
  }

  show() {
    if (!this.isAuthenticated) {
      this.authModal.classList.remove('hidden');
    }
  }
}
