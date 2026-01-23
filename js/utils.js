// ====================================
// FLOW MOTION - Utility Functions
// ====================================

// Format file size
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Format date
function formatDate(dateString, locale = 'en-US') {
    const date = new Date(dateString);
    return date.toLocaleDateString(locale, {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

// Format time remaining
function formatTimeRemaining(days) {
    if (days === 0) return 'Expires today';
    if (days === 1) return '1 day remaining';
    if (days < 30) return `${days} days remaining`;
    if (days < 365) {
        const months = Math.floor(days / 30);
        return `${months} ${months === 1 ? 'month' : 'months'} remaining`;
    }
    const years = Math.floor(days / 365);
    return `${years} ${years === 1 ? 'year' : 'years'} remaining`;
}

// Show notification (Toast)
function showNotification(message, type = 'info', duration = 4000) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    // Icon mapping
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-triangle-exclamation',
        info: 'fa-info-circle'
    };

    toast.innerHTML = `
        <i class="fas ${icons[type] || 'fa-bell'} toast-icon"></i>
        <div class="toast-message">${message}</div>
    `;

    // Add click to dismiss
    toast.onclick = () => {
        toast.style.animation = 'toastFadeOut 0.3s forwards';
        setTimeout(() => {
            if (toast.parentElement) toast.parentElement.removeChild(toast);
        }, 300);
    };

    container.appendChild(toast);

    // Auto dismiss
    if (duration > 0) {
        setTimeout(() => {
            if (toast.parentElement) {
                toast.style.animation = 'toastFadeOut 0.4s forwards';
                setTimeout(() => {
                    if (toast.parentElement) toast.parentElement.removeChild(toast);
                }, 400);
            }
        }, duration);
    }
}

// Add CSS animations for notifications
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// Copy to clipboard
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        showNotification('Copied to clipboard!', 'success', 2000);
        return true;
    } catch (error) {
        console.error('Failed to copy:', error);
        showNotification('Failed to copy', 'error', 2000);
        return false;
    }
}

// Debounce function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Get query parameter
function getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
}

// Set query parameter
function setQueryParam(param, value) {
    const url = new URL(window.location);
    url.searchParams.set(param, value);
    window.history.pushState({}, '', url);
}

// Local storage with expiry
const storage = {
    set: (key, value, expiryMs = null) => {
        const item = {
            value: value,
            expiry: expiryMs ? Date.now() + expiryMs : null
        };
        localStorage.setItem(key, JSON.stringify(item));
    },

    get: (key) => {
        const itemStr = localStorage.getItem(key);
        if (!itemStr) return null;

        try {
            const item = JSON.parse(itemStr);

            // Check expiry
            if (item.expiry && Date.now() > item.expiry) {
                localStorage.removeItem(key);
                return null;
            }

            return item.value;
        } catch (e) {
            return null;
        }
    },

    remove: (key) => {
        localStorage.removeItem(key);
    },

    clear: () => {
        localStorage.clear();
    }
};

// Loading overlay
const loadingOverlay = {
    show: (message = 'Loading...') => {
        let overlay = document.getElementById('loading-overlay');

        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'loading-overlay';
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(10, 10, 20, 0.95);
                backdrop-filter: blur(10px);
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                z-index: 99999;
                font-family: 'Share Tech Mono', monospace;
            `;

            overlay.innerHTML = `
                <div style="
                    width: 60px;
                    height: 60px;
                    border: 4px solid rgba(0, 255, 255, 0.2);
                    border-top: 4px solid #00ffff;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin-bottom: 20px;
                "></div>
                <div id="loading-message" style="
                    color: #00ffff;
                    font-size: 1.2rem;
                    text-transform: uppercase;
                    letter-spacing: 2px;
                ">${message}</div>
            `;

            document.body.appendChild(overlay);
        } else {
            overlay.style.display = 'flex';
            document.getElementById('loading-message').textContent = message;
        }
    },

    hide: () => {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    }
};

// Validate email format
function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

// Generate random ID
function generateId(length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}
