// ====================================
// FLOW MOTION - Configuration
// ====================================
// 
// ✅ API Keys الآن على Vercel فقط - آمن 100%!

const CONFIG = {
    // Application Settings
    APP: {
        NAME: 'Glitch Pro',
        VERSION: '2.0.0',
        SESSION_DURATION: 24 * 60 * 60 * 1000,
        MAX_LICENSE_LENGTH: 19,
    },

    // Subscription Plans
    PLANS: {
        MONTHLY: {
            name: 'Monthly',
            duration: 30, // days
            price: 9.99
        },
        QUARTERLY: {
            name: 'Quarterly',
            duration: 90,
            price: 24.99
        },
        YEARLY: {
            name: 'Yearly',
            duration: 365,
            price: 89.99
        },
        LIFETIME: {
            name: 'Lifetime',
            duration: 36500, // 100 years
            price: 199.99
        }
    },

    // Storage Keys
    STORAGE: {
        LICENSE_KEY: 'flowmotion_license',
        DEVICE_ID: 'flowmotion_device',
        SESSION: 'flowmotion_session',
        USER_DATA: 'flowmotion_user',
        LANGUAGE: 'flowmotion_lang'
    },

    // Languages
    LANGUAGES: {
        EN: 'en',
        AR: 'ar'
    },

    // Translations
    TRANSLATIONS: {
        en: {
            appName: 'Glitch Pro',
            subtitle: 'Professional Video Editor',
            login: 'Login',
            logout: 'Logout',
            enterLicense: 'Enter License Key',
            licenseKey: 'License Key',
            deviceId: 'Device ID',
            validate: 'Activate License',
            processing: 'Processing...',
            welcome: 'Welcome',
            subscription: 'Subscription',
            active: 'Active',
            expired: 'Expired',
            expiresOn: 'Expires',
            invalidLicense: 'Invalid license key',
            licenseActivated: 'License activated successfully',
            deviceMismatch: 'This license is already activated on another device',
            subscriptionExpired: 'Your subscription has expired',
            dropVideo: 'Tap to select video',
            selectFile: 'or drag and drop',
            processVideo: 'Create Effect',
            success: 'Success',
            error: 'Error',
            loading: 'Loading...',
            ready: 'Ready'
        },
        ar: {
            appName: 'جليتش برو',
            subtitle: 'محرر فيديو احترافي',
            login: 'تسجيل الدخول',
            logout: 'تسجيل الخروج',
            enterLicense: 'أدخل مفتاح الترخيص',
            licenseKey: 'مفتاح الترخيص',
            deviceId: 'معرف الجهاز',
            validate: 'تفعيل الترخيص',
            processing: 'جاري المعالجة...',
            welcome: 'مرحباً',
            subscription: 'الاشتراك',
            active: 'نشط',
            expired: 'منتهي',
            expiresOn: 'ينتهي',
            invalidLicense: 'مفتاح غير صالح',
            licenseActivated: 'تم التفعيل بنجاح',
            deviceMismatch: 'المفتاح مفعل على جهاز آخر',
            subscriptionExpired: 'انتهت الصلاحية',
            dropVideo: 'اضغط لاختيار فيديو',
            selectFile: 'أو اسحب وأفلت',
            processVideo: 'إنشاء التأثير',
            success: 'نجح',
            error: 'خطأ',
            loading: 'جاري التحميل...',
            ready: 'جاهز'
        }
    }
};

// Helper function to get translation
function t(key, lang = null) {
    const currentLang = lang || localStorage.getItem(CONFIG.STORAGE.LANGUAGE) || CONFIG.LANGUAGES.EN;
    return CONFIG.TRANSLATIONS[currentLang][key] || key;
}

// Export config for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}
