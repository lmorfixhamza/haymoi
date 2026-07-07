
// Debounce utility للموبايل
function debounce(fn, delay) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}
const SUPABASE_URL = 'https://lytiyycerpoogkgqofpk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5dGl5eWNlcnBvb2drZ3FvZnBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyNzQ5OTksImV4cCI6MjA5Njg1MDk5OX0.bgv9vL0Pb4Xp8wyAR65DrPiGe-rELBL9JqikHgzZLUQ';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// === نظام تتبع الأخطاء البرمجية (Debug System) ===
function debugLog(message, isError = false) {
    // Disabled in production for performance
}

function initDebugBox() {
    // Disabled for security and performance
}

let appLoaded = false;

async function loadAppData(user) {
    debugLog("loadAppData: Starting data initialization...");
    try {
        debugLog("loadAppData: Loading own profile...");
        await loadOwnProfile(user);
    } catch (e) {
        debugLog("loadAppData: Error loading own profile: " + e.message, true);
    }

    try {
        if (!currentUserProfile) {
            debugLog("loadAppData: currentUserProfile is null, fetching fallback...");
            const { data, error } = await sb.from('profiles').select('*').eq('user_id', user.id);
            if (error) throw error;
            if (data && data.length > 0) {
                currentUserProfile = data[0];
                debugLog("loadAppData: Fallback profile loaded successfully.");
            } else {
                debugLog("loadAppData: No profile found in database for fallback.");
            }
        } else {
            debugLog("loadAppData: currentUserProfile exists.");
        }
    } catch (e) {
        debugLog("loadAppData: Error loading fallback profile: " + e.message, true);
    }

    try {
        debugLog("loadAppData: Requesting geolocation...");
        await requestLocationAndSave();
    } catch (e) {
        debugLog("loadAppData: Error requesting geolocation (Access Denied): " + e.message, true);
        // لا نطرد المستخدم إذا رفض الموقع، فقط نعرض له تنبيهاً ونكمل
        showToast("📍 Activez la localisation pour voir les personnes proches de vous.");
    }

    try {
        debugLog("loadAppData: Loading blocked users list...");
        await loadBlockedUsers();
    } catch (e) {
        debugLog("loadAppData: Error loading blocked users: " + e.message, true);
    }

    try {
        debugLog("loadAppData: Loading discovery users...");
        await loadDiscoveryUsers(user);
    } catch (e) {
        debugLog("loadAppData: Error loading discovery users: " + e.message, true);
    }

    try {
        debugLog("loadAppData: Initializing global message notifications...");
        initGlobalMessageNotifier();
    } catch (e) {
        debugLog("loadAppData: Error initializing notifications: " + e.message, true);
    }

    // إخفاء شاشة الترحيب بسلاسة بعد تحميل كافة البيانات
    const splash = document.getElementById('splash-screen');
    if (splash) {
        setTimeout(() => {
            splash.classList.add('fade-out');
            setTimeout(() => splash.remove(), 600);
        }, 1500); // إظهار الشاشة لـ 1.5 ثانية لإضفاء مظهر احترافي فخم
    }
}

const redirectTo = window.location.origin + window.location.pathname.replace(/[^/]*$/, 'app.html');

const path = window.location.pathname;
const isIndexPage = path.includes('index') || path === '/' || path.endsWith('/') || path === '';
const isSetupPage = path.includes('profile-setup');
const isProfilePage = path.includes('profile.html') || path.includes('app.html');

let currentUser = null;
let activeChatUserId = null;
let activeChatUserProfile = null; // تخزين الملف الشخصي الكامل للشخص الذي تتحدث معه حالياً
let chatSubscription = null;
let currentUserProfile = null; // تخزين الملف الشخصي الحالي للمستخدم بما فيه الإحداثيات
let activeTopTab = 'nearby'; // التبويب العلوي النشط لقسم الاستكشاف
let searchFilterQuery = ''; // نص البحث الحالي بالديسكفري
let currentGenderFilter = 'all'; // فلتر الجنس: all, male, female
let currentDistanceFilter = 10000; // المسافة بالكيلومتر
let requireVerifiedFilter = false; // الأعضاء الموثقين فقط
let blockedUserIds = new Set(); // قائمة المحظورين
let globalMessageSubscription = null; // اشتراك الإشعارات العالمي
let latestDiscoveryProfiles = []; // تخزين آخر قائمة بروفايل تم جلبها للاستكشاف
let discoveryLastFetchTime = 0; // وقت آخر جلب للبيانات - للتحكم في الكاش
const DISCOVERY_CACHE_MS = 60000; // كاش لمدة دقيقة واحدة لتجنب الطلبات المتكررة

// حساب المسافة بين نقطتين جغرافيتين بالكيلومتر
function calculateDistance(lat1, lon1, lat2, lon2) {
    const l1 = parseFloat(lat1);
    const ln1 = parseFloat(lon1);
    const l2 = parseFloat(lat2);
    const ln2 = parseFloat(lon2);
    if (isNaN(l1) || isNaN(ln1) || isNaN(l2) || isNaN(ln2)) return null;
    const R = 6371; // نصف قطر الأرض بالكيلومتر
    const dLat = deg2rad(l2 - l1);
    const dLon = deg2rad(ln2 - ln1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(l1)) * Math.cos(deg2rad(l2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c; // المسافة بالكيلومتر
    return d;
}

function deg2rad(deg) {
    return deg * (Math.PI / 180);
}

function calculateAge(dobString) {
    if (!dobString) return '-';
    const birthDate = new Date(dobString);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
}

function sanitizeUrl(url) {
    if (!url) return '';
    const trimmed = String(url).trim();
    if (/^(javascript|data|vbscript):/i.test(trimmed)) {
        return '';
    }
    return escapeHtml(trimmed);
}

function formatRelativeTime(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffSec < 60) {
        return 'À l\'instant';
    } else if (diffMin < 60) {
        return `Il y a ${diffMin} min`;
    } else if (diffHr < 24) {
        return `Il y a ${diffHr} h`;
    } else if (diffDay === 1) {
        return 'Hier';
    } else if (diffDay === 2) {
        return 'Il y a 2 jours';
    } else if (diffDay < 7) {
        return `Il y a ${diffDay} jours`;
    } else {
        return date.toLocaleDateString('fr-FR', { month: 'numeric', day: 'numeric' });
    }
}

async function hasProfile(userId) {
    try {
        const { data, error } = await sb
            .from('profiles')
            .select('user_id')
            .eq('user_id', userId);
        if (error) {
            console.error("Error in hasProfile:", error);
            return false;
        }
        return data && data.length > 0;
    } catch (err) {
        console.error("Exception in hasProfile:", err);
        return false;
    }
}

async function handleRouting(user) {
    if (!user) {
        if (isSetupPage || isProfilePage) {
            window.location.href = 'index.html';
        }
        return;
    }

    const profileExists = await hasProfile(user.id);

    if (isIndexPage) {
        window.location.href = profileExists ? 'app.html' : 'profile-setup.html';
        return;
    }


    if (isProfilePage) {
        try {
            const { data: profilesList, error } = await sb
                .from('profiles')
                .select('*')
                .eq('user_id', user.id);

            if (error) throw error;

            const profile = profilesList && profilesList.length > 0 ? profilesList[0] : null;

            if (profile) {
                const fullNameEl = document.getElementById('profile-fullname');
                const ageEl = document.getElementById('profile-age');
                const genderEl = document.getElementById('profile-gender');
                const bioEl = document.getElementById('profile-bio');
                const avatarEl = document.getElementById('profile-avatar');

                if (fullNameEl) fullNameEl.textContent = profile.full_name || 'مستخدم HayMoi';
                if (ageEl) ageEl.textContent = calculateAge(profile.dob) + ' سنة';

                if (genderEl) {
                    if (profile.gender === 'male') {
                        genderEl.textContent = 'ذكر';
                        if (avatarEl) avatarEl.innerHTML = '<i class="fas fa-user-astronaut" style="color: #00d2ff;"></i>';
                    } else if (profile.gender === 'female') {
                        genderEl.textContent = 'أنثى';
                        if (avatarEl) avatarEl.innerHTML = '<i class="fas fa-user-nurse" style="color: #ff6b81;"></i>';
                    } else {
                        genderEl.textContent = profile.gender || '-';
                    }
                }

                if (bioEl) bioEl.textContent = profile.bio || 'لا توجد نبذة شخصية بعد.';
            } else {
                // إذا لم يتم العثور على ملف شخصي، يتم تحويله لصفحة إدخال البيانات
                window.location.href = 'profile-setup.html';
            }
        } catch (err) {
            console.error("خطأ أثناء جلب الملف الشخصي:", err);
        }
    }
}

sb.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user ?? null; // تحديث المستخدم الحالي في المتغير العام
    debugLog(`onAuthStateChange: event=${_event}, userId=${currentUser ? currentUser.id : 'null'}`);
    handleRouting(session?.user ?? null);
    if (currentUser) {
        initPresence();
        startLastSeenHeartbeat();
        if (path.includes('app.html') && !appLoaded) {
            appLoaded = true;
            loadAppData(currentUser);
        }
    } else {
        stopLastSeenHeartbeat();
        if (presenceChannel) {
            sb.removeChannel(presenceChannel);
            presenceChannel = null;
        }
        onlineUsers.clear();
        updateOnlineDotsInUI();
        appLoaded = false;
    }
});

// === نظام تحديث آخر ظهور وقراءة دقيقة للحالة ===
let lastSeenHeartbeatInterval = null;

async function updateLastSeenInDB() {
    if (!currentUser) return;
    try {
        await sb.from('profiles')
            .update({ last_seen: new Date().toISOString() })
            .eq('user_id', currentUser.id);
    } catch (err) {
        console.error("Error updating last_seen:", err);
    }
}

function startLastSeenHeartbeat() {
    if (lastSeenHeartbeatInterval) {
        clearInterval(lastSeenHeartbeatInterval);
    }
    updateLastSeenInDB(); // تحديث فوري عند بدء الجلسة
    lastSeenHeartbeatInterval = setInterval(updateLastSeenInDB, 60000); // تحديث كل 60 ثانية بدل 30 لتخفيف الضغط
}

function stopLastSeenHeartbeat() {
    if (lastSeenHeartbeatInterval) {
        clearInterval(lastSeenHeartbeatInterval);
        lastSeenHeartbeatInterval = null;
    }
}

// === نظام التتبع الفوري لحالة الاتصال (Supabase Presence) ===
let onlineUsers = new Set();
let lastSeenTimeMap = new Map(); // خارطة لتخزين آخر ظهور محدث لكل مستخدم لتفادي البيانات القديمة
let presenceChannel = null;

function initPresence() {
    if (!currentUser) return;

    if (presenceChannel) {
        sb.removeChannel(presenceChannel);
        presenceChannel = null;
    }

    presenceChannel = sb.channel('online-users', {
        config: {
            presence: {
                key: currentUser.id,
            },
        },
    });

    presenceChannel
        .on('presence', { event: 'sync' }, () => {
            const state = presenceChannel.presenceState();
            onlineUsers.clear();
            Object.keys(state).forEach(key => {
                onlineUsers.add(key);
            });
            updateOnlineDotsInUI();
        })
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await presenceChannel.track({
                    user_id: currentUser.id,
                    online_at: new Date().toISOString(),
                });
                updateLastSeenInDB();
            }
        });
}

function updateOnlineDotsInUI() {
    // 1. تحديث الأعضاء في قائمة الاستكشاف
    document.querySelectorAll('.user-card').forEach(card => {
        const userId = card.getAttribute('data-user-id');
        if (userId) {
            const isOnline = onlineUsers.has(userId);
            const avatar = card.querySelector('.user-avatar-wrapper') || card.querySelector('.user-avatar');
            const metaTextEl = card.querySelector('.user-meta-text');
            const statusTextEl = card.querySelector('.card-status-text');

            let dot = avatar ? avatar.querySelector('.online-dot') : null;
            if (isOnline) {
                if (avatar && !dot) {
                    dot = document.createElement('span');
                    dot.className = 'online-dot';
                    avatar.appendChild(dot);
                }
                if (metaTextEl) {
                    const text = metaTextEl.textContent;
                    const parts = text.split('·');
                    const distancePart = parts.length > 1 ? parts[0].trim() : (text.includes('كم') || text.includes('متر') || text.includes('قريب') ? text : '');
                    if (distancePart) {
                        metaTextEl.textContent = `${distancePart} · الآن`;
                    } else {
                        metaTextEl.textContent = 'الآن';
                    }
                }
                if (statusTextEl) {
                    statusTextEl.textContent = 'متصل الآن';
                    statusTextEl.classList.add('online');
                }
                // تحديث وقت آخر ظهور محلياً طالما هو متصل
                lastSeenTimeMap.set(userId, new Date().toISOString());
            } else {
                if (dot) dot.remove();
                if (statusTextEl) {
                    // إذا كان متصلاً والآن خرج، نحدث آخر ظهور ليكون الوقت الحالي
                    if (statusTextEl.classList.contains('online')) {
                        lastSeenTimeMap.set(userId, new Date().toISOString());
                    }
                    const lastSeen = lastSeenTimeMap.get(userId) || statusTextEl.getAttribute('data-created-at');
                    statusTextEl.textContent = `آخر ظهور: ${formatRelativeTime(lastSeen)}`;
                    statusTextEl.classList.remove('online');
                }
            }
        }
    });

    // 2. تحديث قائمة المحادثات النشطة
    document.querySelectorAll('.chat-item').forEach(item => {
        const userId = item.getAttribute('data-user-id');
        if (userId) {
            const isOnline = onlineUsers.has(userId);
            const avatarWrapper = item.querySelector('.chat-item-avatar-wrapper');
            let onlineDot = avatarWrapper ? avatarWrapper.querySelector('.online-dot') : null;
            if (isOnline) {
                if (!onlineDot && avatarWrapper) {
                    onlineDot = document.createElement('span');
                    onlineDot.className = 'online-dot';
                    onlineDot.style.cssText = 'bottom: 0; right: 0; width: 11px; height: 11px; border: 2px solid #0f172a;';
                    avatarWrapper.appendChild(onlineDot);
                }
                lastSeenTimeMap.set(userId, new Date().toISOString());
            } else {
                if (onlineDot) onlineDot.remove();
            }
        }
    });

    // 3. تحديث ترويسة الشات المفتوح حالياً
    if (activeChatUserId) {
        const chatStatusEl = document.getElementById('chat-user-status');
        if (chatStatusEl) {
            const isOnline = onlineUsers.has(activeChatUserId);
            if (isOnline) {
                chatStatusEl.textContent = 'متصل الآن';
                chatStatusEl.style.color = '#22c55e';
                lastSeenTimeMap.set(activeChatUserId, new Date().toISOString());
            } else {
                const lastSeen = lastSeenTimeMap.get(activeChatUserId) || (activeChatUserProfile ? activeChatUserProfile.created_at : null);
                chatStatusEl.textContent = lastSeen ? `آخر ظهور: ${formatRelativeTime(lastSeen)}` : 'غير متصل';
                chatStatusEl.style.color = 'var(--text-muted)';
            }
        }
    }
}

// === نظام التنقل بين الأقسام (Tab System) لصفحة app.html ===
function initAppTabs() {
    const navBtns = document.querySelectorAll('.nav-item');
    const views = document.querySelectorAll('.app-view');
    const appHeader = document.getElementById('app-header');

    // إذا لم نكن في app.html نخرج من الدالة
    if (!navBtns.length || !views.length) return;

    // دالة تبديل الأقسام
    window.switchAppView = function (viewId) {
        // إخفاء كل الأقسام
        views.forEach(v => v.classList.remove('active'));
        navBtns.forEach(b => b.classList.remove('active'));

        // إظهار القسم المطلوب
        const targetView = document.getElementById('view-' + viewId);
        if (targetView) targetView.classList.add('active');

        // تفعيل الزر المناسب
        const targetBtn = document.getElementById('btn-nav-' + viewId);
        if (targetBtn) {
            targetBtn.classList.add('active');

            // تحديث مكان المؤشر السحري
            const bottomNav = document.querySelector('.bottom-nav');
            if (bottomNav) {
                const navBtnsArray = Array.from(document.querySelectorAll('.bottom-nav .nav-item'));
                const activeIndex = navBtnsArray.indexOf(targetBtn);
                if (activeIndex !== -1) {
                    bottomNav.style.setProperty('--active-idx', activeIndex);
                }
            }
        }

        // إظهار/إخفاء الشريط العلوي (يظهر في قسم الاستكشاف وقسم المحادثات وجهات الاتصال والبروفايل)
        if (appHeader) {
            const showHeader = viewId === 'trouver' || viewId === 'chats' || viewId === 'contacts' || viewId === 'profil';
            appHeader.style.display = showHeader ? 'flex' : 'none';

            const headerTitle = document.getElementById('header-title');
            const headerSearch = document.getElementById('header-search-container');
            if (headerTitle) {
                if (viewId === 'trouver') {
                    headerTitle.style.display = 'none';
                } else {
                    headerTitle.style.display = '';
                    if (viewId === 'chats') {
                        headerTitle.style.width = '';
                        const isLight = document.documentElement.getAttribute('data-theme') === 'light';
                        const titleColor = isLight ? '#111827' : '#ffffff';
                        headerTitle.innerHTML = `
                            <div class="chats-section-title-block" style="text-align: left; display: flex; flex-direction: column; gap: 2px;">
                                <h2 class="chats-section-title" style="color: ${titleColor}; font-size: 26px; font-weight: 800; margin: 0; line-height: 1.1;">Chats</h2>
                                <span id="header-chats-count" class="chats-section-count" style="font-size: 13px; font-weight: 600; color: var(--text-muted); opacity: 0.8;">...</span>
                            </div>
                        `;
                    } else if (viewId === 'contacts') {
                        headerTitle.style.width = '';
                        headerTitle.textContent = 'Contacts';
                    } else if (viewId === 'profil') {
                        headerTitle.style.width = '100%';
                        const isLight = document.documentElement.getAttribute('data-theme') === 'light';
                        const titleColor = isLight ? '#111827' : '#ffffff';
                        const _hmId = currentUserProfile ? generateHayMoiId(currentUser?.id || '') : '--------';
                        const _hmLvl = currentUserProfile ? calculateUserLevel(currentUserProfile.visits_count || 0, currentUserProfile.friends_count || 0) : 1;
                        headerTitle.innerHTML = `
                            <div style="display: flex; align-items: center; width: 100%; position: relative;">
                                <!-- ID + Level à gauche, simple sans fond -->
                                <div id="hm-header-id-badge" title="Copier l'ID" style="display:flex; flex-direction:column; gap:2px; cursor:pointer; padding:4px 2px; flex-shrink:0;">
                                    <span style="display:flex; align-items:center; gap:5px; font-size:12px; font-weight:700; letter-spacing:0.02em; line-height:1.3; color: var(--text-white);">
                                        <span style="color:var(--text-muted); font-weight:600;">ID</span>
                                        <span style="color:var(--text-muted); font-size:13px;">:</span>
                                        <span id="hm-header-id-val" style="font-variant-numeric:tabular-nums; letter-spacing:1px; color:var(--text-white);">${_hmId}</span>
                                    </span>
                                    <span style="display:flex; align-items:center; gap:5px; font-size:12px; font-weight:700; letter-spacing:0.02em; line-height:1.3; color:var(--text-white);">
                                        <span style="color:var(--text-muted); font-weight:600;">NV</span>
                                        <span style="color:var(--text-muted); font-size:13px;">:</span>
                                        <span style="color:var(--text-white);">${_hmLvl}</span>
                                    </span>
                                </div>
                                <!-- Titre centré -->
                                <div class="chats-section-title-block" style="text-align: center; display: flex; flex-direction: column; align-items: center; gap: 2px; position:absolute; left:50%; transform:translateX(-50%);">
                                    <h2 class="chats-section-title" translate="no" style="color: ${titleColor}; font-size: 26px; font-weight: 800; margin: 0; line-height: 1.1;">Hay Moi</h2>
                                    <span class="chats-section-count" translate="no" style="font-size: 13px; font-weight: 600; color: var(--text-muted); opacity: 0.8;">My Profile</span>
                                </div>
                            </div>
                        `;
                    }
                }
            }
            if (headerSearch) {
                headerSearch.style.display = viewId === 'trouver' ? 'flex' : 'none';
            }

            // إظهار أو إخفاء أيقونات الهيدر حسب طلب المستخدم
            const headerAvatar = document.getElementById('header-user-avatar');
            const notifBell = document.getElementById('notif-bell-btn');
            const tabSearch = document.getElementById('tab-search');
            const tabGroups = document.getElementById('tab-groups');
            const tabVip = document.getElementById('tab-vip');
            const headerSettingsBtn = document.getElementById('header-settings-btn');

            if (viewId === 'trouver') {
                if (headerAvatar) headerAvatar.style.display = '';
                if (notifBell) notifBell.style.display = '';
                if (tabSearch) tabSearch.style.display = '';
                if (tabGroups) tabGroups.style.display = '';
                if (tabVip) tabVip.style.display = '';
                if (headerSettingsBtn) headerSettingsBtn.style.display = 'none';
            } else if (viewId === 'chats' || viewId === 'contacts' || viewId === 'profil') {
                if (headerAvatar) headerAvatar.style.display = 'none'; // إخفاء الأفاتار بالكامل ليتنحى العنوان لليسار
                if (notifBell) notifBell.style.display = 'none'; // إخفاء الجرس
                if (tabSearch) tabSearch.style.display = viewId === 'profil' ? 'none' : ''; // إبقاء البحث ما عدا في البروفايل
                if (tabGroups) tabGroups.style.display = 'none'; // إخفاء القلب
                if (tabVip) tabVip.style.display = 'none'; // إخفاء الجوهرة
                if (headerSettingsBtn) headerSettingsBtn.style.display = viewId === 'profil' ? 'block' : 'none';
                
                // Click to copy ID from header badge
                if (viewId === 'profil') {
                    setTimeout(() => {
                        const hdrIdBadge = document.getElementById('hm-header-id-badge');
                        if (hdrIdBadge && !hdrIdBadge._hasClickHandler) {
                            hdrIdBadge._hasClickHandler = true;
                            hdrIdBadge.addEventListener('click', () => {
                                const idVal = document.getElementById('hm-header-id-val');
                                if (idVal) {
                                    navigator.clipboard.writeText(idVal.textContent).catch(() => {});
                                    const orig = idVal.style.color;
                                    idVal.style.color = '#4ade80';
                                    showToast('ID copié ✅');
                                    setTimeout(() => { idVal.style.color = orig; }, 1800);
                                }
                            });
                        }
                    }, 100);
                }
            }
        }

        // إذا انتقل لقسم الدردشات، نحمل المحادثات النشطة
        if (viewId === 'chats') {
            loadActiveChats();
        }

        // إعادة تحميل الأعضاء عند الانتقال لقسم الاستكشاف - مع الكاش لتجنب الطلبات الزائدة
        if (viewId === 'trouver' && currentUser) {
            const now = Date.now();
            const cacheExpired = (now - discoveryLastFetchTime) > DISCOVERY_CACHE_MS;
            if (cacheExpired || latestDiscoveryProfiles.length === 0) {
                debugLog('switchView: trouver tab - cache expired, reloading discovery users...');
                loadDiscoveryUsers(currentUser);
            } else {
                debugLog('switchView: trouver tab - using cached profiles, no refetch needed.');
                // إعادة رسم القائمة من الكاش بدون طلب جديد
                const container = document.getElementById('users-list-container');
                if (container) {
                    container.innerHTML = ''; // نظف الحاوية أولاً
                    renderDiscoveryView(latestDiscoveryProfiles, container);
                }
            }
        }
    };

    // ربط أزرار الشريط السفلي بالتنقل
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.id.replace('btn-nav-', '');
            window.switchAppView(id);
        });
    });

    // التبويب الافتراضي عند الدخول
    window.switchAppView('trouver');
}

// === نظام التبويبات العلوية لقسم الاستكشاف (Top Nav Tabs) ===
function initTopTabs() {
    const topTabBtns = document.querySelectorAll('.top-tab-btn');
    if (!topTabBtns.length) return;

    topTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            topTabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const tabId = btn.id;
            if (tabId === 'tab-nearby') {
                activeTopTab = 'nearby';
            } else if (tabId === 'tab-groups') {
                activeTopTab = 'groups'; // المتصلون الآن
            } else if (tabId === 'tab-vip') {
                activeTopTab = 'vip';
            } else if (tabId === 'tab-search') {
                activeTopTab = 'search';
            }

            // إذا كنا في صفحة أخرى غير الاستكشاف، ننتقل للاستكشاف
            const currentActiveView = document.querySelector('.app-view.active');
            if (currentActiveView && currentActiveView.id !== 'view-trouver') {
                if (window.switchAppView) {
                    window.switchAppView('trouver');
                }
            }

            // إعادة عرض القائمة بالتصفية الجديدة
            if (currentUser) {
                loadDiscoveryUsers(currentUser);
            }
        });
    });
}

// === تهيئة نظام البحث والفلترة في الشريط العلوي ===
function initHeaderSearch() {
    const input = document.getElementById('discovery-search-input');
    const advancedFilterBtn = document.getElementById('advanced-filter-btn');
    const clearBtn = document.getElementById('clear-search-btn');

    // زر Refresh - يعيد تحميل المستخدمين من Supabase مباشرة
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            if (!currentUser) return;
            // إعادة ضبط الكاش باش يجلب من Supabase من جديد
            discoveryLastFetchTime = 0;
            // أنيميشن دوران على الأيقونة
            const icon = refreshBtn.querySelector('i');
            if (icon) {
                icon.style.transition = 'transform 0.6s ease';
                icon.style.transform = 'rotate(360deg)';
                setTimeout(() => {
                    icon.style.transition = 'none';
                    icon.style.transform = 'rotate(0deg)';
                }, 650);
            }
            await loadDiscoveryUsers(currentUser);
        });
    }

    if (input) {
        input.addEventListener('input', debounce((e) => {
            searchFilterQuery = e.target.value;

            // تحديث زر مسح البحث
            if (clearBtn) {
                clearBtn.style.display = searchFilterQuery ? 'inline-block' : 'none';
            }

            // إعادة تصفية القائمة
            const listContainer = document.querySelector('.users-list-sub-container');
            if (listContainer) {
                renderFilteredList(latestDiscoveryProfiles, listContainer);
            }
        }, 300));
    }

    if (clearBtn && input) {
        clearBtn.addEventListener('click', () => {
            searchFilterQuery = '';
            input.value = '';
            clearBtn.style.display = 'none';

            const listContainer = document.querySelector('.users-list-sub-container');
            if (listContainer) {
                renderFilteredList(latestDiscoveryProfiles, listContainer);
            }
        });
    }

    if (advancedFilterBtn) {
        advancedFilterBtn.addEventListener('click', () => {
            const listContainer = document.querySelector('.users-list-sub-container');
            if (listContainer) {
                openAdvancedFilterModal(latestDiscoveryProfiles, listContainer);
            }
        });
    }
}

// === تحميل بيانات الملف الشخصي في قسم profil ===
async function loadOwnProfile(user) {
    const container = document.getElementById('own-profile-container');
    if (!container || !user) {
        debugLog(`loadOwnProfile skipped: container=${!!container}, user=${!!user}`);
        return;
    }

    debugLog("loadOwnProfile: Fetching own profile from database...");
    try {
        const { data: profilesList, error } = await sb
            .from('profiles')
            .select('*')
            .eq('user_id', user.id);

        if (error) throw error;

        const profile = profilesList && profilesList.length > 0 ? profilesList[0] : null;
        debugLog(`loadOwnProfile: Fetch completed. Profile found: ${!!profile}`);

        if (profile) {
            currentUserProfile = profile; // حفظ الملف الشخصي الحالي للمستخدم بما فيه الإحداثيات
            
            // حساب عدد الأصدقاء (عدد الأشخاص الذين تواصلنا معهم)
            let friendsCount = profile.friends_count || 0;
            try {
                const { data: userMessages } = await sb
                    .from('messages')
                    .select('sender_id, receiver_id')
                    .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`);
                
                if (userMessages) {
                    const uniquePartners = new Set();
                    userMessages.forEach(msg => {
                        if (msg.sender_id !== user.id) uniquePartners.add(msg.sender_id);
                        if (msg.receiver_id !== user.id) uniquePartners.add(msg.receiver_id);
                    });
                    friendsCount = uniquePartners.size;
                    
                    // تحديث في الداتابيز لتخزينها
                    if (friendsCount !== profile.friends_count) {
                        await sb.from('profiles').update({ friends_count: friendsCount }).eq('user_id', user.id);
                        profile.friends_count = friendsCount;
                    }
                }
            } catch (err) {
                console.error("Error calculating friends count:", err);
            }

            const age = calculateAge(profile.dob);
            const genderText = profile.gender === 'male' ? 'Homme' : profile.gender === 'female' ? 'Femme' : '-';
            const genderIcon = profile.gender === 'male' ? 'fa-mars' : 'fa-venus';
            const genderColor = profile.gender === 'male' ? '#00d2ff' : '#ff6b81';
            const initial = (profile.full_name || 'H').charAt(0).toUpperCase();

            // تحديث صورتنا الشخصية في الترويسة العلوية
            const headerAvatar = document.getElementById('header-user-avatar');
            if (headerAvatar) {
                if (profile.avatar_url) {
                    headerAvatar.innerHTML = `<img src="${sanitizeUrl(profile.avatar_url)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
                } else {
                    headerAvatar.textContent = initial;
                }
                let avatarClass = `header-user-avatar ${profile.gender === 'female' ? 'female' : 'male'}`;
                if (profile.is_vip) {
                    avatarClass += ' vip-avatar';
                }
                headerAvatar.className = avatarClass;
            }

            let ownExtraSection = '';
            if (profile.height || profile.residence || profile.profession || profile.company || profile.income || profile.body_type || profile.ethnicity || profile.hair_color) {
                ownExtraSection = `
                    <div class="profil-bio-section" style="margin-top: 8px; border-top: 1px solid rgba(255, 255, 255, 0.05); padding-top: 10px; text-align: left; width: 100%;">
                        <h4 style="margin-bottom: 10px;"><i class="fas fa-info-circle"></i> Informations supplémentaires</h4>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 13.5px; color: var(--text-muted);">
                            ${profile.height ? `<div><strong style="color:var(--text-white);">Taille :</strong> ${escapeHtml(profile.height)}</div>` : ''}
                            ${profile.residence ? `<div><strong style="color:var(--text-white);">Résidence :</strong> ${escapeHtml(profile.residence)}</div>` : ''}
                            ${profile.profession ? `<div><strong style="color:var(--text-white);">Profession :</strong> ${escapeHtml(profile.profession)}</div>` : ''}
                            ${profile.company ? `<div><strong style="color:var(--text-white);">Entreprise :</strong> ${escapeHtml(profile.company)}</div>` : ''}
                            ${profile.income ? `<div><strong style="color:var(--text-white);">Revenu :</strong> ${escapeHtml(profile.income)}</div>` : ''}
                            ${profile.body_type ? `<div><strong style="color:var(--text-white);">Morphologie :</strong> ${escapeHtml(profile.body_type)}</div>` : ''}
                            ${profile.ethnicity ? `<div><strong style="color:var(--text-white);">Origine :</strong> ${escapeHtml(profile.ethnicity)}</div>` : ''}
                            ${profile.hair_color ? `<div><strong style="color:var(--text-white);">Cheveux :</strong> ${escapeHtml(profile.hair_color)}</div>` : ''}
                        </div>
                    </div>
                `;
            }

            // قسم حسابات التواصل الاجتماعي مع إمكانية التعديل
            const provider = user.app_metadata?.provider;
            
            // بناء عناصر الحسابات (فقط Instagram و TikTok)
            let socialItems = `
                <div class="social-account-item" id="social-instagram-item">
                    <div class="social-account-icon" style="background: linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888);"><i class="fab fa-instagram"></i></div>
                    <div class="social-account-info">
                        <span class="social-account-platform">Instagram</span>
                        <span class="social-account-name" id="social-instagram-name">${profile.instagram ? '@' + escapeHtml(profile.instagram) : '<em style="opacity:0.5;">Non ajouté</em>'}</span>
                    </div>
                    ${profile.instagram ? `<a href="https://instagram.com/${escapeHtml(profile.instagram)}" target="_blank" class="social-account-link-btn" title="Visiter"><i class="fas fa-external-link-alt"></i></a>` : ''}
                    <button class="social-account-edit-btn" data-platform="instagram" data-current="${profile.instagram || ''}" title="Modifier"><i class="fas fa-pen"></i></button>
                </div>
                <div class="social-account-item" id="social-tiktok-item">
                    <div class="social-account-icon" style="background: #000; border: 1px solid rgba(255,255,255,0.15);"><i class="fab fa-tiktok"></i></div>
                    <div class="social-account-info">
                        <span class="social-account-platform">TikTok</span>
                        <span class="social-account-name" id="social-tiktok-name">${profile.tiktok ? '@' + escapeHtml(profile.tiktok) : '<em style="opacity:0.5;">Non ajouté</em>'}</span>
                    </div>
                    ${profile.tiktok ? `<a href="https://tiktok.com/@${escapeHtml(profile.tiktok)}" target="_blank" class="social-account-link-btn" title="Visiter"><i class="fas fa-external-link-alt"></i></a>` : ''}
                    <button class="social-account-edit-btn" data-platform="tiktok" data-current="${profile.tiktok || ''}" title="Modifier"><i class="fas fa-pen"></i></button>
                </div>`;

            const socialLinksSection = `
                <div class="social-accounts-section" style="margin-top: 10px; width: 100%; text-align: left;">
                    <h4 style="margin-bottom: 8px; font-size: 12px; color: var(--color-primary); display: flex; align-items: center; gap: 6px; font-weight: 700;">
                        <i class="fas fa-share-alt"></i> Mes comptes sociaux
                    </h4>
                    <div class="social-accounts-list" style="display: flex; flex-direction: column; gap: 8px;">
                        ${socialItems}
                    </div>
                </div>
            `;

            const avatarDisplay = profile.avatar_url
                ? `<img src="${sanitizeUrl(profile.avatar_url)}" alt="" loading="lazy" id="own-avatar-img">`
                : initial;

            // بناء معرض الصور أو الخلفية البديلة لبروفايل المستخدم الحالي
            const galleryList = (profile.gallery && Array.isArray(profile.gallery)) ? profile.gallery.filter(Boolean) : [];
            let bannerHtml = '';
            if (galleryList.length > 0) {
                let slides = '';
                let dots = '';
                galleryList.forEach((url, i) => {
                    slides += `
                        <div class="carousel-slide">
                            <img src="${sanitizeUrl(url)}" style="width:100%; height:100%; object-fit:cover; filter: brightness(0.75);" class="gallery-img-clickable" data-gallery-index="${i}" loading="lazy">
                        </div>
                    `;
                    dots += `<div class="carousel-dot ${i === 0 ? 'active' : ''}"></div>`;
                });
                bannerHtml = `
                    <div class="gallery-carousel" id="own-gallery-carousel">
                        <div class="carousel-track">
                            ${slides}
                        </div>
                        <div class="carousel-indicators">
                            ${dots}
                        </div>
                    </div>
                `;
            } else {
                bannerHtml = profile.avatar_url 
                    ? `<img src="${sanitizeUrl(profile.avatar_url)}" class="blurred-bg-fallback clickable-fallback-bg" loading="lazy">`
                    : '';
            }

            container.innerHTML = `
                <div class="profil-card" style="position: relative; overflow: hidden; padding-top: 0;">
                    <!-- خلفية البروفايل (معرض الصور أو أفاتار مشوش) -->
                    <div class="profile-header-banner" style="width: calc(100% + 20px); margin-left: -10px; margin-right: -10px; height: 250px; position: relative; overflow: hidden; z-index: 1; border-radius: 20px 20px 0 0; background: ${profile.gender === 'female' ? 'linear-gradient(135deg, #f97316, #ec4899)' : 'linear-gradient(135deg, #0ea5e9, #6366f1)'}; margin-bottom: 10px;">
                        ${bannerHtml}
                        
                        <!-- دائرة الصورة المركزية للمستخدم الحالي (ممركزة في وسط البانر) -->
                        <div class="profil-avatar-ring" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 5; margin: 0;">
                            <div class="profil-avatar-letter" style="border-color: ${genderColor}; background: #1c1c1e; width: 110px; height: 110px; box-shadow: 0 0 20px rgba(0,0,0,0.6);">${avatarDisplay}</div>
                            <button class="profil-avatar-change-btn" id="change-avatar-btn" title="Changer la photo" style="z-index: 6;">
                                <i class="fas fa-camera"></i>
                            </button>
                            <input type="file" id="avatar-file-input" accept="image/*" style="display:none;">
                        </div>
                    </div>
                    <h2 class="profil-name" style="text-align: center; margin-bottom: 8px; width: 100%; display: block;">
                        <span style="position: relative; display: inline-block; padding-right: 28px;">
                            <span id="profil-display-name">${escapeHtml(profile.full_name || 'Utilisateur HayMoi')}</span>
                            ${profile.is_verified ? ' <i class="fas fa-check-circle" style="color: #3b82f6; font-size: 16px; vertical-align: middle; margin-left: 4px;" title="Vérifié"></i>' : ''}
                            ${profile.is_vip ? ' <i class="fas fa-gem" style="color: #fbbf24; font-size: 14px; vertical-align: middle; margin-left: 4px;" title="Membre VIP"></i>' : ''}
                            <button id="edit-name-btn" class="profil-edit-name-btn" title="Modifier le nom" style="position: absolute; right: 0; top: 50%; transform: translateY(-50%); margin: 0; padding: 4px; line-height: 1;">
                                <i class="fas fa-pen"></i>
                            </button>
                        </span>
                    </h2>
                    <div class="profil-stats">
                        <div class="stat-item">
                            <i class="fas ${genderIcon}" style="color: ${genderColor};"></i>
                            <span>${genderText}</span>
                        </div>
                        <div class="stat-divider"></div>
                        <div class="stat-item">
                            <i class="fas fa-calendar-day" style="color: var(--color-primary);"></i>
                            <span>${age} ans</span>
                        </div>
                    </div>
                    
                    <!-- شريط إحصائيات التفاعل -->
                    <div class="profile-stats-bar">
                        <div class="profile-stat-col friends">
                            <span class="stat-num">${friendsCount}</span>
                            <span class="stat-label"><i class="fas fa-user-group"></i> Amis</span>
                        </div>
                        <div class="profile-stat-divider"></div>
                        <div class="profile-stat-col visits">
                            <span class="stat-num">${profile.visits_count || 0}</span>
                            <span class="stat-label"><i class="fas fa-eye"></i> Visites</span>
                        </div>
                        <div class="profile-stat-divider"></div>
                        <div class="profile-stat-col likes">
                            <span class="stat-num">${profile.likes_count || 0}</span>
                            <span class="stat-label"><i class="fas fa-heart"></i> Likes</span>
                        </div>
                    </div>
                    
                    ${socialLinksSection}
                    ${ownExtraSection}
                    
                    <!-- Bio Section with Hashtags -->
                    <div class="profil-bio-card hm-bio-card" style="margin-top: 10px; width: 100%; box-sizing: border-box;">
                        <div class="hm-bio-header">
                            <span class="hm-bio-title"><i class="fas fa-comment-dots"></i> À propos de moi</span>
                            <button class="hm-bio-edit-btn" id="bio-edit-hashtag-btn" title="Modifier les hashtags">
                                <i class="fas fa-pen"></i>
                            </button>
                        </div>
                        <div class="hm-bio-body" id="hm-bio-body">
                            ${profile.bio
                                ? `<p class="hm-bio-text" id="profil-bio-text">${escapeHtml(profile.bio)}</p>`
                                : `<p class="hm-bio-empty" id="profil-bio-text">Ajoutez une biographie ou des hashtags pour vous décrire ✨</p>`
                            }
                            <div class="hm-hashtags-row" id="hm-hashtags-row">
                                ${(profile.hashtags && profile.hashtags.length > 0)
                                    ? profile.hashtags.map(h => `<span class="hm-hashtag-chip">${escapeHtml(h)}</span>`).join('')
                                    : ''
                                }
                            </div>
                        </div>
                    </div>

                    <div class="profil-actions-wrapper">
                        <button id="edit-profile-btn" class="btn profil-edit-btn" style="margin-bottom: 0;"><i class="fas fa-edit"></i> Modifier le profil</button>
                    </div>

                    <!-- Settings Bottom Sheet -->
                    <div id="settings-sheet-overlay" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:3000;"></div>
                    <div id="settings-sheet" class="settings-sheet-panel">
                        <!-- Handle bar -->
                        <div class="settings-sheet-handle"></div>
                        <h3 class="settings-sheet-title">Paramètres</h3>

                        <!-- Connected Provider -->
                        ${provider ? `
                        <div class="settings-row" style="pointer-events:none;">
                            <div style="display:flex;align-items:center;gap:12px;">
                                <div class="settings-icon-box" style="background:${provider === 'google' ? 'linear-gradient(135deg, #4285F4, #34A853)' : '#1877F2'};">
                                    <i class="fab fa-${provider === 'google' ? 'google' : 'facebook-f'}" style="font-size:16px;color:#fff;"></i>
                                </div>
                                <div>
                                    <div class="settings-row-label">Connecté via ${provider === 'google' ? 'Google' : 'Facebook'}</div>
                                    <div class="settings-row-sublabel">${user.email || ''}</div>
                                </div>
                            </div>
                            <i class="fas fa-check-circle" style="color:${provider === 'google' ? '#34A853' : '#1877F2'};font-size:18px;flex-shrink:0;"></i>
                        </div>
                        ` : ''}

                        <!-- Theme Toggle -->
                        <div class="settings-row">
                            <div style="display:flex;align-items:center;gap:12px;">
                                <div class="settings-icon-box">
                                    <i class="fas fa-moon" id="theme-icon" style="font-size:16px;color:#a78bfa;"></i>
                                </div>
                                <div>
                                    <div class="settings-row-label">Apparence</div>
                                    <div class="settings-row-sublabel" id="theme-label">Mode sombre</div>
                                </div>
                            </div>
                            <!-- iOS Toggle -->
                            <label style="position:relative;width:50px;height:28px;cursor:pointer;flex-shrink:0;">
                                <input type="checkbox" id="theme-toggle-checkbox" style="opacity:0;width:0;height:0;position:absolute;">
                                <div id="theme-toggle-track" style="position:absolute;inset:0;border-radius:14px;background:rgba(255,255,255,0.15);transition:background 0.3s;"></div>
                                <div id="theme-toggle-thumb" style="position:absolute;top:4px;left:4px;width:20px;height:20px;background:#fff;border-radius:50%;transition:transform 0.3s cubic-bezier(0.175,0.885,0.32,1.275);"></div>
                            </label>
                        </div>

                        <!-- Language -->
                        <div id="lang-settings-btn" class="settings-row" style="cursor:pointer;">
                            <div style="display:flex;align-items:center;gap:12px;">
                                <div class="settings-icon-box" style="background:linear-gradient(135deg, #10b981, #34d399);">
                                    <i class="fas fa-globe" style="font-size:16px;color:#fff;"></i>
                                </div>
                                <div>
                                    <div class="settings-row-label">Langue de l'application</div>
                                    <div class="settings-row-sublabel" id="current-lang-text">Français</div>
                                </div>
                            </div>
                            <i class="fas fa-chevron-right" style="color:rgba(255,255,255,0.3);font-size:14px;flex-shrink:0;"></i>
                        </div>

                        <!-- Logout -->
                        <div id="logout-btn-app" class="settings-logout-row">
                            <div class="settings-logout-icon-box">
                                <i class="fas fa-sign-out-alt" style="font-size:16px;color:#ef4444;"></i>
                            </div>
                            <div>
                                <div class="settings-logout-label">Se déconnecter</div>
                                <div class="settings-logout-sublabel">Fermer la session</div>
                            </div>
                        </div>

                        <!-- Cancel -->
                        <button id="close-settings-btn" class="settings-cancel-btn">Annuler</button>
                    </div>
                </div>
            `;

            // تهيئة الكاروسيل لمعرض صور المستخدم الحالي
            const ownCarouselEl = document.getElementById('own-gallery-carousel');
            if (ownCarouselEl) {
                initProfileCarousel(ownCarouselEl);
            }

            // إعداد معرض الصور المعروض في الـ Lightbox للمستخدم الحالي
            const ownLightboxPhotos = [];
            if (profile.avatar_url) ownLightboxPhotos.push(profile.avatar_url);
            galleryList.forEach(url => ownLightboxPhotos.push(url));

            // عند الضغط على الأفاتار الدائري
            const ownAvatarImg = document.getElementById('own-avatar-img');
            if (ownAvatarImg && ownLightboxPhotos.length > 0) {
                ownAvatarImg.style.cursor = 'pointer';
                ownAvatarImg.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openLightbox(ownLightboxPhotos, 0);
                });
            }

            // عند الضغط على صور المعرض في الخلفية
            if (ownCarouselEl && ownLightboxPhotos.length > 0) {
                const clickableGalleryImgs = ownCarouselEl.querySelectorAll('.gallery-img-clickable');
                clickableGalleryImgs.forEach(img => {
                    img.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const gIdx = parseInt(img.getAttribute('data-gallery-index'), 10);
                        const startIndex = profile.avatar_url ? gIdx + 1 : gIdx;
                        openLightbox(ownLightboxPhotos, startIndex);
                    });
                });
            }

            // عند الضغط على الخلفية البديلة المشوشة
            const ownFallbackBg = container.querySelector('.clickable-fallback-bg');
            if (ownFallbackBg && ownLightboxPhotos.length > 0) {
                ownFallbackBg.style.cursor = 'pointer';
                ownFallbackBg.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openLightbox(ownLightboxPhotos, 0);
                });
            }

            // ربط زر تعديل البروفايل
            const editBtn = document.getElementById('edit-profile-btn');
            if (editBtn) {
                editBtn.addEventListener('click', () => {
                    window.location.href = 'profile-setup.html';
                });
            }

            // ربط زر تعديل الاسم المباشر
            const editNameBtn = document.getElementById('edit-name-btn');
            if (editNameBtn) {
                editNameBtn.addEventListener('click', async () => {
                    const currentName = profile.full_name || '';
                    const newName = prompt("Entrez votre nouveau nom :", currentName);
                    if (newName !== null) {
                        const trimmedName = newName.trim();
                        if (trimmedName === '') {
                            alert("Le nom ne peut pas être vide.");
                            return;
                        }
                        if (trimmedName.length > 18) {
                            alert("Le nom ne peut pas dépasser 18 caractères.");
                            return;
                        }
                        
                        try {
                            editNameBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                            editNameBtn.disabled = true;

                            const { error } = await sb
                                .from('profiles')
                                .update({ full_name: trimmedName })
                                .eq('user_id', user.id);

                            if (error) throw error;

                            profile.full_name = trimmedName;
                            if (currentUserProfile) {
                                currentUserProfile.full_name = trimmedName;
                            }
                            
                            const displayNameEl = document.getElementById('profil-display-name');
                            if (displayNameEl) {
                                displayNameEl.textContent = trimmedName;
                            }
                            
                            // تحديث الاسم في الهيدر أيضًا
                            const headerAvatar = document.getElementById('header-user-avatar');
                            if (headerAvatar && !profile.avatar_url) {
                                const initial = trimmedName.charAt(0).toUpperCase();
                                headerAvatar.textContent = initial;
                            }

                            alert("Nom modifié avec succès !");
                        } catch (err) {
                            console.error("Erreur lors de la modification du nom:", err);
                            alert("Une erreur est survenue lors de la modification du nom.");
                        } finally {
                            editNameBtn.innerHTML = '<i class="fas fa-pen"></i>';
                            editNameBtn.disabled = false;
                        }
                    }
                });
            }
            // === ID Badge Copy ===
            const hmIdBadge = document.getElementById('hm-id-badge');
            if (hmIdBadge) {
                hmIdBadge.addEventListener('click', () => {
                    const idVal = document.getElementById('hm-id-value');
                    const idText = idVal ? idVal.textContent : '';
                    if (idText) {
                        navigator.clipboard.writeText(idText).then(() => {
                            showToast('🔑 ID copié : ' + idText);
                            hmIdBadge.classList.add('copied');
                            setTimeout(() => hmIdBadge.classList.remove('copied'), 1500);
                        }).catch(() => showToast('ID : ' + idText));
                    }
                });
            }

            // === Hashtag Bio Edit Button ===
            const bioEditHashtagBtn = document.getElementById('bio-edit-hashtag-btn');
            if (bioEditHashtagBtn) {
                bioEditHashtagBtn.addEventListener('click', () => {
                    openHashtagEditor(profile, user);
                });
            }

            // === Settings Bottom Sheet ===

            // ربط أزرار تعديل حسابات التواصل الاجتماعي
            document.querySelectorAll('.social-account-edit-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const platform = btn.dataset.platform;
                    const currentVal = btn.dataset.current || '';
                    const platformLabel = platform === 'instagram' ? 'Instagram' : 'TikTok';
                    const placeholder = platform === 'instagram' ? 'ex: hamza_123' : 'ex: hamza.tiktok';
                    
                    const newVal = prompt(`أدخل اسم حسابك على ${platformLabel} (بدون @):\n\nاتركه فارغاً لحذفه.`, currentVal);
                    
                    if (newVal === null) return; // المستخدم ألغى
                    
                    const trimmed = newVal.trim().replace(/^@/, ''); // إزالة @ إذا أضافها
                    
                    try {
                        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                        btn.disabled = true;
                        
                        const updateData = {};
                        updateData[platform] = trimmed || null;
                        
                        const { error } = await sb
                            .from('profiles')
                            .update(updateData)
                            .eq('user_id', user.id);
                        
                        if (error) throw error;
                        
                        // تحديث البيانات المحلية
                        profile[platform] = trimmed || null;
                        if (currentUserProfile) currentUserProfile[platform] = trimmed || null;
                        
                        // تحديث الواجهة
                        const nameEl = document.getElementById(`social-${platform}-name`);
                        if (nameEl) {
                            nameEl.innerHTML = trimmed ? '@' + escapeHtml(trimmed) : '<em style="opacity:0.5;">Non ajouté</em>';
                        }
                        
                        // تحديث الرابط الخارجي
                        btn.dataset.current = trimmed;
                        
                        // إعادة بناء عنصر الحساب لتحديث رابط الزيارة
                        const itemEl = document.getElementById(`social-${platform}-item`);
                        if (itemEl) {
                            const existingLinkBtn = itemEl.querySelector('.social-account-link-btn');
                            if (trimmed && !existingLinkBtn) {
                                const linkBtn = document.createElement('a');
                                linkBtn.className = 'social-account-link-btn';
                                linkBtn.href = platform === 'instagram' 
                                    ? `https://instagram.com/${trimmed}` 
                                    : `https://tiktok.com/@${trimmed}`;
                                linkBtn.target = '_blank';
                                linkBtn.title = 'Visiter';
                                linkBtn.innerHTML = '<i class="fas fa-external-link-alt"></i>';
                                itemEl.insertBefore(linkBtn, btn);
                            } else if (!trimmed && existingLinkBtn) {
                                existingLinkBtn.remove();
                            } else if (trimmed && existingLinkBtn) {
                                existingLinkBtn.href = platform === 'instagram' 
                                    ? `https://instagram.com/${trimmed}` 
                                    : `https://tiktok.com/@${trimmed}`;
                            }
                        }
                        
                    } catch (err) {
                        console.error(`Erreur modification ${platform}:`, err);
                        alert(`خطأ في تعديل حساب ${platformLabel}`);
                    } finally {
                        btn.innerHTML = '<i class="fas fa-pen"></i>';
                        btn.disabled = false;
                    }
                });
            });

            // === Settings Bottom Sheet ===
            const openSettingsBtn = document.getElementById('open-settings-btn');
            const settingsSheet = document.getElementById('settings-sheet');
            const settingsOverlay = document.getElementById('settings-sheet-overlay');
            const closeSettingsBtn = document.getElementById('close-settings-btn');
            const logoutBtnApp = document.getElementById('logout-btn-app');
            const themeCheckbox = document.getElementById('theme-toggle-checkbox');
            const themeTrack = document.getElementById('theme-toggle-track');
            const themeThumb = document.getElementById('theme-toggle-thumb');
            const themeIcon = document.getElementById('theme-icon');
            const themeLabel = document.getElementById('theme-label');

            function openSettingsSheet() {
                if (!settingsSheet || !settingsOverlay) return;
                const bottomNav = document.querySelector('.bottom-nav');
                if (bottomNav) bottomNav.style.display = 'none';
                settingsOverlay.style.display = 'block';
                settingsSheet.style.bottom = '0';
            }
            function closeSettingsSheet() {
                if (!settingsSheet || !settingsOverlay) return;
                settingsSheet.style.bottom = '-400px';
                setTimeout(() => {
                    settingsOverlay.style.display = 'none';
                    const bottomNav = document.querySelector('.bottom-nav');
                    if (bottomNav) bottomNav.style.display = '';
                }, 350);
            }

            if (openSettingsBtn) openSettingsBtn.addEventListener('click', openSettingsSheet);
            if (closeSettingsBtn) closeSettingsBtn.addEventListener('click', closeSettingsSheet);
            if (settingsOverlay) settingsOverlay.addEventListener('click', closeSettingsSheet);

            // ربط كليك زر الإعدادات الجديد في الهيدر لفتح قائمة الإعدادات
            const headerSettingsBtn = document.getElementById('header-settings-btn');
            if (headerSettingsBtn) headerSettingsBtn.addEventListener('click', openSettingsSheet);

            // === Language Selector Logic ===
            const langSettingsBtn = document.getElementById('lang-settings-btn');
            if (langSettingsBtn) {
                const currentLang = localStorage.getItem('haymoi_lang') || 'fr';
                const langNames = { 'fr': 'Français', 'ar': 'العربية', 'en': 'English' };
                document.getElementById('current-lang-text').innerText = langNames[currentLang];
                
                langSettingsBtn.addEventListener('click', () => {
                    closeSettingsSheet();
                    showLanguageSelectorModal();
                });
            }

            function showLanguageSelectorModal() {
                const modal = document.createElement('div');
                modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:4000;display:flex;align-items:center;justify-content:center;padding:20px;';
                
                const currentLang = localStorage.getItem('haymoi_lang') || 'fr';
                
                modal.innerHTML = `
                    <div style="background:#1e293b;border-radius:24px;width:100%;max-width:340px;padding:24px;border:1px solid rgba(255,255,255,0.1);box-shadow:0 10px 40px rgba(0,0,0,0.5);">
                        <h3 style="color:#fff;font-size:20px;font-weight:800;margin-top:0;margin-bottom:20px;text-align:center;">Langue / اللغة</h3>
                        
                        <div style="display:flex;flex-direction:column;gap:12px;">
                            <button class="lang-option" data-lang="fr" style="background:${currentLang==='fr'?'rgba(16,185,129,0.15)':'rgba(255,255,255,0.05)'};border:1px solid ${currentLang==='fr'?'#10b981':'rgba(255,255,255,0.1)'};color:#fff;padding:16px;border-radius:16px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;font-weight:600;font-size:16px;transition:0.2s;">
                                <span><span style="font-size:20px;margin-right:12px;">🇫🇷</span>Français</span>
                                ${currentLang==='fr'?'<i class="fas fa-check" style="color:#10b981;"></i>':''}
                            </button>
                            
                            <button class="lang-option" data-lang="ar" style="background:${currentLang==='ar'?'rgba(16,185,129,0.15)':'rgba(255,255,255,0.05)'};border:1px solid ${currentLang==='ar'?'#10b981':'rgba(255,255,255,0.1)'};color:#fff;padding:16px;border-radius:16px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;font-weight:600;font-size:16px;transition:0.2s;">
                                <span><span style="font-size:20px;margin-right:12px;">🇲🇦</span>العربية</span>
                                ${currentLang==='ar'?'<i class="fas fa-check" style="color:#10b981;"></i>':''}
                            </button>
                            
                            <button class="lang-option" data-lang="en" style="background:${currentLang==='en'?'rgba(16,185,129,0.15)':'rgba(255,255,255,0.05)'};border:1px solid ${currentLang==='en'?'#10b981':'rgba(255,255,255,0.1)'};color:#fff;padding:16px;border-radius:16px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;font-weight:600;font-size:16px;transition:0.2s;">
                                <span><span style="font-size:20px;margin-right:12px;">🇬🇧</span>English</span>
                                ${currentLang==='en'?'<i class="fas fa-check" style="color:#10b981;"></i>':''}
                            </button>
                        </div>
                        
                        <button id="close-lang-modal" style="width:100%;margin-top:20px;background:rgba(255,255,255,0.1);border:none;color:#fff;padding:14px;border-radius:16px;font-weight:700;font-size:15px;cursor:pointer;transition:0.2s;">Fermer / إغلاق</button>
                    </div>
                `;
                
                document.body.appendChild(modal);
                
                modal.querySelectorAll('.lang-option').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const newLang = btn.getAttribute('data-lang');
                        localStorage.setItem('haymoi_lang', newLang);
                        window.location.reload();
                    });
                });
                
                modal.querySelector('#close-lang-modal').addEventListener('click', () => {
                    modal.remove();
                });
                
                modal.addEventListener('click', (e) => {
                    if(e.target === modal) modal.remove();
                });
            }

            // === Dark / Light Mode Toggle ===
            function applyTheme(isDark) {
                if (isDark) {
                    document.documentElement.removeAttribute('data-theme');
                    if (themeIcon) { themeIcon.className = 'fas fa-moon'; themeIcon.style.color = '#a78bfa'; }
                    if (themeLabel) themeLabel.textContent = 'Mode sombre';
                    if (themeTrack) themeTrack.style.background = 'rgba(255,255,255,0.15)';
                    if (themeThumb) themeThumb.style.transform = 'translateX(0)';
                } else {
                    document.documentElement.setAttribute('data-theme', 'light');
                    if (themeIcon) { themeIcon.className = 'fas fa-sun'; themeIcon.style.color = '#fbbf24'; }
                    if (themeLabel) themeLabel.textContent = 'Mode clair';
                    if (themeTrack) themeTrack.style.background = '#a78bfa';
                    if (themeThumb) themeThumb.style.transform = 'translateX(22px)';
                }
                localStorage.setItem('haymoi-theme', isDark ? 'dark' : 'light');
            }

            // تطبيق الثيم المحفوظ عند الدخول
            const savedTheme = localStorage.getItem('haymoi-theme') || 'dark';
            const isCurrentlyDark = savedTheme === 'dark';
            if (themeCheckbox) themeCheckbox.checked = !isCurrentlyDark;
            applyTheme(isCurrentlyDark);

            if (themeCheckbox) {
                themeCheckbox.addEventListener('change', () => {
                    applyTheme(!themeCheckbox.checked);
                });
            }

            // زر تسجيل الخروج
            if (logoutBtnApp) {
                logoutBtnApp.addEventListener('click', async () => {
                    await updateLastSeenInDB();
                    await sb.auth.signOut();
                    window.location.href = 'index.html';
                });
            }

            // زر تغيير الصورة الشخصية
            const changeAvatarBtn = document.getElementById('change-avatar-btn');
            const avatarFileInput = document.getElementById('avatar-file-input');
            if (changeAvatarBtn && avatarFileInput) {
                changeAvatarBtn.addEventListener('click', () => avatarFileInput.click());
                avatarFileInput.addEventListener('change', async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;

                    // عرض مؤشر التحميل
                    const avatarEl = document.querySelector('.profil-avatar-letter');
                    if (avatarEl) {
                        avatarEl.innerHTML = '<div class="avatar-upload-overlay"><i class="fas fa-spinner fa-spin"></i></div>' + avatarEl.innerHTML;
                    }

                    const newUrl = await uploadAvatar(file);
                    if (newUrl) {
                        // إعادة تحميل البروفايل
                        loadOwnProfile(currentUser);
                        showToastNotification(null, 'Profil mis à jour', 'Votre photo de profil a été modifiée avec succès !', 'system');
                    } else {
                        // إزالة مؤشر التحميل
                        const overlay = avatarEl?.querySelector('.avatar-upload-overlay');
                        if (overlay) overlay.remove();
                    }
                    avatarFileInput.value = '';
                });
            }
        }
    } catch (err) {
        console.error("خطأ أثناء جلب الملف الشخصي:", err);
        container.innerHTML = '<p style="text-align:center; color: var(--text-muted);">Une erreur est survenue lors du chargement des données.</p>';
    }
}

// === نظام جلب الموقع الجغرافي للمستخدم وتحديثه ===
function requestLocationAndSave() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            console.warn("تحديد الموقع الجغرافي غير مدعوم في هذا المتصفح.");
            debugLog("requestLocationAndSave: Geolocation not supported by browser.", true);
            reject(new Error("Geolocation not supported by browser."));
            return;
        }

        debugLog("requestLocationAndSave: Querying browser geolocation...");
        navigator.geolocation.getCurrentPosition(async (position) => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            debugLog(`requestLocationAndSave: Got coordinates: lat=${lat}, lon=${lon}`);

            if (!currentUser) {
                debugLog("requestLocationAndSave: currentUser is null, skipping save.");
                resolve();
                return;
            }

            try {
                const { error } = await sb
                    .from('profiles')
                    .update({ latitude: lat, longitude: lon })
                    .eq('user_id', currentUser.id);

                if (error) throw error;

                debugLog("requestLocationAndSave: Saved coordinates to profiles table successfully.");

                // جلب البروفايل بالكامل من قاعدة البيانات إذا لم يكن متوفراً محلياً
                if (!currentUserProfile) {
                    const { data } = await sb.from('profiles').select('*').eq('user_id', currentUser.id);
                    if (data && data.length > 0) {
                        currentUserProfile = data[0];
                    }
                }

                // تحديث الإحداثيات في المتغير العام أيضاً
                if (currentUserProfile) {
                    currentUserProfile.latitude = lat;
                    currentUserProfile.longitude = lon;
                }

                // إعادة تحميل قائمة الأعضاء لحساب المسافات الحقيقية بناءً على الموقع الجديد
                debugLog("requestLocationAndSave: Reloading discovery users to reflect new coordinates...");
                loadDiscoveryUsers(currentUser);
                resolve();

            } catch (err) {
                console.error("خطأ أثناء تحديث الموقع في قاعدة البيانات:", err);
                debugLog("requestLocationAndSave: Error updating DB profile location: " + err.message, true);
                resolve(); // We still resolve because they gave permission, just DB failed
            }
        }, (error) => {
            console.warn("فشل جلب الموقع الجغرافي أو تم رفض الإذن:", error.message);
            debugLog("requestLocationAndSave: Geolocation failed/denied: " + error.message, true);
            reject(new Error("Permission denied or failed to get location."));
        }, {
            enableHighAccuracy: false,   // تعطيل GPS الدقيق لتسريع الاستجابة وتوفير البطارية
            timeout: 8000,
            maximumAge: 300000           // استخدام آخر موقع محفوظ إذا كان عمره أقل من 5 دقائق
        });
    });
}

// === نظام قائمة الأعضاء (Discovery Feed) ===
async function loadDiscoveryUsers(currentUser) {
    let container = document.getElementById('users-list-container');
    if (!container) {
        debugLog("loadDiscoveryUsers: Container users-list-container missing. Creating dynamically...");
        // إذا لم يكن موجوداً، نقوم بإنشائه ديناميكياً داخل view-trouver
        const trouverView = document.getElementById('view-trouver');
        if (trouverView) {
            container = document.createElement('div');
            container.className = 'users-list';
            container.id = 'users-list-container';
            trouverView.appendChild(container);
            debugLog("loadDiscoveryUsers: Container created dynamically.");
        }
    }
    if (!container || !currentUser) {
        debugLog(`loadDiscoveryUsers skipped: container=${!!container}, currentUser=${!!currentUser}`);
        return;
    }

    debugLog("loadDiscoveryUsers: Starting fetch...");
    // عرض مؤشر التحميل فقط إذا لم نكن في وضع البحث النشط لتجنب الفليكر
    if (activeTopTab !== 'search' || !document.getElementById('discovery-search-input')) {
        container.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; padding:40px 0; gap:12px;">
                <div class="loading-spinner"></div>
                <p style="color:var(--text-muted); font-size:13px;">Chargement des membres à proximité...</p>
            </div>
        `;
    }

    try {
        debugLog(`loadDiscoveryUsers: DB query for profiles (excluding ${currentUser.id})...`);
        const { data: profiles, error } = await sb
            .from('profiles')
            .select('*')
            .neq('user_id', currentUser.id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        debugLog(`loadDiscoveryUsers: DB returned ${profiles ? profiles.length : 0} profiles.`);

        if (!profiles || profiles.length === 0) {
            debugLog("loadDiscoveryUsers: profiles array is empty.");
            container.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:center; padding:50px 20px; gap:12px; text-align:center;">
                    <i class="fas fa-users" style="font-size:40px; color:var(--text-muted); opacity:0.4;"></i>
                    <p style="color:var(--text-muted); font-size:14px;">Aucun membre pour le moment.<br>Soyez le premier à inviter vos amis !</p>
                </div>
            `;
            return;
        }

        // تصفية التكرارات (إبقاء البروفايل الأول الفريد لكل مستخدم)
        const uniqueProfiles = [];
        const seenUserIds = new Set();
        profiles.forEach(p => {
            if (p.last_seen) {
                lastSeenTimeMap.set(p.user_id, p.last_seen);
            }
            if (!seenUserIds.has(p.user_id)) {
                seenUserIds.add(p.user_id);
                uniqueProfiles.push(p);
            }
        });
        debugLog(`loadDiscoveryUsers: Profiles after removing duplicates: ${uniqueProfiles.length}`);

        // تصفية المستخدمين المحظورين
        const filteredProfiles = uniqueProfiles.filter(p => !blockedUserIds.has(p.user_id));
        debugLog(`loadDiscoveryUsers: Profiles after filtering blocked: ${filteredProfiles.length}`);

        // حساب المسافات إن وجدت الإحداثيات
        if (currentUserProfile && currentUserProfile.latitude && currentUserProfile.longitude) {
            debugLog(`loadDiscoveryUsers: Calculating distances using current user position (${currentUserProfile.latitude}, ${currentUserProfile.longitude})`);
            filteredProfiles.forEach(p => {
                p.distance = calculateDistance(currentUserProfile.latitude, currentUserProfile.longitude, p.latitude, p.longitude);
            });
        } else {
            debugLog("loadDiscoveryUsers: Skipped distance calculations (currentUserProfile or coordinates missing).");
        }

        // ترتيب الأعضاء: VIP أولاً، ثم حسب المسافة أو تاريخ الإنشاء
        filteredProfiles.sort((a, b) => {
            const aVip = a.is_vip ? 1 : 0;
            const bVip = b.is_vip ? 1 : 0;
            if (aVip !== bVip) {
                return bVip - aVip;
            }
            if (a.distance !== undefined && a.distance !== null && b.distance !== undefined && b.distance !== null) {
                return a.distance - b.distance;
            }
            if (a.distance !== undefined && a.distance !== null) return -1;
            if (b.distance !== undefined && b.distance !== null) return 1;
            return new Date(b.created_at || 0) - new Date(a.created_at || 0);
        });

        debugLog(`loadDiscoveryUsers: Calling renderDiscoveryView with ${filteredProfiles.length} profiles...`);
        discoveryLastFetchTime = Date.now(); // حفظ وقت آخر جلب ناجح للكاش
        renderDiscoveryView(filteredProfiles, container);

    } catch (err) {
        console.error("خطأ أثناء جلب الأعضاء:", err);
        debugLog("loadDiscoveryUsers: Error fetching profiles: " + err.message, true);
        container.innerHTML = `<p style="text-align:center; color:var(--text-muted); padding:40px 0;">Une erreur est survenue lors du chargement des membres.</p>`;
    }
}

// دالة رسم المحتوى حسب التبويب العلوي النشط
function renderDiscoveryView(profiles, container) {
    latestDiscoveryProfiles = profiles; // حفظ القائمة عالمياً
    debugLog(`renderDiscoveryView: activeTopTab=${activeTopTab}, profiles count=${profiles.length}`);
    container.innerHTML = '';

    if (activeTopTab === 'vip') {
        const isUserVip = currentUserProfile && currentUserProfile.is_vip === true;
        // عرض بطاقة VIP الترويجية الممتازة
        const vipCard = document.createElement('div');
        vipCard.className = 'vip-premium-card glass-card';
        vipCard.innerHTML = `
            <div class="vip-badge-icon"><i class="fas fa-gem"></i></div>
            <h3>HayMoi VIP</h3>
            <p class="vip-tagline">ارتقِ بتجربتك واستمتع بمميزات حصرية ورائعة!</p>
            <ul class="vip-features-list">
                <li><i class="fas fa-check-circle" style="color: #fbbf24; margin-left: 6px;"></i> <span>دردشة مباشرة غير محدودة مع جميع القريبين</span></li>
                <li><i class="fas fa-check-circle" style="color: #fbbf24; margin-left: 6px;"></i> <span>تغيير موقعك الجغرافي لأي مكان في العالم</span></li>
                <li><i class="fas fa-check-circle" style="color: #fbbf24; margin-left: 6px;"></i> <span>شعار VIP ذهبي يظهر بجانب اسمك</span></li>
                <li><i class="fas fa-check-circle" style="color: #fbbf24; margin-left: 6px;"></i> <span>معرفة من زار بروفايلك وقام بحفظه</span></li>
            </ul>
            ${isUserVip ? `
                <div style="background: rgba(251, 191, 36, 0.12); border: 1px solid rgba(251, 191, 36, 0.3); border-radius: 12px; padding: 12px; color: #fbbf24; font-weight: bold; margin-bottom: 12px; font-size: 13.5px; text-align: center;">
                    <i class="fas fa-gem" style="margin-left: 6px;"></i> أنت عضو VIP نشط ومميز!
                </div>
                <button class="btn" style="width:100%; font-weight:800; background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.25); color: #f87171; padding: 12px; border-radius: 12px; cursor: pointer; transition: all 0.2s; font-family: inherit;" onclick="downgradeFromVIP()">
                    إلغاء الاشتراك التجريبي
                </button>
            ` : `
                <button class="btn btn-submit btn-vip-upgrade" style="width:100%; font-weight:800; background: linear-gradient(135deg, #e11d48, #f472b6); border:none; box-shadow: 0 4px 15px rgba(225, 29, 72, 0.4);" onclick="upgradeToVIP()">
                    اشترك الآن بـ 29.99 درهم / شهر (مجاناً تجريبي)
                </button>
            `}
        `;
        container.appendChild(vipCard);

        // إظهار بعض الأعضاء المميزين (VIP) كمثال أسفل البطاقة
        const vipHeader = document.createElement('h4');
        vipHeader.style.cssText = 'margin: 20px 5px 10px 0; font-size: 14px; color: #fbbf24; text-align: right; font-weight: 700;';
        vipHeader.innerHTML = '<i class="fas fa-gem" style="margin-left: 4px;"></i> أعضاء VIP نشطون الآن';
        container.appendChild(vipHeader);

        const list = document.createElement('div');
        list.className = 'users-list';

        // نختار 3 أعضاء ونضيف لهم شارة VIP
        const vipUsers = profiles.slice(0, 3);
        vipUsers.forEach((profile, index) => {
            // نضمن أن لديهم شارة VIP مفعلة
            profile.is_vip = true;
            const card = createUserCard(profile, index);
            card.addEventListener('click', () => openUserModal(profile));
            list.appendChild(card);
        });
        container.appendChild(list);
        return;
    }

    // حاوية تصفية النتائج
    const listContainer = document.createElement('div');
    listContainer.className = 'users-list-sub-container';
    container.appendChild(listContainer);

    // تحديث قيمة البحث والزر المساعد في الهيدر
    const headerSearchInput = document.getElementById('discovery-search-input');
    if (headerSearchInput) {
        headerSearchInput.value = searchFilterQuery;
    }
    const clearBtn = document.getElementById('clear-search-btn');
    if (clearBtn) {
        clearBtn.style.display = searchFilterQuery ? 'inline-block' : 'none';
    }

    // رسم القائمة المصفاة في الحاوية
    renderFilteredList(profiles, listContainer);
}

// دالة رسم القائمة المصفاة للبحث
function renderFilteredList(profiles, listContainer) {
    listContainer.innerHTML = '';

    const query = searchFilterQuery.trim().toLowerCase();
    let filtered = [...profiles];

    // فلترة الجنس أولاً
    if (currentGenderFilter !== 'all') {
        filtered = filtered.filter(p => p.gender === currentGenderFilter);
    }

    // فلترة المسافة
    if (currentDistanceFilter !== 10000 && currentUserProfile && currentUserProfile.latitude && currentUserProfile.longitude) {
        filtered = filtered.filter(p => {
            if (!p.latitude || !p.longitude) return false;
            const dist = calculateDistance(currentUserProfile.latitude, currentUserProfile.longitude, p.latitude, p.longitude);
            return dist !== null && dist <= currentDistanceFilter;
        });
    }

    // فلترة التوثيق
    if (requireVerifiedFilter) {
        filtered = filtered.filter(p => p.is_verified || p.is_vip);
    }

    if (query) {
        filtered = filtered.filter(p => {
            const name = (p.full_name || '').toLowerCase();
            const bio = (p.bio || '').toLowerCase();
            const residence = (p.residence || '').toLowerCase();
            const profession = (p.profession || '').toLowerCase();
            const userId = (p.user_id || '').toLowerCase();
            return userId.includes(query) || name.includes(query) || bio.includes(query) || residence.includes(query) || profession.includes(query);
        });
    }

    if (filtered.length === 0) {
        listContainer.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; padding:40px 20px; text-align:center;">
                <p style="color:var(--text-muted); font-size:13px;">لا توجد نتائج تطابق بحثك.</p>
            </div>
        `;
        return;
    }

    const list = document.createElement('div');
    list.className = 'users-list';

    filtered.forEach((profile, index) => {
        const card = createUserCard(profile, index);
        card.addEventListener('click', () => openUserModal(profile));
        list.appendChild(card);
    });

    listContainer.appendChild(list);
}

// === إنشاء بطاقة عضو واحد ===
function createUserCard(profile, index) {
    debugLog(`createUserCard: rendering card for ${profile.full_name || 'unnamed'} (${profile.user_id})`);
    const card = document.createElement('div');
    const genderClass = profile.gender === 'female' ? 'female' : 'male';
    card.className = `user-card ${genderClass} ${profile.is_vip ? 'vip-member-card' : ''}`;
    card.setAttribute('data-user-id', profile.user_id);
    card.style.animationDelay = `${index * 0.05}s`;
    card.style.animation = 'fadeSlideUp 0.4s ease forwards';
    card.style.opacity = '0';

    const age = calculateAge(profile.dob);
    const initial = (profile.full_name || '?').charAt(0).toUpperCase();
    const bio = profile.bio || 'Je suis libre pour chat! 💬';
    const isOnline = onlineUsers.has(profile.user_id);

    // حساب المسافة بدقة مع الأيقونة
    let distanceTextHTML = '';
    if (currentUserProfile && currentUserProfile.latitude && currentUserProfile.longitude && profile.latitude && profile.longitude) {
        const dist = calculateDistance(currentUserProfile.latitude, currentUserProfile.longitude, profile.latitude, profile.longitude);
        if (dist !== null) {
            const distValue = dist < 1 ? `${Math.round(dist * 1000)} m` : `${dist.toFixed(1)} km`;
            distanceTextHTML = `<span style="display:inline-flex; align-items:center; gap:3px;"><i class="fas fa-location-dot" style="color: #60a5fa; font-size:10px;"></i>${distValue}</span>`;
        }
    }

    const avatarContent = profile.avatar_url
        ? `<img src="${sanitizeUrl(profile.avatar_url)}" alt="${escapeHtml(profile.full_name || '')}" class="user-avatar" loading="lazy">`
        : initial;

    const lastSeenTime = profile.last_seen || profile.created_at;
    const statusText = isOnline
        ? '<span style="color:#22c55e; font-weight:700;">En ligne</span>'
        : formatRelativeTime(lastSeenTime);

    // محتوى الأفاتار: صورة أو حروف أولية
    const avatarInner = profile.avatar_url
        ? `<img src="${sanitizeUrl(profile.avatar_url)}" alt="${escapeHtml(profile.full_name || '')}" loading="lazy" decoding="async">`
        : `<div class="avatar-initials">${initial}</div>`;

    // نص المسافة
    const distBadgeHTML = distanceTextHTML
        ? `<span class="distance-badge">${distanceTextHTML}</span>`
        : `<span class="distance-badge"><i class="fas fa-location-dot"></i> ?</span>`;

    card.innerHTML = `
        <!-- قسم المعلومات: أفاتار + نص -->
        <div class="card-main">
            <div class="avatar-section">
                <div class="avatar-ring">
                    ${avatarInner}
                    ${isOnline ? '<span class="online-status"></span>' : ''}
                </div>
            </div>
            <div class="info-section">
                <div class="name-row" style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                    <h3>${escapeHtml(profile.full_name || 'Utilisateur')}</h3>
                    ${profile.is_verified ? '<i class="fas fa-check-circle" style="color: #3b82f6; font-size: 13px;" title="Vérifié"></i>' : ''}
                    <span class="age-tag">${age !== '-' ? age : '?'} <i class="${profile.gender === 'female' ? 'fas fa-venus' : 'fas fa-mars'}"></i></span>
                    ${profile.is_vip ? '<i class="fas fa-gem card-vip-icon" title="VIP" style="color:#fbbf24;font-size:13px;"></i>' : ''}
                </div>
                <p class="bio-text">${escapeHtml(bio)}</p>
                <div class="status-row" style="display:flex; align-items:center; justify-content:space-between; width:100%;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        ${distBadgeHTML}
                        <span class="time-ago ${isOnline ? 'online' : ''}" data-created-at="${profile.created_at}" data-last-seen="${lastSeenTime}">${statusText}</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:4px;">
                        ${profile.instagram ? `<a href="https://instagram.com/${escapeHtml(profile.instagram)}" target="_blank" class="social-badge instagram" title="Instagram" style="background:#e1306c; width:16px; height:16px; font-size:9px; color:white; display:inline-flex; align-items:center; justify-content:center; border-radius:50%;"><i class="fab fa-instagram"></i></a>` : ''}
                        ${profile.tiktok ? `<a href="https://tiktok.com/@${escapeHtml(profile.tiktok)}" target="_blank" class="social-badge tiktok" title="TikTok" style="background:#000000; border: 1px solid rgba(255,255,255,0.2); width:16px; height:16px; font-size:9px; color:white; display:inline-flex; align-items:center; justify-content:center; border-radius:50%;"><i class="fab fa-tiktok"></i></a>` : ''}
                    </div>
                </div>
            </div>
        </div>

        <!-- شبكة الأزرار 2×2 -->
        <div class="card-actions-grid">
            <button class="action-btn chat chat-btn" title="Chat"><i class="far fa-comment"></i></button>
            <button class="action-btn close ignore-btn" title="Ignorer"><i class="fas fa-times"></i></button>
            <button class="action-btn heart like-btn" title="J'aime"><i class="far fa-heart"></i></button>
            <button class="action-btn star favorite-btn" title="Favoris"><i class="far fa-star"></i></button>
        </div>
    `;

    // ربط الأحداث مع إيقاف انتشار النقر لئلا يفتح المودال العام عند الضغط على الأزرار
    const likeBtn = card.querySelector('.like-btn');
    if (likeBtn) {
        likeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const icon = likeBtn.querySelector('i');
            if (icon.classList.contains('far')) {
                icon.classList.remove('far');
                icon.classList.add('fas');
                likeBtn.classList.add('liked');

                // زيادة اللايك في قاعدة البيانات
                if (currentUser) {
                    sb.rpc('increment_profile_like', { target_id: profile.user_id })
                        .then(({ error }) => {
                            if (error) console.error("Error incrementing profile like:", error);
                        });
                }

                // إنشاء قلب طائر متحرك
                const rect = likeBtn.getBoundingClientRect();
                const flyingHeart = document.createElement('i');
                flyingHeart.className = 'fas fa-heart floating-heart-anim';
                flyingHeart.style.left = `${rect.left + rect.width / 2}px`;
                flyingHeart.style.top = `${rect.top}px`;
                document.body.appendChild(flyingHeart);
                setTimeout(() => flyingHeart.remove(), 1000);

                showToastNotification(
                    { name: profile.full_name, gender: profile.gender, avatar_url: profile.avatar_url, user_id: profile.user_id },
                    profile.full_name || 'Utilisateur',
                    "Vous avez envoyé un j'aime !",
                    'like'
                );
            } else {
                icon.classList.remove('fas');
                icon.classList.add('far');
                likeBtn.classList.remove('liked');

                // تقليل اللايك في قاعدة البيانات
                if (currentUser) {
                    sb.rpc('decrement_profile_like', { target_id: profile.user_id })
                        .then(({ error }) => {
                            if (error) console.error("Error decrementing profile like:", error);
                        });
                }
            }
        });
    }

    const chatBtn = card.querySelector('.chat-btn');
    if (chatBtn) {
        chatBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openChatWindow(profile);
        });
    }

    const ignoreBtn = card.querySelector('.ignore-btn');
    if (ignoreBtn) {
        ignoreBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (confirm(`Êtes-vous sûr de ne plus vouloir voir cet utilisateur (${profile.full_name || 'ce compte'}) ?`)) {
                await blockUser(profile.user_id);
            }
        });
    }

    const favoriteBtn = card.querySelector('.favorite-btn');
    if (favoriteBtn) {
        favoriteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const icon = favoriteBtn.querySelector('i');
            if (icon.classList.contains('far')) {
                icon.classList.remove('far');
                icon.classList.add('fas');
                favoriteBtn.classList.add('favorited');
            } else {
                icon.classList.remove('fas');
                icon.classList.add('far');
                favoriteBtn.classList.remove('favorited');
            }
        });
    }

    return card;
}

// === فتح نافذة تفاصيل العضو (Modal) ===
function openUserModal(profile) {
    // إزالة أي نافذة سابقة
    const oldModal = document.getElementById('user-detail-modal');
    if (oldModal) oldModal.remove();

    // زيادة عدد الزيارات بأمان في الخلفية (فقط إذا كان العضو ليس المستخدم الحالي)
    if (currentUser && profile.user_id !== currentUser.id) {
        sb.rpc('increment_profile_visit', { target_id: profile.user_id })
            .then(({ error }) => {
                if (error) console.error("Error incrementing profile visit:", error);
            });
    }

    const age = calculateAge(profile.dob);
    const genderClass = profile.gender === 'female' ? 'female' : 'male';
    const genderText = profile.gender === 'male' ? 'Homme' : profile.gender === 'female' ? 'Femme' : '-';
    const genderSymbol = profile.gender === 'female' ? '♀' : '♂';
    const initial = (profile.full_name || '?').charAt(0).toUpperCase();

    // حساب المسافة الحقيقية
    let distanceText = '';
    if (currentUserProfile && currentUserProfile.latitude && currentUserProfile.longitude && profile.latitude && profile.longitude) {
        const dist = calculateDistance(currentUserProfile.latitude, currentUserProfile.longitude, profile.latitude, profile.longitude);
        if (dist !== null) {
            if (dist < 1) {
                distanceText = `à ${Math.round(dist * 1000)} m`;
            } else {
                distanceText = `à ${dist.toFixed(1)} km`;
            }
        }
    }

    // بناء الصناديق الإضافية للبروفايل
    let extraBoxes = '';
    if (profile.height) {
        extraBoxes += `
            <div class="modal-detail-box">
                <span class="detail-label-modal"><i class="fas fa-arrows-alt-v" style="color:var(--color-primary); margin-right:4px;"></i>Taille</span>
                <span class="detail-value-modal">${escapeHtml(profile.height)}</span>
            </div>
        `;
    }
    if (profile.residence) {
        extraBoxes += `
            <div class="modal-detail-box">
                <span class="detail-label-modal"><i class="fas fa-home" style="color:var(--color-primary); margin-right:4px;"></i>Résidence</span>
                <span class="detail-value-modal">${escapeHtml(profile.residence)}</span>
            </div>
        `;
    }
    if (profile.profession) {
        extraBoxes += `
            <div class="modal-detail-box">
                <span class="detail-label-modal"><i class="fas fa-briefcase" style="color:var(--color-primary); margin-right:4px;"></i>Profession</span>
                <span class="detail-value-modal">${escapeHtml(profile.profession)}</span>
            </div>
        `;
    }
    if (profile.company) {
        extraBoxes += `
            <div class="modal-detail-box">
                <span class="detail-label-modal"><i class="fas fa-building" style="color:var(--color-primary); margin-right:4px;"></i>Entreprise</span>
                <span class="detail-value-modal">${escapeHtml(profile.company)}</span>
            </div>
        `;
    }
    if (profile.income) {
        extraBoxes += `
            <div class="modal-detail-box">
                <span class="detail-label-modal"><i class="fas fa-wallet" style="color:var(--color-primary); margin-right:4px;"></i>Revenu</span>
                <span class="detail-value-modal">${escapeHtml(profile.income)}</span>
            </div>
        `;
    }
    if (profile.body_type) {
        extraBoxes += `
            <div class="modal-detail-box">
                <span class="detail-label-modal"><i class="fas fa-child" style="color:var(--color-primary); margin-right:4px;"></i>Morphologie</span>
                <span class="detail-value-modal">${escapeHtml(profile.body_type)}</span>
            </div>
        `;
    }
    if (profile.ethnicity) {
        extraBoxes += `
            <div class="modal-detail-box">
                <span class="detail-label-modal"><i class="fas fa-globe" style="color:var(--color-primary); margin-right:4px;"></i>Origine</span>
                <span class="detail-value-modal">${escapeHtml(profile.ethnicity)}</span>
            </div>
        `;
    }
    if (profile.hair_color) {
        extraBoxes += `
            <div class="modal-detail-box">
                <span class="detail-label-modal"><i class="fas fa-cut" style="color:var(--color-primary); margin-right:4px;"></i>Cheveux</span>
                <span class="detail-value-modal">${escapeHtml(profile.hair_color)}</span>
            </div>
        `;
    }

    // بناء معرض الصور أو الخلفية البديلة لبروفايل العضو
    const modalGalleryList = (profile.gallery && Array.isArray(profile.gallery)) ? profile.gallery.filter(Boolean) : [];
    let modalBannerHtml = '';
    if (modalGalleryList.length > 0) {
        let slides = '';
        let dots = '';
        modalGalleryList.forEach((url, i) => {
            slides += `
                <div class="carousel-slide">
                    <img src="${sanitizeUrl(url)}" style="width:100%; height:100%; object-fit:cover; filter: brightness(0.75);" class="gallery-img-clickable" data-gallery-index="${i}" loading="lazy">
                </div>
            `;
            dots += `<div class="carousel-dot ${i === 0 ? 'active' : ''}"></div>`;
        });
        modalBannerHtml = `
            <div class="gallery-carousel" id="modal-gallery-carousel">
                <div class="carousel-track">
                    ${slides}
                </div>
                <div class="carousel-indicators">
                    ${dots}
                </div>
            </div>
        `;
    } else {
        modalBannerHtml = profile.avatar_url 
            ? `<img src="${sanitizeUrl(profile.avatar_url)}" class="blurred-bg-fallback clickable-fallback-bg" loading="lazy">`
            : '';
    }

    const modal = document.createElement('div');
    modal.id = 'user-detail-modal';
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.7); display:flex; align-items:flex-end; justify-content:center; z-index:1300; animation:fadeInModal 0.3s ease;';

    modal.innerHTML = `
        <div class="user-modal-card" style="width:100%; max-width:420px; max-height:90vh; border-radius:24px 24px 0 0; padding:0; overflow-y:auto; overflow-x:hidden; animation:slideUpModal 0.35s ease; position:relative; background:#1c1c1e; display:flex; flex-direction:column;">
            
            <button id="close-user-modal" style="position:absolute; top:16px; left:16px; background:rgba(0,0,0,0.5); border:none; color:white; width:36px; height:36px; border-radius:50%; cursor:pointer; font-size:18px; z-index:10; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(10px);">
                <i class="fas fa-times"></i>
            </button>

            <!-- الصورة الكبيرة -->
            <div style="width:100%; height:380px; position:relative; background: ${profile.gender === 'female' ? 'linear-gradient(135deg, #f97316, #ec4899)' : 'linear-gradient(135deg, #0ea5e9, #6366f1)'}; border-radius:24px 24px 0 0; overflow:hidden;">
                <!-- معرض الصور أو الخلفية -->
                ${modalBannerHtml}
                
                <!-- دائرة الصورة المركزية مثل القصص (Stories) -->
                <div style="position:absolute; top:45%; left:50%; transform:translate(-50%, -50%); z-index:5; width:140px; height:140px; border-radius:50%; border:4px solid ${profile.gender === 'female' ? '#ff3399' : '#1a75ff'}; box-shadow:0 0 25px rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; background:#1c1c1e; overflow:hidden;">
                    ${profile.avatar_url ? `<img src="${sanitizeUrl(profile.avatar_url)}" id="modal-avatar-img" style="width:100%; height:100%; object-fit:cover; cursor:pointer;" loading="lazy">` : `<span style="font-size:60px; color:white; font-weight:bold;">${initial}</span>`}
                </div>

                <!-- طبقة التدرج السفلى لاسم المستخدم -->
                <div style="position:absolute; bottom:0; left:0; right:0; height:150px; background:linear-gradient(to top, #1c1c1e, transparent); padding:20px; display:flex; flex-direction:column; justify-content:flex-end; z-index:2;">
                    <div style="display:flex; align-items:center; gap:8px;" dir="ltr">
                        <h2 style="margin:0; font-size:26px; font-weight:800; color:white; line-height:1.2;">
                            ${escapeHtml(profile.full_name || 'Utilisateur')}
                        </h2>
                        ${profile.is_verified ? '<i class="fas fa-check-circle" style="color: #3b82f6; font-size: 20px;" title="Vérifié"></i>' : ''}
                        <span style="font-size:22px; font-weight:400; color:#e4e4e7; margin-left:6px;">${age !== '-' ? age : ''}</span>
                        ${profile.is_vip ? '<i class="fas fa-gem" style="color: #fbbf24; font-size: 18px;" title="Membre VIP"></i>' : ''}
                    </div>
                    <div style="display:flex; align-items:center; gap:10px; margin-top:6px;">
                        <span class="gender-age-pill ${genderClass}" style="box-shadow:none; padding:2px 8px; font-size:11px;">
                            <i class="${profile.gender === 'female' ? 'fas fa-venus' : 'fas fa-mars'}"></i> ${genderText}
                        </span>
                        ${distanceText ? `<span style="color:#a1a1aa; font-size:13px; display:flex; align-items:center; gap:4px;"><i class="fas fa-location-dot" style="color:var(--color-primary);"></i>${distanceText}</span>` : ''}
                        ${profile.instagram ? `<a href="https://instagram.com/${escapeHtml(profile.instagram)}" target="_blank" class="social-badge instagram" title="Instagram" style="background:#e1306c; width:18px; height:18px; font-size:10px; color:white; display:inline-flex; align-items:center; justify-content:center; border-radius:50%; margin-left:4px;"><i class="fab fa-instagram"></i></a>` : ''}
                        ${profile.tiktok ? `<a href="https://tiktok.com/@${escapeHtml(profile.tiktok)}" target="_blank" class="social-badge tiktok" title="TikTok" style="background:#000000; border: 1px solid rgba(255,255,255,0.2); width:18px; height:18px; font-size:10px; color:white; display:inline-flex; align-items:center; justify-content:center; border-radius:50%; margin-left:4px;"><i class="fab fa-tiktok"></i></a>` : ''}
                    </div>
                </div>
            </div>

            <!-- التفاصيل السفلية -->
            <div style="padding:20px;">
                <!-- شريط إحصائيات التفاعل -->
                <div class="profile-stats-bar" style="margin-top: 0; margin-bottom: 20px;">
                    <div class="profile-stat-col friends">
                        <span class="stat-num" id="modal-stat-friends">${profile.friends_count || 0}</span>
                        <span class="stat-label"><i class="fas fa-user-group"></i> Amis</span>
                    </div>
                    <div class="profile-stat-divider"></div>
                    <div class="profile-stat-col visits">
                        <span class="stat-num" id="modal-stat-visits">${(profile.visits_count || 0) + 1}</span>
                        <span class="stat-label"><i class="fas fa-eye"></i> Visites</span>
                    </div>
                    <div class="profile-stat-divider"></div>
                    <div class="profile-stat-col likes">
                        <span class="stat-num" id="modal-stat-likes">${profile.likes_count || 0}</span>
                        <span class="stat-label"><i class="fas fa-heart"></i> Likes</span>
                    </div>
                </div>

                <div class="modal-details-grid">
                    <div class="modal-detail-box">
                    <span class="detail-label-modal">Genre</span>
                    <span class="detail-value-modal">${genderText}</span>
                </div>
                <div class="modal-detail-box">
                    <span class="detail-label-modal">Âge</span>
                    <span class="detail-value-modal">${age !== '-' ? age + ' ans' : '-'}</span>
                </div>
                ${extraBoxes}
            </div>
            <div class="modal-bio-box">
                <h4><i class="fas fa-comment-dots" style="margin-right: 6px;"></i> À propos de moi</h4>
                <p>${escapeHtml(profile.bio || "Cet utilisateur n'a pas encore rédigé de biographie.")}</p>
            </div>
            <button class="btn-chat-start" id="btn-start-chat">
                <i class="fas fa-paper-plane"></i>
                Démarrer un chat
            </button>
            <div class="modal-action-row">
                <button class="btn-modal-action" id="btn-modal-block">
                    <i class="fas fa-ban"></i> Bloquer
                </button>
                <button class="btn-modal-action danger" id="btn-modal-report">
                    <i class="fas fa-flag"></i> Signaler
                </button>
            </div>
            </div> <!-- نهاية حاوية التفاصيل -->
        </div>
    `;

    document.body.appendChild(modal);

    // تهيئة الكاروسيل لمعرض صور العضو
    const modalCarouselEl = document.getElementById('modal-gallery-carousel');
    if (modalCarouselEl) {
        initProfileCarousel(modalCarouselEl);
    }

    // إعداد معرض الصور المعروض في الـ Lightbox للعضو
    const modalLightboxPhotos = [];
    if (profile.avatar_url) modalLightboxPhotos.push(profile.avatar_url);
    modalGalleryList.forEach(url => modalLightboxPhotos.push(url));

    // عند الضغط على الأفاتار الدائري
    const modalAvatarImg = document.getElementById('modal-avatar-img');
    if (modalAvatarImg && modalLightboxPhotos.length > 0) {
        modalAvatarImg.addEventListener('click', (e) => {
            e.stopPropagation();
            openLightbox(modalLightboxPhotos, 0);
        });
    }

    // عند الضغط على صور المعرض في الخلفية
    if (modalCarouselEl && modalLightboxPhotos.length > 0) {
        const clickableGalleryImgs = modalCarouselEl.querySelectorAll('.gallery-img-clickable');
        clickableGalleryImgs.forEach(img => {
            img.addEventListener('click', (e) => {
                e.stopPropagation();
                const gIdx = parseInt(img.getAttribute('data-gallery-index'), 10);
                const startIndex = profile.avatar_url ? gIdx + 1 : gIdx;
                openLightbox(modalLightboxPhotos, startIndex);
            });
        });
    }

    // عند الضغط على الخلفية البديلة المشوشة
    const modalFallbackBg = modal.querySelector('.clickable-fallback-bg');
    if (modalFallbackBg && modalLightboxPhotos.length > 0) {
        modalFallbackBg.style.cursor = 'pointer';
        modalFallbackBg.addEventListener('click', (e) => {
            e.stopPropagation();
            openLightbox(modalLightboxPhotos, 0);
        });
    }

    // إغلاق بالنقر على الخلفية أو زر الإغلاق
    document.getElementById('close-user-modal').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });

    // زر بدء المحادثة
    document.getElementById('btn-start-chat').addEventListener('click', () => {
        openChatWindow(profile);
    });

    // زر الحظر
    document.getElementById('btn-modal-block').addEventListener('click', async () => {
        if (confirm(`Voulez-vous bloquer ${profile.full_name || 'cet utilisateur'} ?\nIl ne figurera plus dans votre liste et vous ne pourrez plus communiquer avec lui.`)) {
            await blockUser(profile.user_id);
            modal.remove();
        }
    });

    // زر الإبلاغ
    document.getElementById('btn-modal-report').addEventListener('click', () => {
        modal.remove();
        openReportModal(profile);
    });
}

// === نظام المحادثات والدردشة المباشرة (Chat Logic) ===

// 1. فتح نافذة الشات
async function openChatWindow(receiverProfile) {
    if (!currentUser) {
        alert("يرجى تسجيل الدخول أولاً!");
        return;
    }

    // إغلاق المودال الخاص بالتفاصيل إذا كان مفتوحاً
    const profileModal = document.getElementById('user-detail-modal');
    if (profileModal) profileModal.remove();

    activeChatUserId = receiverProfile.user_id;
    activeChatUserProfile = receiverProfile;

    // تحديث بيانات الترويسة في الشات
    const chatNameEl = document.getElementById('chat-user-name');
    const chatAvatarEl = document.getElementById('chat-user-avatar');
    const chatStatusEl = document.getElementById('chat-user-status');
    const chatWindow = document.getElementById('chat-window');

    if (chatNameEl) chatNameEl.textContent = receiverProfile.full_name || 'Utilisateur';
    if (chatAvatarEl) {
        const initial = (receiverProfile.full_name || '?').charAt(0).toUpperCase();
        const genderClass = receiverProfile.gender === 'female' ? 'female' : 'male';
        chatAvatarEl.className = `chat-user-avatar ${genderClass}`;
        if (receiverProfile.avatar_url) {
            chatAvatarEl.innerHTML = `<img src="${sanitizeUrl(receiverProfile.avatar_url)}" alt="" loading="lazy">`;
        } else {
            chatAvatarEl.textContent = initial;
        }
    }
    if (chatStatusEl) {
        const isOnline = onlineUsers.has(receiverProfile.user_id);
        if (isOnline) {
            chatStatusEl.textContent = 'En ligne';
            chatStatusEl.style.color = '#22c55e';
            lastSeenTimeMap.set(receiverProfile.user_id, new Date().toISOString());
        } else {
            const lastSeen = lastSeenTimeMap.get(receiverProfile.user_id) || receiverProfile.last_seen || receiverProfile.created_at;
            chatStatusEl.textContent = lastSeen ? `Dernière connexion: ${formatRelativeTime(lastSeen)}` : 'Hors ligne';
            chatStatusEl.style.color = 'var(--text-muted)';
        }
    }

    // إظهار نافذة الشات
    if (chatWindow) chatWindow.classList.add('active');

    // تفريغ الرسائل القديمة وعرض مؤشر تحميل
    const messagesContainer = document.getElementById('chat-messages-container');
    if (messagesContainer) {
        messagesContainer.innerHTML = `
            <div style="display:flex; justify-content:center; align-items:center; height:100%; color:var(--text-muted);">
                <i class="fas fa-spinner fa-spin" style="margin-right:8px;"></i> Chargement des messages...
            </div>
        `;
    }

    // تعليم كل الرسائل كمقروءة أولاً قبل التحميل
    await markAllMessagesAsRead(receiverProfile.user_id);

    // تحميل الرسائل السابقة
    await loadChatMessages();

    // الاشتراك في الوقت الحقيقي للميساجات الجديدة
    subscribeToMessages();
}

// 2. إغلاق نافذة الشات
function closeChatWindow() {
    const chatWindow = document.getElementById('chat-window');
    if (chatWindow) chatWindow.classList.remove('active');

    activeChatUserId = null;
    activeChatUserProfile = null;

    // إزالة الاشتراك لتفادي استهلاك الموارد
    if (chatSubscription) {
        sb.removeChannel(chatSubscription);
        chatSubscription = null;
    }
}

// 3. جلب رسائل المحادثة من قاعدة البيانات
async function loadChatMessages() {
    const container = document.getElementById('chat-messages-container');
    if (!container || !currentUser || !activeChatUserId) return;

    try {
        const { data: messages, error } = await sb
            .from('messages')
            .select('*')
            .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${activeChatUserId}),and(sender_id.eq.${activeChatUserId},receiver_id.eq.${currentUser.id})`)
            .order('created_at', { ascending: true });

        if (error) throw error;

        container.innerHTML = '';
        lastMessageDate = null; // إعادة تعيين فاصل التاريخ للمحادثة الجديدة
        if (messages && messages.length > 0) {
            messages.forEach(msg => {
                appendMessageBubble(msg);
            });
        } else {
            container.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:var(--text-muted); gap:8px;">
                    <i class="far fa-comments" style="font-size:24px; opacity:0.5;"></i>
                    <p style="font-size:13px;">Aucun message. Démarrer la conversation maintenant !</p>
                </div>
            `;
        }

        // النزول لأسفل الشات تلقائياً
        container.scrollTop = container.scrollHeight;

    } catch (err) {
        console.error("خطأ أثناء جلب الرسائل:", err);
        container.innerHTML = `<p style="text-align:center; color:var(--text-muted); padding:20px;">Échec du chargement des messages.</p>`;
    }
}

// 4. إرسال رسالة جديدة (مع أنيميشن احترافي)
async function sendChatMessage() {
    const inputEl = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send-btn');
    if (!inputEl || !currentUser || !activeChatUserId) return;

    const text = inputEl.value.trim();
    if (!text) return;

    // مسح الحقل فوراً لتوفير تجربة مستخدم سريعة
    inputEl.value = '';

    // إخفاء زر الإرسال وإظهار زر الميكروفون
    const audioBtn = document.getElementById('chat-audio-btn');
    if (sendBtn) sendBtn.style.display = 'none';
    if (audioBtn) audioBtn.style.display = 'flex';

    // أنيميشن زر الإرسال
    if (sendBtn) {
        sendBtn.style.animation = 'sendPulse 0.4s ease';
        sendBtn.style.transform = 'scale(0.85)';
        setTimeout(() => {
            sendBtn.style.transform = 'scale(1)';
            sendBtn.style.animation = '';
        }, 400);
    }

    try {
        const { error } = await sb
            .from('messages')
            .insert([{
                sender_id: currentUser.id,
                receiver_id: activeChatUserId,
                content: text
            }]);

        if (error) throw error;

    } catch (err) {
        console.error("خطأ أثناء إرسال الرسالة:", err);
        alert("Échec de l'envoi du message : " + err.message);
    }
}

// 5. الاشتراك في الرسائل الفورية (Realtime Subscription)
function subscribeToMessages() {
    if (chatSubscription) return; // مشترك بالفعل

    chatSubscription = sb.channel('messages-realtime')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'messages'
        }, payload => {
            const newMsg = payload.new;

            // هل الرسالة تخص الشات المفتوح حالياً؟
            if (activeChatUserId && (
                (newMsg.sender_id === currentUser.id && newMsg.receiver_id === activeChatUserId) ||
                (newMsg.sender_id === activeChatUserId && newMsg.receiver_id === currentUser.id)
            )) {
                // إزالة رسالة "لا توجد رسائل سابقة" إذا كانت موجودة
                const container = document.getElementById('chat-messages-container');
                if (container && container.querySelector('.far')) {
                    container.innerHTML = '';
                }
                appendMessageBubble(newMsg);
            }
        })
        .subscribe();
}

// 6. إضافة فقاعة رسالة (SayHi Style - مع avatar + فاصل تاريخ)
let lastMessageDate = null; // لتتبع فاصل التاريخ

function appendMessageBubble(msg) {
    const container = document.getElementById('chat-messages-container');
    if (!container) return;

    const isMyMsg = msg.sender_id === currentUser.id;
    const msgType = msg.type || 'text';

    // تنسيق الوقت
    const msgDate = new Date(msg.created_at);
    const timeStr = msgDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = msgDate.toLocaleDateString('fr-FR');

    // === فاصل التاريخ إذا تبدل اليوم ===
    if (lastMessageDate !== dateStr) {
        const divider = document.createElement('div');
        divider.className = 'chat-date-divider';
        divider.innerHTML = `<span>${dateStr}</span>`;
        container.appendChild(divider);
        lastMessageDate = dateStr;
    }

    // علامة القراءة (بحال SayHi: دائرة خضراء "lu")
    const readBadge = isMyMsg ? '<span class="msg-read-badge">lu</span>' : '';

    // === إنشاء صف الرسالة (avatar + فقاعة) ===
    const row = document.createElement('div');
    row.className = `msg-row ${isMyMsg ? 'sent' : 'received'}`;

    // تحديد بيانات الأفاتار
    let avatarInitial, avatarGender;
    if (isMyMsg) {
        avatarInitial = currentUserProfile ? (currentUserProfile.full_name || 'M').charAt(0).toUpperCase() : 'M';
        avatarGender = currentUserProfile ? (currentUserProfile.gender === 'female' ? 'female' : 'male') : 'male';
    } else {
        // بيانات المستخدم الآخر من الترويسة
        const chatNameEl = document.getElementById('chat-user-name');
        avatarInitial = chatNameEl ? (chatNameEl.textContent || '?').charAt(0).toUpperCase() : '?';
        avatarGender = document.querySelector('.chat-user-avatar')?.classList.contains('female') ? 'female' : 'male';
    }

    // الفقاعة
    const bubble = document.createElement('div');

    // === رسالة صورة ===
    if (msgType === 'image' && msg.media_url) {
        bubble.className = `msg-bubble ${isMyMsg ? 'sent' : 'received'} image-msg`;
        bubble.innerHTML = `
            <img src="${sanitizeUrl(msg.media_url)}" alt="image" loading="lazy">
            <span class="msg-time">${timeStr} ${readBadge}</span>
        `;
        bubble.querySelector('img').addEventListener('click', () => {
            openImageLightbox(sanitizeUrl(msg.media_url));
        });

        // === رسالة صوتية ===
    } else if (msgType === 'audio' && msg.media_url) {
        bubble.className = `msg-bubble ${isMyMsg ? 'sent' : 'received'} audio-msg`;
        let waveBars = '';
        for (let i = 0; i < 20; i++) {
            const h = Math.floor(Math.random() * 20) + 6;
            waveBars += `<div class="wave-bar" style="height:${h}px;" data-index="${i}"></div>`;
        }
        const durationMatch = msg.content.match(/(\d{2}:\d{2})/);
        const durationText = durationMatch ? durationMatch[1] : '00:00';
        bubble.innerHTML = `
            <div class="audio-player-wrapper">
                <button class="audio-play-btn" data-url="${sanitizeUrl(msg.media_url)}" data-playing="false">
                    <i class="fas fa-play"></i>
                </button>
                <div class="audio-waveform">${waveBars}</div>
                <span class="audio-duration">${durationText}</span>
            </div>
            <span class="msg-time">${timeStr} ${readBadge}</span>
        `;
        const playBtn = bubble.querySelector('.audio-play-btn');
        playBtn.addEventListener('click', () => {
            playAudioMessage(playBtn, sanitizeUrl(msg.media_url), bubble);
        });

        // === رسالة نصية ===
    } else {
        bubble.className = `msg-bubble ${isMyMsg ? 'sent' : 'received'}`;
        bubble.innerHTML = `
            <span class="msg-text">${escapeHtml(msg.content)}</span>
            <span class="msg-time">${timeStr} ${readBadge}</span>
        `;
    }

    // تجميع الصف: avatar + فقاعة
    row.innerHTML = `<div class="msg-avatar ${avatarGender}">${avatarInitial}</div>`;
    row.appendChild(bubble);

    container.appendChild(row);
    container.scrollTop = container.scrollHeight;
}

// مشغل الأوديو المخصص مع تأثير الموجات
let currentAudioPlayer = null;

function playAudioMessage(playBtn, audioUrl, bubble) {
    const icon = playBtn.querySelector('i');
    const isPlaying = playBtn.getAttribute('data-playing') === 'true';
    const waveBars = bubble.querySelectorAll('.wave-bar');
    const durationEl = bubble.querySelector('.audio-duration');

    // إذا كان يشتغل - أوقفه
    if (isPlaying) {
        if (currentAudioPlayer) {
            currentAudioPlayer.pause();
            currentAudioPlayer = null;
        }
        icon.className = 'fas fa-play';
        playBtn.setAttribute('data-playing', 'false');
        waveBars.forEach(bar => bar.classList.remove('active'));
        return;
    }

    // أوقف أي تسجيل آخر يشتغل
    if (currentAudioPlayer) {
        currentAudioPlayer.pause();
        // إعادة الأيقونة السابقة
        document.querySelectorAll('.audio-play-btn[data-playing="true"]').forEach(btn => {
            btn.querySelector('i').className = 'fas fa-play';
            btn.setAttribute('data-playing', 'false');
        });
        document.querySelectorAll('.wave-bar.active').forEach(bar => bar.classList.remove('active'));
    }

    // تشغيل الأوديو
    const audio = new Audio(audioUrl);
    currentAudioPlayer = audio;
    icon.className = 'fas fa-pause';
    playBtn.setAttribute('data-playing', 'true');

    audio.play().catch(err => {
        console.error('فشل تشغيل الأوديو:', err);
        icon.className = 'fas fa-play';
        playBtn.setAttribute('data-playing', 'false');
    });

    // تأثير الموجات أثناء التشغيل
    let waveInterval = setInterval(() => {
        if (!audio.paused) {
            const progress = audio.currentTime / (audio.duration || 1);
            const activeIndex = Math.floor(progress * waveBars.length);
            waveBars.forEach((bar, i) => {
                bar.classList.toggle('active', i <= activeIndex);
            });

            // تحديث الوقت المتبقي
            const remaining = Math.floor(audio.duration - audio.currentTime);
            if (!isNaN(remaining) && durationEl) {
                const mins = Math.floor(remaining / 60).toString().padStart(2, '0');
                const secs = (remaining % 60).toString().padStart(2, '0');
                durationEl.textContent = `${mins}:${secs}`;
            }
        }
    }, 100);

    audio.onended = () => {
        clearInterval(waveInterval);
        icon.className = 'fas fa-play';
        playBtn.setAttribute('data-playing', 'false');
        waveBars.forEach(bar => bar.classList.remove('active'));
        currentAudioPlayer = null;
    };

    audio.onpause = () => {
        clearInterval(waveInterval);
    };
}

// دالة مساعدة لتفادي حقن كود خبيث في الرسائل
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const str = String(text);
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return str.replace(/[&<>"']/g, function (m) { return map[m]; });
}

// 7. جلب قائمة المحادثات النشطة (Chats Tab)
async function loadActiveChats() {
    const container = document.getElementById('chats-list-container');
    if (!container || !currentUser) return;

    container.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; padding:40px 0; gap:12px;">
            <div class="loading-spinner"></div>
            <p style="color:var(--text-muted); font-size:13px;">Chargement des discussions...</p>
        </div>
    `;

    try {
        // جلب الرسائل التي يشارك فيها المستخدم الحالي
        const { data: messages, error } = await sb
            .from('messages')
            .select('sender_id, receiver_id, content, created_at')
            .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!messages || messages.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:50px 20px; text-align:center;">
                    <i class="fas fa-comments" style="font-size:40px; color:var(--text-muted); opacity:0.4; margin-bottom:12px;"></i>
                    <p style="color:var(--text-muted); font-size:14px;">Aucune discussion active pour le moment.<br>Commencez à discuter avec des personnes à proximité !</p>
                </div>
            `;
            return;
        }

        // استخراج قائمة المستخدمين الفريدين وآخر رسالة + إحصائيات
        const chatPartnersMap = new Map();
        messages.forEach(msg => {
            const partnerId = msg.sender_id === currentUser.id ? msg.receiver_id : msg.sender_id;
            if (partnerId === currentUser.id) return;
            if (!chatPartnersMap.has(partnerId)) {
                chatPartnersMap.set(partnerId, {
                    content: msg.content,
                    created_at: msg.created_at,
                    time: new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    sentCount: 0,
                    receivedCount: 0
                });
            }
            const entry = chatPartnersMap.get(partnerId);
            if (msg.sender_id === currentUser.id) {
                entry.sentCount = (entry.sentCount || 0) + 1;
            } else {
                entry.receivedCount = (entry.receivedCount || 0) + 1;
            }
        });

        const partnerIds = Array.from(chatPartnersMap.keys()).filter(id => !blockedUserIds.has(id));

        if (partnerIds.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:50px 20px; text-align:center;">
                    <i class="fas fa-comments" style="font-size:40px; color:var(--text-muted); opacity:0.4; margin-bottom:12px;"></i>
                    <p style="color:var(--text-muted); font-size:14px;">Aucune discussion active pour le moment.<br>Commencez à discuter avec des personnes à proximité !</p>
                </div>
            `;
            return;
        }

        // جلب الملفات الشخصية
        const { data: profiles, error: profileErr } = await sb
            .from('profiles')
            .select('*')
            .in('user_id', partnerIds);

        if (profileErr) throw profileErr;

        // جلب عدد الرسائل غير المقروءة
        const { data: unreadData } = await sb
            .from('messages')
            .select('sender_id')
            .eq('receiver_id', currentUser.id)
            .eq('is_read', false)
            .in('sender_id', partnerIds);

        const unreadCountMap = new Map();
        if (unreadData) {
            unreadData.forEach(row => {
                unreadCountMap.set(row.sender_id, (unreadCountMap.get(row.sender_id) || 0) + 1);
            });
        }

        container.innerHTML = '';

        if (profiles && profiles.length > 0) {
            const uniqueProfiles = [];
            const seenUserIds = new Set();
            profiles.forEach(p => {
                if (p.last_seen && !lastSeenTimeMap.has(p.user_id)) {
                    lastSeenTimeMap.set(p.user_id, p.last_seen);
                }
                if (!seenUserIds.has(p.user_id)) {
                    seenUserIds.add(p.user_id);
                    uniqueProfiles.push(p);
                }
            });

            // === Update Global App Header Title ===
            const headerTitleCount = document.getElementById('header-chats-count');
            if (headerTitleCount) {
                headerTitleCount.textContent = `${uniqueProfiles.length} conversation${uniqueProfiles.length !== 1 ? 's' : ''}`;
            } else {
                const headerTitle = document.getElementById('header-title');
                if (headerTitle) {
                    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
                    const titleColor = isLight ? '#111827' : '#ffffff';
                    headerTitle.innerHTML = `
                        <div class="chats-section-title-block" style="text-align: left; display: flex; flex-direction: column; gap: 2px;">
                            <h2 class="chats-section-title" style="color: ${titleColor}; font-size: 26px; font-weight: 800; margin: 0; line-height: 1.1;">Chats</h2>
                            <span id="header-chats-count" class="chats-section-count" style="font-size: 13px; font-weight: 600; color: var(--text-muted); opacity: 0.8;">${uniqueProfiles.length} conversation${uniqueProfiles.length !== 1 ? 's' : ''}</span>
                        </div>
                    `;
                }
            }

            // === بطاقة تحتوي على كل الـ items ===
            const listCard = document.createElement('div');
            listCard.className = 'chats-list-card';
            container.appendChild(listCard);

            uniqueProfiles.forEach((profile, index) => {
                const lastChat = chatPartnersMap.get(profile.user_id);
                const initial = (profile.full_name || '?').charAt(0).toUpperCase();
                const genderClass = profile.gender === 'female' ? 'female' : 'male';
                const unreadCount = unreadCountMap.get(profile.user_id) || 0;
                const hasUnread = unreadCount > 0;

                const item = document.createElement('div');
                item.className = `chat-item ${genderClass}${hasUnread ? ' chat-item-unread' : ''}`;
                item.setAttribute('data-user-id', profile.user_id);

                const isOnline = onlineUsers.has(profile.user_id);
                const age = calculateAge(profile.dob);

                // حساب الوقت منذ آخر رسالة بالدقائق
                const lastMsgDate = lastChat.created_at ? new Date(lastChat.created_at) : null;
                let timeBadgeText = '0m';
                if (lastMsgDate) {
                    const diffMs = Date.now() - lastMsgDate.getTime();
                    const diffMins = Math.floor(diffMs / 60000);
                    const diffHrs = Math.floor(diffMins / 60);
                    if (diffMins < 60) {
                        timeBadgeText = `${diffMins}m`;
                    } else if (diffHrs < 24) {
                        timeBadgeText = `${diffHrs}h`;
                    } else {
                        timeBadgeText = `${Math.floor(diffHrs / 24)}j`;
                    }
                }

                // حساب المسافة (km)
                let distBadgeHtml = '';
                if (currentUserProfile && currentUserProfile.latitude && currentUserProfile.longitude && profile.latitude && profile.longitude) {
                    const dist = calculateDistance(
                        currentUserProfile.latitude, currentUserProfile.longitude,
                        profile.latitude, profile.longitude
                    );
                    if (dist !== null) {
                        const distValue = dist < 1
                            ? `${Math.round(dist * 1000)}m`
                            : `${dist.toFixed(1)}km`;
                        distBadgeHtml = `<span class="chat-stat-badge chat-stat-km ${genderClass}"><i class="fas fa-location-dot"></i>${distValue}</span>`;
                    }
                }

                // شارة الجنس والعمر
                const isFemale = profile.gender === 'female';
                const genderIcon = isFemale ? 'fa-venus' : 'fa-mars';
                const ageDisplay = age !== '-' ? age : '?';

                // نص الوقت اليميني
                const lastSeenTime = profile.last_seen || profile.created_at;
                const relativeTime = formatRelativeTime(lastSeenTime);
                const timeDisplay = isOnline
                    ? '<span class="chat-item-online-text">En ligne</span>'
                    : relativeTime;

                item.innerHTML = `
                    <div class="chat-item-left-border ${genderClass}"></div>
                    <div class="chat-item-avatar-wrapper" style="position: relative; flex-shrink: 0;">
                        <div class="chat-item-avatar ${genderClass}">
                            ${profile.avatar_url ? `<img src="${sanitizeUrl(profile.avatar_url)}" alt="" loading="lazy">` : initial}
                        </div>
                        ${isOnline ? '<span class="online-dot"></span>' : ''}
                    </div>
                    <div class="chat-item-details">
                        <div class="chat-item-name-row">
                            <span class="chat-item-name${hasUnread ? ' chat-item-name-bold' : ''}">
                                ${escapeHtml(profile.full_name || 'Utilisateur')}
                                ${profile.is_vip ? ' <i class="fas fa-gem" style="color: #fbbf24; font-size: 10px;" title="VIP"></i>' : ''}
                            </span>
                            <span class="chat-item-time-right">${timeDisplay}</span>
                        </div>
                        <div class="chat-item-badge-row">
                            <span class="chat-stat-badge chat-stat-gender ${genderClass}">
                                <i class="fas ${genderIcon}"></i>
                                ${ageDisplay}
                            </span>
                            ${distBadgeHtml}
                        </div>
                        <p class="chat-item-lastmsg${hasUnread ? ' chat-item-lastmsg-unread' : ''}">${escapeHtml(lastChat.content)}</p>
                    </div>
                    <div class="chat-item-chevron">
                        ${hasUnread ? `<span class="chat-item-unread-badge">${unreadCount > 99 ? '99+' : unreadCount}</span>` : ''}
                        <i class="fas fa-chevron-right chat-item-arrow"></i>
                    </div>
                `;

                item.addEventListener('click', () => {
                    openChatWindow(profile);
                });

                listCard.appendChild(item);
            });
        } else {
            container.innerHTML = `
                <div class="empty-state" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:50px 20px; text-align:center;">
                    <i class="fas fa-comments" style="font-size:40px; color:var(--text-muted); opacity:0.4; margin-bottom:12px;"></i>
                    <p style="color:var(--text-muted); font-size:14px;">Aucune discussion active pour le moment.<br>Commencez à discuter avec des personnes à proximité !</p>
                </div>
            `;
        }

    } catch (err) {
        console.error("خطأ أثناء جلب قائمة المحادثات:", err);
        container.innerHTML = `<p style="text-align:center; color:var(--text-muted); padding:20px;">Échec du chargement des discussions.</p>`;
    }
}

// === CSS ديال الرسائل غير المقروءة ===
(function injectUnreadStyles() {
    const style = document.createElement('style');
    style.textContent = `
        /* خلفية حمراء خفيفة للمحادثة اللي فيها رسائل جديدة */
        .chat-item.chat-item-unread {
            background: rgba(239, 68, 68, 0.08) !important;
            border-left: 3px solid #ef4444 !important;
        }
        /* اسم المرسل بولد */
        .chat-item-name.chat-item-name-bold {
            font-weight: 800 !important;
            color: #fff !important;
        }
        /* آخر رسالة بلون أبيض أكثر وضوحاً */
        .chat-item-lastmsg.chat-item-lastmsg-unread {
            color: rgba(255,255,255,0.85) !important;
            font-weight: 600 !important;
        }
        /* شارة عدد الرسائل الحمراء */
        .chat-item-unread-badge {
            background: #ef4444;
            color: #fff;
            font-size: 11px;
            font-weight: 800;
            min-width: 20px;
            height: 20px;
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0 5px;
            box-shadow: 0 2px 8px rgba(239,68,68,0.5);
        }
        /* شارة تبويب Chats بالأحمر — نقطة صغيرة فوق الأيقونة */
        #chats-unread-badge {
            background: #ef4444 !important;
            color: #fff !important;
            font-size: 9px !important;
            font-weight: 800 !important;
            min-width: 16px !important;
            height: 16px !important;
            border-radius: 8px !important;
            padding: 0 4px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            position: absolute !important;
            top: -5px !important;
            right: -7px !important;
            box-shadow: 0 1px 5px rgba(239,68,68,0.6) !important;
            border: 1.5px solid #0f172a !important;
            line-height: 1 !important;
        }
        /* نضمن أن .icon فيها position:relative */
        #btn-nav-chats .icon {
            position: relative !important;
        }
        /* شارة الجرس بالأحمر */
        #notif-bell-badge {
            background: #ef4444 !important;
            color: #fff !important;
            font-size: 9px !important;
            font-weight: 800 !important;
            min-width: 16px !important;
            height: 16px !important;
            border-radius: 8px !important;
            padding: 0 4px !important;
            position: absolute !important;
            top: -5px !important;
            right: -7px !important;
            box-shadow: 0 1px 5px rgba(239,68,68,0.6) !important;
            border: 1.5px solid #0f172a !important;
        }
    `;
    document.head.appendChild(style);
})();

document.addEventListener('DOMContentLoaded', () => {
    const loginBtn = document.getElementById('login-btn');
    const tiktokBtn = document.getElementById('tiktok-btn');
    const facebookBtn = document.getElementById('facebook-btn');
    const logoutBtn = document.getElementById('logout-btn');

    if (loginBtn) {
        loginBtn.addEventListener('click', async () => {
            await sb.auth.signInWithOAuth({
                provider: 'google',
                options: { redirectTo }
            });
        });
    }

    if (facebookBtn) {
        facebookBtn.addEventListener('click', async () => {
            await sb.auth.signInWithOAuth({
                provider: 'facebook',
                options: { redirectTo }
            });
        });
    }

    if (tiktokBtn) {
        tiktokBtn.addEventListener('click', () => {
            alert("La connexion via TikTok n'est pas prise en charge directement par Supabase. Vous devez configurer un fournisseur OAuth personnalisé dans la console Supabase.");
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await updateLastSeenInDB();
            await sb.auth.signOut();
            window.location.href = 'index.html';
        });
    }

    // تشغيل التبويبات إذا كنا في app.html
    initAppTabs();
    initTopTabs();
    initHeaderSearch();

    // مستمعي أحداث الشات
    const chatBackBtn = document.getElementById('chat-back-btn');
    const chatSendBtn = document.getElementById('chat-send-btn');
    const chatInput = document.getElementById('chat-input');

    if (chatBackBtn) {
        chatBackBtn.addEventListener('click', closeChatWindow);
    }

    if (chatSendBtn) {
        chatSendBtn.addEventListener('click', sendChatMessage);
    }

    const chatProfileBtn = document.getElementById('chat-profile-btn');
    if (chatProfileBtn) {
        chatProfileBtn.addEventListener('click', () => {
            if (activeChatUserProfile) {
                openUserModal(activeChatUserProfile);
            }
        });
    }

    // القائمة المنسدلة في الشات (⋮)
    const chatMenuBtn = document.getElementById('chat-menu-btn');
    if (chatMenuBtn) {
        chatMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            // إزالة أي قائمة مفتوحة
            const oldMenu = document.querySelector('.chat-dropdown-menu');
            if (oldMenu) { oldMenu.remove(); return; }

            const menu = document.createElement('div');
            menu.className = 'chat-dropdown-menu';
            menu.innerHTML = `
                <button class="dropdown-item" id="dd-add-fav">
                    <span class="dd-icon dd-icon-fav"><i class="fas fa-star"></i></span>
                    <span>Ajouter à Mes favoris</span>
                </button>
                <div class="dropdown-divider"></div>
                <button class="dropdown-item" id="dd-clear-history">
                    <span class="dd-icon dd-icon-clear"><i class="fas fa-trash-can"></i></span>
                    <span>Effacer l'historique du chat</span>
                </button>
                <div class="dropdown-divider"></div>
                <button class="dropdown-item" id="dd-block-user">
                    <span class="dd-icon dd-icon-block"><i class="fas fa-ban"></i></span>
                    <span>Bloquer</span>
                </button>
                <div class="dropdown-divider"></div>
                <button class="dropdown-item" id="dd-shortcut">
                    <span class="dd-icon dd-icon-shortcut"><i class="fas fa-share-from-square"></i></span>
                    <span>Créer un raccourci</span>
                </button>
                <div class="dropdown-divider"></div>
                <button class="dropdown-item danger" id="dd-report-user">
                    <span class="dd-icon dd-icon-report"><i class="fas fa-flag"></i></span>
                    <span>Signaler un abus</span>
                </button>
            `;
            chatMenuBtn.parentElement.style.position = 'relative';
            chatMenuBtn.parentElement.appendChild(menu);

            // إضافة للمفضلة
            menu.querySelector('#dd-add-fav').addEventListener('click', async () => {
                menu.remove();
                if (!activeChatUserId || !currentUser) return;
                try {
                    await sb.from('favorites').upsert([{ user_id: currentUser.id, favorite_user_id: activeChatUserId }]);
                    showToast('Ajouté aux favoris ⭐');
                } catch (e) { showToast('Erreur lors de l\'ajout aux favoris'); }
            });

            // مسح سجل الشات
            menu.querySelector('#dd-clear-history').addEventListener('click', async () => {
                menu.remove();
                if (!activeChatUserId || !currentUser) return;
                if (!confirm('Effacer tout l\'historique de cette conversation ?')) return;
                try {
                    await sb.from('messages').delete()
                        .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${activeChatUserId}),and(sender_id.eq.${activeChatUserId},receiver_id.eq.${currentUser.id})`);
                    const container = document.getElementById('chat-messages-container');
                    if (container) container.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:var(--text-muted);gap:8px;"><i class="far fa-comments" style="font-size:24px;opacity:0.5;"></i><p style="font-size:13px;">Aucun message. Démarrer la conversation maintenant !</p></div>`;
                    showToast('Historique effacé 🗑️');
                } catch (e) { showToast('Erreur lors de la suppression'); }
            });

            menu.querySelector('#dd-block-user').addEventListener('click', async () => {
                menu.remove();
                if (activeChatUserProfile && confirm(`Voulez-vous bloquer ${activeChatUserProfile.full_name || 'cet utilisateur'} ?`)) {
                    await blockUser(activeChatUserId);
                    closeChatWindow();
                }
            });

            // إنشاء اختصار (Shortcut) — يفتح الشات مباشرة عبر URL
            menu.querySelector('#dd-shortcut').addEventListener('click', () => {
                menu.remove();
                if (!activeChatUserId) return;
                const shortcutUrl = `${window.location.origin}${window.location.pathname}?chat=${activeChatUserId}`;
                if (navigator.share) {
                    navigator.share({ title: 'HayMoi Chat', url: shortcutUrl }).catch(() => { });
                } else {
                    navigator.clipboard.writeText(shortcutUrl).then(() => showToast('Lien copié 📋')).catch(() => showToast('Impossible de copier le lien'));
                }
            });

            menu.querySelector('#dd-report-user').addEventListener('click', () => {
                menu.remove();
                if (activeChatUserProfile) {
                    openReportModal(activeChatUserProfile);
                }
            });

            // إغلاق القائمة عند النقر خارجها
            setTimeout(() => {
                document.addEventListener('click', function closeMenu(ev) {
                    if (!menu.contains(ev.target)) {
                        menu.remove();
                        document.removeEventListener('click', closeMenu);
                    }
                });
            }, 10);
        });
    }

    if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendChatMessage();
            }
        });

        chatInput.addEventListener('input', () => {
            const hasText = chatInput.value.trim().length > 0;
            const audioBtn = document.getElementById('chat-audio-btn');
            if (chatSendBtn && audioBtn) {
                if (hasText) {
                    chatSendBtn.style.display = 'flex';
                    audioBtn.style.display = 'none';
                } else {
                    chatSendBtn.style.display = 'none';
                    audioBtn.style.display = 'flex';
                }
            }
        });
    }

    // === منتقي الإيموجي (Emoji Picker) ===
    const chatEmojiBtn = document.getElementById('chat-emoji-btn');
    const emojiPopover = document.getElementById('emoji-picker-popover');
    if (chatEmojiBtn && emojiPopover && chatInput) {
        chatEmojiBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isHidden = emojiPopover.style.display === 'none';
            emojiPopover.style.display = isHidden ? 'grid' : 'none';
        });

        emojiPopover.addEventListener('click', (e) => {
            const emojiEl = e.target.closest('.emoji-item');
            if (emojiEl) {
                const emoji = emojiEl.textContent;
                // إدراج الإيموجي في موضع المؤشر
                const start = chatInput.selectionStart;
                const end = chatInput.selectionEnd;
                const text = chatInput.value;
                chatInput.value = text.substring(0, start) + emoji + text.substring(end);
                chatInput.selectionStart = chatInput.selectionEnd = start + emoji.length;
                chatInput.focus();

                // تفعيل زر الإرسال وإخفاء الميكروفون
                chatInput.dispatchEvent(new Event('input'));
            }
        });

        // إغلاق المنبثقة عند النقر في أي مكان آخر
        document.addEventListener('click', (e) => {
            if (!chatEmojiBtn.contains(e.target) && !emojiPopover.contains(e.target)) {
                emojiPopover.style.display = 'none';
            }
        });
    }

    // === أزرار الميديا (صور + أوديو) ===
    const chatImgBtn = document.getElementById('chat-img-btn');
    const chatImgInput = document.getElementById('chat-img-input');
    const chatAudioBtn = document.getElementById('chat-audio-btn');
    const recordingStopBtn = document.getElementById('recording-stop-btn');
    const recordingCancelBtn = document.getElementById('recording-cancel-btn');

    // زر قائمة المرفقات
    const attachmentMenu = document.getElementById('attachment-menu');
    if (chatImgBtn && attachmentMenu) {
        chatImgBtn.addEventListener('click', () => {
            attachmentMenu.classList.toggle('open');
        });

        // إغلاق القائمة عند النقر في أي مكان آخر
        document.addEventListener('click', (e) => {
            if (!attachmentMenu.contains(e.target) && !chatImgBtn.contains(e.target)) {
                attachmentMenu.classList.remove('open');
            }
        });
    }

    const attachPhotoBtn = document.getElementById('attach-photo-btn');
    if (attachPhotoBtn && chatImgInput) {
        attachPhotoBtn.addEventListener('click', () => {
            chatImgInput.click();
            if (attachmentMenu) attachmentMenu.classList.remove('open');
        });

        chatImgInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                await uploadAndSendImage(file);
                chatImgInput.value = ''; // تفريغ الحقل
            }
        });
    }

    // زر التسجيل الصوتي
    if (chatAudioBtn) {
        chatAudioBtn.addEventListener('click', () => {
            if (isRecording) {
                stopAudioRecording(false); // إلغاء
            } else {
                startAudioRecording();
            }
        });
    }

    // زر إيقاف التسجيل وإرسال
    if (recordingStopBtn) {
        recordingStopBtn.addEventListener('click', () => {
            stopAudioRecording(true); // إيقاف وإرسال
        });
    }

    // زر إلغاء التسجيل
    if (recordingCancelBtn) {
        recordingCancelBtn.addEventListener('click', () => {
            stopAudioRecording(false); // إلغاء بدون إرسال
        });
    }

    // تحميل بيانات app.html
    if (path.includes('app.html')) {
        initDebugBox();
    }

    // ربط كليك الأفاتار العلوية للانتقال للبروفايل الخاص
    const headerAvatar = document.getElementById('header-user-avatar');
    if (headerAvatar) {
        headerAvatar.addEventListener('click', () => {
            if (window.switchAppView) {
                window.switchAppView('profil');
            }
        });
    }

    // ربط كليك أيقونة الجرس للانتقال لقسم المحادثات
    const notifBellBtn = document.getElementById('notif-bell-btn');
    if (notifBellBtn) {
        notifBellBtn.addEventListener('click', () => {
            if (window.switchAppView) {
                window.switchAppView('chats');
            }
        });
    }

    // ربط كليك عنوان Trouver لإعادة تصفير الفلاتر
    const headerTitle = document.getElementById('header-title');
    if (headerTitle) {
        headerTitle.addEventListener('click', () => {
            const defaultTab = document.getElementById('tab-nearby');
            if (defaultTab) defaultTab.click();
        });
    }
});

// ═══════════════════════════════════════════════════
// === نظام إرسال الصور (Image Upload & Send) ===
// ═══════════════════════════════════════════════════

async function uploadAndSendImage(file) {
    if (!currentUser || !activeChatUserId) return;

    // التحقق من حجم الملف (الحد الأقصى 5MB)
    if (file.size > 5 * 1024 * 1024) {
        alert("La taille de l'image est trop grande ! Le maximum autorisé est de 5 Mo.");
        return;
    }

    // عرض مؤشر التحميل في الشات
    const container = document.getElementById('chat-messages-container');
    const tempBubble = document.createElement('div');
    tempBubble.className = 'msg-bubble sent image-msg';
    tempBubble.style.position = 'relative';
    tempBubble.innerHTML = `
        <div style="width:200px; height:150px; background:rgba(255,255,255,0.05); border-radius:12px; display:flex; align-items:center; justify-content:center;">
            <i class="fas fa-spinner fa-spin" style="font-size:24px; color:var(--color-primary);"></i>
        </div>
        <span class="msg-time">Envoi en cours...</span>
    `;
    container.appendChild(tempBubble);
    container.scrollTop = container.scrollHeight;

    try {
        // رفع الصورة لـ Supabase Storage
        const fileExt = file.name.split('.').pop();
        const fileName = `img_${currentUser.id}_${Date.now()}.${fileExt}`;
        const filePath = `chat-images/${fileName}`;

        const { data: uploadData, error: uploadError } = await sb.storage
            .from('chat-media')
            .upload(filePath, file, {
                contentType: file.type,
                upsert: false
            });

        if (uploadError) throw uploadError;

        // جلب الرابط العام للصورة
        const { data: urlData } = sb.storage
            .from('chat-media')
            .getPublicUrl(filePath);

        const publicUrl = urlData.publicUrl;

        // حفظ الرسالة في قاعدة البيانات
        const { error: msgError } = await sb
            .from('messages')
            .insert([{
                sender_id: currentUser.id,
                receiver_id: activeChatUserId,
                content: '📷 Photo',
                type: 'image',
                media_url: publicUrl
            }]);

        if (msgError) throw msgError;

        // إزالة مؤشر التحميل
        tempBubble.remove();

    } catch (err) {
        console.error('خطأ أثناء رفع الصورة:', err);
        tempBubble.remove();
        alert("Échec de l'envoi de la photo : " + err.message);
    }
}

// فتح الصورة بالحجم الكامل (Lightbox)
function openImageLightbox(imageUrl) {
    const lightbox = document.createElement('div');
    lightbox.className = 'image-lightbox';
    lightbox.innerHTML = `
        <button class="lightbox-close"><i class="fas fa-times"></i></button>
        <img src="${sanitizeUrl(imageUrl)}" alt="image">
    `;
    document.body.appendChild(lightbox);

    // إغلاق بالنقر على الخلفية أو الزر
    lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox || e.target.closest('.lightbox-close')) {
            lightbox.remove();
        }
    });
}

// ═══════════════════════════════════════════════════
// === نظام التسجيل الصوتي (Audio Recording) ===
// ═══════════════════════════════════════════════════

let isRecording = false;
let mediaRecorder = null;
let audioChunks = [];
let recordingTimerInterval = null;
let recordingStartTime = null;

async function startAudioRecording() {
    if (isRecording) return;

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        audioChunks = [];

        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                audioChunks.push(e.data);
            }
        };

        mediaRecorder.onstop = async () => {
            // إيقاف جميع المسارات
            stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.start();
        isRecording = true;
        recordingStartTime = Date.now();

        // عرض مؤشر التسجيل
        const indicator = document.getElementById('recording-indicator');
        const inputArea = document.querySelector('.chat-input-area');
        if (indicator) indicator.style.display = 'flex';
        if (inputArea) inputArea.style.display = 'none';

        // تحديث المؤقت
        updateRecordingTimer();
        recordingTimerInterval = setInterval(updateRecordingTimer, 1000);

        // تغيير أيقونة زر الميكروفون
        const audioBtn = document.getElementById('chat-audio-btn');
        if (audioBtn) {
            audioBtn.innerHTML = '<i class="fas fa-stop" style="color:#ef4444;"></i>';
        }

    } catch (err) {
        console.error('فشل الوصول للميكروفون:', err);
        alert("Veuillez autoriser l'accès au microphone !");
    }
}

function updateRecordingTimer() {
    const timerEl = document.getElementById('recording-timer');
    if (!timerEl || !recordingStartTime) return;

    const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
    const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const secs = (elapsed % 60).toString().padStart(2, '0');
    timerEl.textContent = `${mins}:${secs}`;
}

async function stopAudioRecording(shouldSend) {
    if (!isRecording || !mediaRecorder) return;

    isRecording = false;

    // إيقاف المؤقت
    clearInterval(recordingTimerInterval);

    // إخفاء مؤشر التسجيل
    const indicator = document.getElementById('recording-indicator');
    const inputArea = document.querySelector('.chat-input-area');
    if (indicator) indicator.style.display = 'none';
    if (inputArea) inputArea.style.display = 'flex';

    // إعادة أيقونة الميكروفون
    const audioBtn = document.getElementById('chat-audio-btn');
    if (audioBtn) {
        audioBtn.innerHTML = '<i class="fas fa-microphone"></i>';
    }

    // إعادة المؤقت
    const timerEl = document.getElementById('recording-timer');
    if (timerEl) timerEl.textContent = '00:00';

    if (shouldSend) {
        // انتظار حتى يتوقف المسجل تماماً ثم إرسال
        return new Promise((resolve) => {
            mediaRecorder.onstop = async () => {
                // إيقاف جميع المسارات
                mediaRecorder.stream.getTracks().forEach(track => track.stop());

                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });

                // حساب المدة
                const duration = Math.floor((Date.now() - recordingStartTime) / 1000);

                await uploadAndSendAudio(audioBlob, duration);
                resolve();
            };
            mediaRecorder.stop();
        });
    } else {
        // إلغاء التسجيل
        mediaRecorder.stop();
        audioChunks = [];
    }
}

async function uploadAndSendAudio(audioBlob, durationSec) {
    if (!currentUser || !activeChatUserId) return;

    // عرض مؤشر التحميل
    const container = document.getElementById('chat-messages-container');
    const tempBubble = document.createElement('div');
    tempBubble.className = 'msg-bubble sent audio-msg';
    tempBubble.innerHTML = `
        <div class="audio-player-wrapper">
            <div class="audio-play-btn"><i class="fas fa-spinner fa-spin"></i></div>
            <span style="color:rgba(255,255,255,0.5); font-size:13px;">Envoi en cours...</span>
        </div>
    `;
    container.appendChild(tempBubble);
    container.scrollTop = container.scrollHeight;

    try {
        const fileName = `audio_${currentUser.id}_${Date.now()}.webm`;
        const filePath = `chat-audio/${fileName}`;

        const { data: uploadData, error: uploadError } = await sb.storage
            .from('chat-media')
            .upload(filePath, audioBlob, {
                contentType: 'audio/webm',
                upsert: false
            });

        if (uploadError) throw uploadError;

        const { data: urlData } = sb.storage
            .from('chat-media')
            .getPublicUrl(filePath);

        const publicUrl = urlData.publicUrl;

        // تنسيق المدة
        const mins = Math.floor(durationSec / 60).toString().padStart(2, '0');
        const secs = (durationSec % 60).toString().padStart(2, '0');

        const { error: msgError } = await sb
            .from('messages')
            .insert([{
                sender_id: currentUser.id,
                receiver_id: activeChatUserId,
                content: `🎙️ ${mins}:${secs}`,
                type: 'audio',
                media_url: publicUrl
            }]);

        if (msgError) throw msgError;

        tempBubble.remove();

    } catch (err) {
        console.error('خطأ أثناء رفع الملف الصوتي:', err);
        tempBubble.remove();
        alert("Échec de l'envoi du fichier audio : " + err.message);
    }
}

// ═══════════════════════════════════════════════════
// === نظام الحظر والإبلاغ (Block & Report System) ===
// ═══════════════════════════════════════════════════

async function loadBlockedUsers() {
    if (!currentUser) return;
    try {
        const { data, error } = await sb
            .from('blocks')
            .select('blocker_id, blocked_id')
            .or(`blocker_id.eq.${currentUser.id},blocked_id.eq.${currentUser.id}`);

        if (error) {
            if (error.code === '42P01') {
                debugLog("loadBlockedUsers: Table 'blocks' does not exist in DB yet.", true);
                return;
            }
            throw error;
        }

        blockedUserIds.clear();
        if (data) {
            data.forEach(row => {
                if (row.blocker_id === currentUser.id) {
                    blockedUserIds.add(row.blocked_id);
                } else {
                    blockedUserIds.add(row.blocker_id);
                }
            });
        }
        debugLog(`loadBlockedUsers: Loaded ${blockedUserIds.size} blocked users (mutual).`);
    } catch (err) {
        debugLog("loadBlockedUsers: Error: " + err.message, true);
    }
}

async function blockUser(userId) {
    if (!currentUser || !userId) return;
    try {
        const { error } = await sb
            .from('blocks')
            .insert([{ blocker_id: currentUser.id, blocked_id: userId }]);

        if (error) throw error;

        blockedUserIds.add(userId);
        debugLog(`blockUser: Blocked user ${userId}`);

        // إعادة تحميل القوائم
        if (currentUser) loadDiscoveryUsers(currentUser);
        loadActiveChats();

        showToastNotification(null, 'Bloqué', 'Cet utilisateur a été bloqué avec succès.', 'system');
    } catch (err) {
        console.error('خطأ أثناء الحظر:', err);
        if (err.code === '42P01') {
            alert('Échec du blocage :\nVeuillez d\'abord créer la table blocks dans Supabase !');
        } else {
            alert('Échec du blocage : ' + err.message);
        }
    }
}

async function unblockUser(userId) {
    if (!currentUser || !userId) return;
    try {
        const { error } = await sb
            .from('blocks')
            .delete()
            .eq('blocker_id', currentUser.id)
            .eq('blocked_id', userId);

        if (error) throw error;

        blockedUserIds.delete(userId);
        debugLog(`unblockUser: Unblocked user ${userId}`);

        if (currentUser) loadDiscoveryUsers(currentUser);
        loadActiveChats();
    } catch (err) {
        console.error('خطأ أثناء إلغاء الحظر:', err);
        if (err.code === '42P01') {
            alert('Échec du déblocage :\nVeuillez d\'abord créer la table blocks dans Supabase !');
        } else {
            alert('Échec du déblocage : ' + err.message);
        }
    }
}

function openReportModal(profile) {
    // إزالة أي نافذة إبلاغ سابقة
    const old = document.querySelector('.report-modal-overlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.className = 'report-modal-overlay';

    const reasons = [
        'Contenu offensant ou harcèlement',
        'Faux profil',
        'Messages indésirables (Spam)',
        'Contenu inapproprié',
        'Fraude ou arnaque',
        'Autre raison'
    ];

    overlay.innerHTML = `
        <div class="report-modal">
            <h3><i class="fas fa-flag" style="color:#ef4444; margin-right:8px;"></i> Signaler ${escapeHtml(profile.full_name || 'Utilisateur')}</h3>
            <div class="report-reason-list">
                ${reasons.map((r, i) => `<button class="report-reason-btn" data-reason="${escapeHtml(r)}">${r}</button>`).join('')}
            </div>
            <textarea class="report-details-input" placeholder="Ajouter des détails supplémentaires (optionnel)..."></textarea>
            <div class="report-actions">
                <button class="btn-report-submit" id="submit-report-btn">
                    <i class="fas fa-paper-plane" style="margin-right:6px;"></i> Envoyer le signalement
                </button>
                <button class="btn-report-cancel" id="cancel-report-btn">Annuler</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    let selectedReason = '';

    // اختيار السبب
    overlay.querySelectorAll('.report-reason-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            overlay.querySelectorAll('.report-reason-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selectedReason = btn.getAttribute('data-reason');
        });
    });

    // إرسال البلاغ
    overlay.querySelector('#submit-report-btn').addEventListener('click', async () => {
        if (!selectedReason) {
            alert('Veuillez sélectionner un motif de signalement !');
            return;
        }
        const details = overlay.querySelector('.report-details-input').value.trim();

        try {
            const { error } = await sb
                .from('reports')
                .insert([{
                    reporter_id: currentUser.id,
                    reported_id: profile.user_id,
                    reason: selectedReason,
                    details: details || null
                }]);

            if (error) throw error;

            overlay.remove();
            showToastNotification(null, 'Signalement envoyé', 'Merci ! Le signalement sera examiné prochainement.', 'system');
        } catch (err) {
            console.error('خطأ أثناء الإبلاغ:', err);
            if (err.code === '42P01') {
                alert('Échec de l\'envoi du signalement :\nVeuillez d\'abord créer la table reports dans Supabase !');
            } else {
                alert('Échec de l\'envoi du signalement : ' + err.message);
            }
        }
    });

    // إلغاء
    overlay.querySelector('#cancel-report-btn').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });
}

// ═══════════════════════════════════════════════════
// === نظام الإشعارات (Message Notifications) ===
// ═══════════════════════════════════════════════════

function initGlobalMessageNotifier() {
    if (!currentUser) return;
    if (globalMessageSubscription) return;

    globalMessageSubscription = sb.channel('global-msg-notifier')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `receiver_id=eq.${currentUser.id}`
        }, async (payload) => {
            const newMsg = payload.new;
            debugLog(`[Notification] New message from ${newMsg.sender_id}`);

            // إذا المستخدم محظور - تجاهل
            if (blockedUserIds.has(newMsg.sender_id)) return;

            // إذا الشات مفتوح مع نفس الشخص - لا نعرض Toast (الرسالة تظهر تلقائياً)
            if (activeChatUserId === newMsg.sender_id) {
                // علّم الرسالة كمقروءة
                markMessageAsRead(newMsg.id);
                return;
            }

            // جلب اسم المرسل
            try {
                const { data: senderProfiles } = await sb
                    .from('profiles')
                    .select('full_name, gender, avatar_url')
                    .eq('user_id', newMsg.sender_id)
                    .limit(1);

                const sender = senderProfiles && senderProfiles.length > 0 ? senderProfiles[0] : null;
                const senderName = sender ? sender.full_name : 'Utilisateur';
                const senderGender = sender ? sender.gender : 'male';
                const senderAvatar = sender ? sender.avatar_url : null;

                // عرض Toast
                showToastNotification(
                    { name: senderName, gender: senderGender, avatar_url: senderAvatar, user_id: newMsg.sender_id },
                    senderName,
                    newMsg.content || '📷 Photo',
                    'message'
                );

                // تحديث شارة الرسائل غير المقروءة
                updateUnreadBadge();

            } catch (e) {
                debugLog("[Notification] Error fetching sender profile: " + e.message, true);
            }
        })
        .subscribe();

    debugLog("initGlobalMessageNotifier: Subscribed to global messages.");

    // تحديث العدد الأولي للرسائل غير المقروءة
    updateUnreadBadge();
}

async function updateUnreadBadge() {
    if (!currentUser) return;
    try {
        const { count, error } = await sb
            .from('messages')
            .select('id', { count: 'exact', head: true })
            .eq('receiver_id', currentUser.id)
            .eq('is_read', false);

        const unreadCount = (count && count > 0) ? count : 0;

        // تحديث شارة تبويب Chats
        const chatsBadge = document.getElementById('chats-unread-badge');
        if (chatsBadge) {
            if (unreadCount > 0) {
                chatsBadge.textContent = unreadCount > 99 ? '99+' : unreadCount;
                chatsBadge.style.display = 'flex';
            } else {
                chatsBadge.textContent = '';
                chatsBadge.style.display = 'none';
            }
        }

        // تحديث أيقونة الجرس
        const bellBadge = document.getElementById('notif-bell-badge');
        if (bellBadge) {
            if (unreadCount > 0) {
                bellBadge.textContent = unreadCount > 99 ? '99+' : unreadCount;
                bellBadge.style.display = 'flex';
            } else {
                bellBadge.textContent = '';
                bellBadge.style.display = 'none';
            }
        }
    } catch (err) {
        // في حالة الخطأ نخفي الشارة
        const chatsBadge = document.getElementById('chats-unread-badge');
        if (chatsBadge) { chatsBadge.style.display = 'none'; chatsBadge.textContent = ''; }
        debugLog("updateUnreadBadge: Error: " + err.message, true);
    }
}

async function markMessageAsRead(messageId) {
    try {
        await sb
            .from('messages')
            .update({ is_read: true })
            .eq('id', messageId);
    } catch (err) {
        // تجاهل الأخطاء الصامتة
    }
}

// علّم كل الرسائل من شخص معين كمقروءة
async function markAllMessagesAsRead(senderId) {
    if (!currentUser || !senderId) return;
    try {
        await sb
            .from('messages')
            .update({ is_read: true })
            .eq('receiver_id', currentUser.id)
            .eq('sender_id', senderId)
            .eq('is_read', false);

        // تحديث الشارة وإعادة رسم قائمة الشات باش تتحيد الخلفية الحمراء
        await updateUnreadBadge();
        loadActiveChats();
    } catch (err) {
        debugLog("markAllMessagesAsRead: Error: " + err.message, true);
    }
}

function showToastNotification(senderInfo, title, message, type) {
    // إزالة أي toast سابق
    const oldToast = document.querySelector('.toast-notification');
    if (oldToast) oldToast.remove();

    const toast = document.createElement('div');
    toast.className = 'toast-notification';

    let avatarHtml = '';
    if (type === 'system') {
        avatarHtml = `<div class="toast-avatar" style="background:linear-gradient(135deg, #1e3a5f, #3b82f6);"><i class="fas fa-bell" style="color:#93c5fd; font-size:16px;"></i></div>`;
    } else if (senderInfo) {
        const initial = (senderInfo.name || '?').charAt(0).toUpperCase();
        const genderClass = senderInfo.gender === 'female' ? 'female' : 'male';
        if (senderInfo.avatar_url) {
            avatarHtml = `<div class="toast-avatar ${genderClass}"><img src="${sanitizeUrl(senderInfo.avatar_url)}" alt=""></div>`;
        } else {
            avatarHtml = `<div class="toast-avatar ${genderClass}">${initial}</div>`;
        }
    }

    toast.innerHTML = `
        ${avatarHtml}
        <div class="toast-content">
            <div class="toast-name">${escapeHtml(title)}</div>
            <div class="toast-message">${escapeHtml(message)}</div>
        </div>
        <span class="toast-time">À l'instant</span>
    `;

    // عند النقر على الـ toast
    if (type === 'message' && senderInfo && senderInfo.user_id) {
        toast.style.cursor = 'pointer';
        toast.addEventListener('click', async () => {
            toast.remove();
            // فتح المحادثة مع المرسل
            try {
                const { data: profiles } = await sb
                    .from('profiles')
                    .select('*')
                    .eq('user_id', senderInfo.user_id)
                    .limit(1);
                if (profiles && profiles.length > 0) {
                    openChatWindow(profiles[0]);
                }
            } catch (e) { /* تجاهل */ }
        });
    }

    document.body.appendChild(toast);

    // إخفاء تلقائي بعد 5 ثوان
    setTimeout(() => {
        if (toast.parentNode) {
            toast.classList.add('hiding');
            setTimeout(() => toast.remove(), 300);
        }
    }, 5000);
}

// دالة Toast بسيطة للإشعارات السريعة
function showToast(msg) {
    const old = document.querySelector('.simple-toast');
    if (old) old.remove();
    const t = document.createElement('div');
    t.className = 'simple-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2800);
}

// ═══════════════════════════════════════════════════
// === معرض الصور والكاروسيل (Profile Carousel & Lightbox) ===
// ═══════════════════════════════════════════════════

function initProfileCarousel(containerEl) {
    if (!containerEl) return;
    const track = containerEl.querySelector('.carousel-track');
    const dots = containerEl.querySelectorAll('.carousel-dot');
    const slides = containerEl.querySelectorAll('.carousel-slide');
    if (!track || slides.length <= 1) return;

    let currentIndex = 0;
    let startX = 0;
    let isDragging = false;
    let autoPlayInterval = null;

    function updateCarousel() {
        const width = containerEl.offsetWidth || 400;
        track.style.transform = `translateX(-${currentIndex * width}px)`;
        dots.forEach((dot, idx) => {
            dot.classList.toggle('active', idx === currentIndex);
        });
    }

    function startAutoPlay() {
        stopAutoPlay();
        autoPlayInterval = setInterval(() => {
            if (currentIndex < slides.length - 1) {
                currentIndex++;
            } else {
                currentIndex = 0;
            }
            updateCarousel();
        }, 4500);
    }

    function stopAutoPlay() {
        if (autoPlayInterval) {
            clearInterval(autoPlayInterval);
            autoPlayInterval = null;
        }
    }

    // Touch events
    containerEl.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        isDragging = true;
        track.style.transition = 'none';
        stopAutoPlay();
    }, { passive: true });

    containerEl.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        const currentX = e.touches[0].clientX;
        const diff = currentX - startX;
        const width = containerEl.offsetWidth || 400;
        const translate = -currentIndex * width + diff;
        track.style.transform = `translateX(${translate}px)`;
    }, { passive: true });

    containerEl.addEventListener('touchend', (e) => {
        if (!isDragging) return;
        isDragging = false;
        track.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        
        const endX = e.changedTouches[0].clientX;
        const diff = endX - startX;
        const threshold = (containerEl.offsetWidth || 400) * 0.15;

        if (diff < -threshold && currentIndex < slides.length - 1) {
            currentIndex++;
        } else if (diff > threshold && currentIndex > 0) {
            currentIndex--;
        }
        updateCarousel();
        startAutoPlay();
    });

    startAutoPlay();
    
    const resizeObserver = new ResizeObserver(() => {
        updateCarousel();
    });
    resizeObserver.observe(containerEl);

    containerEl._carouselCleanup = () => {
        stopAutoPlay();
        resizeObserver.disconnect();
    };
}

function openLightbox(imagesList, startIndex = 0) {
    const oldLightbox = document.getElementById('lightbox-viewer');
    if (oldLightbox) oldLightbox.remove();

    const lightbox = document.createElement('div');
    lightbox.id = 'lightbox-viewer';
    lightbox.className = 'lightbox-overlay';

    let currentIndex = startIndex;

    lightbox.innerHTML = `
        <button class="lightbox-close" title="Fermer">
            <i class="fas fa-times"></i>
        </button>
        
        <div class="lightbox-content">
            <img id="lightbox-img" src="${sanitizeUrl(imagesList[currentIndex])}">
            
            ${imagesList.length > 1 ? `
                <button class="lightbox-nav prev" title="Précédent">
                    <i class="fas fa-chevron-left"></i>
                </button>
                <button class="lightbox-nav next" title="Suivant">
                    <i class="fas fa-chevron-right"></i>
                </button>
                <div class="lightbox-counter">
                    ${currentIndex + 1} / ${imagesList.length}
                </div>
            ` : ''}
        </div>
    `;

    document.body.appendChild(lightbox);

    const imgEl = lightbox.querySelector('#lightbox-img');
    const counterEl = lightbox.querySelector('.lightbox-counter');

    function updateImage() {
        imgEl.style.opacity = '0';
        imgEl.style.transform = 'scale(0.95)';
        setTimeout(() => {
            imgEl.src = sanitizeUrl(imagesList[currentIndex]);
            imgEl.style.opacity = '1';
            imgEl.style.transform = 'scale(1)';
            if (counterEl) counterEl.textContent = `${currentIndex + 1} / ${imagesList.length}`;
        }, 150);
    }

    lightbox.querySelector('.lightbox-close').addEventListener('click', () => lightbox.remove());
    lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox || e.target.classList.contains('lightbox-content')) {
            lightbox.remove();
        }
    });

    if (imagesList.length > 1) {
        const prevBtn = lightbox.querySelector('.lightbox-nav.prev');
        const nextBtn = lightbox.querySelector('.lightbox-nav.next');
        if (prevBtn) {
            prevBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                currentIndex = (currentIndex - 1 + imagesList.length) % imagesList.length;
                updateImage();
            });
        }
        if (nextBtn) {
            nextBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                currentIndex = (currentIndex + 1) % imagesList.length;
                updateImage();
            });
        }

        let startX = 0;
        lightbox.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
        }, { passive: true });

        lightbox.addEventListener('touchend', (e) => {
            const endX = e.changedTouches[0].clientX;
            const diff = endX - startX;
            if (diff > 60) {
                currentIndex = (currentIndex - 1 + imagesList.length) % imagesList.length;
                updateImage();
            } else if (diff < -60) {
                currentIndex = (currentIndex + 1) % imagesList.length;
                updateImage();
            }
        });
    }
}

// ═══════════════════════════════════════════════════
// === نظام الصور والأفاتار (Avatar System) ===
// ═══════════════════════════════════════════════════

function compressImage(file, maxWidth = 400, quality = 0.8) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = (maxWidth / width) * height;
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob((blob) => {
                    resolve(blob);
                }, 'image/jpeg', quality);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

async function uploadAvatar(file) {
    if (!currentUser) return null;

    try {
        // ضغط الصورة
        const compressed = await compressImage(file, 400, 0.85);

        const fileName = `avatar_${currentUser.id}_${Date.now()}.jpg`;
        const filePath = `avatars/${fileName}`;

        const { data: uploadData, error: uploadError } = await sb.storage
            .from('chat-media')
            .upload(filePath, compressed, {
                contentType: 'image/jpeg',
                upsert: false
            });

        if (uploadError) throw uploadError;

        const { data: urlData } = sb.storage
            .from('chat-media')
            .getPublicUrl(filePath);

        const publicUrl = urlData.publicUrl;

        // حفظ الرابط في البروفايل
        const { error: updateError } = await sb
            .from('profiles')
            .update({ avatar_url: publicUrl })
            .eq('user_id', currentUser.id);

        if (updateError) throw updateError;

        // تحديث البروفايل المحلي
        if (currentUserProfile) {
            currentUserProfile.avatar_url = publicUrl;
        }

        debugLog("uploadAvatar: Avatar uploaded and saved: " + publicUrl);
        return publicUrl;
    } catch (err) {
        console.error('خطأ أثناء رفع الصورة الشخصية:', err);
        if (err.code === '42703' || (err.message && err.message.includes('avatar_url'))) {
            alert('Échec du chargement de l\'avatar :\nVeuillez d\'abord exécuter le script SQL dans Supabase pour ajouter la colonne avatar_url à la table profiles !');
        } else {
            alert('Échec du chargement de l\'avatar : ' + err.message);
        }
        return null;
    }
}

// دالة مساعدة لعرض الأفاتار (صورة أو حرف)
function getAvatarHtml(profile, sizeClass = '') {
    if (profile && profile.avatar_url) {
        return `<img src="${sanitizeUrl(profile.avatar_url)}" alt="${escapeHtml(profile.full_name || '')}" loading="lazy">`;
    }
    return (profile && profile.full_name ? profile.full_name : '?').charAt(0).toUpperCase();
}

// ═══════════════════════════════════════════════════
// === ترقية وإلغاء العضوية المميزة VIP (VIP Simulation) ===
// ═══════════════════════════════════════════════════

async function upgradeToVIP() {
    if (!currentUser) {
        alert("Veuillez vous connecter d'abord !");
        return;
    }

    if (!confirm("Voulez-vous vous abonner à l'offre Premium HayMoi VIP ?\nVous obtiendrez un badge 💎 à côté de votre nom et apparaîtrez en tête de liste !")) {
        return;
    }

    try {
        const { error } = await sb
            .from('profiles')
            .update({ is_vip: true })
            .eq('user_id', currentUser.id);

        if (error) throw error;

        if (currentUserProfile) {
            currentUserProfile.is_vip = true;
        }

        showToastNotification(null, 'Félicitations ! 🎉', 'Vous êtes maintenant un membre VIP !', 'system');

        // إعادة تحميل البروفايل وقائمة الأعضاء
        await loadOwnProfile(currentUser);
        if (currentUser) loadDiscoveryUsers(currentUser);

    } catch (err) {
        console.error('خطأ أثناء ترقية VIP:', err);
        if (err.code === '42703' || (err.message && err.message.includes('is_vip'))) {
            alert('Échec de la mise à niveau VIP :\nVeuillez d\'abord exécuter le script SQL dans Supabase pour ajouter la colonne is_vip à la table profiles !');
        } else {
            alert('Échec de la mise à niveau VIP : ' + err.message);
        }
    }
}

async function downgradeFromVIP() {
    if (!currentUser) return;

    if (!confirm("Voulez-vous annuler votre abonnement VIP et revenir au compte standard ?")) {
        return;
    }

    try {
        const { error } = await sb
            .from('profiles')
            .update({ is_vip: false })
            .eq('user_id', currentUser.id);

        if (error) throw error;

        if (currentUserProfile) {
            currentUserProfile.is_vip = false;
        }

        showToastNotification(null, 'Abonnement annulé', 'Retour au compte standard effectué avec succès.', 'system');

        await loadOwnProfile(currentUser);
        if (currentUser) loadDiscoveryUsers(currentUser);

    } catch (err) {
        console.error('خطأ أثناء إلغاء VIP:', err);
        if (err.code === '42703' || (err.message && err.message.includes('is_vip'))) {
            alert('Échec de l\'annulation VIP :\nVeuillez d\'abord exécuter le script SQL dans Supabase pour ajouter la colonne is_vip à la table profiles !');
        } else {
            alert('Échec de l\'annulation VIP : ' + err.message);
        }
    }
}

// ═══════════════════════════════════════════════════
// === نظام ID و Level (HayMoi ID & Level System) ===
// ═══════════════════════════════════════════════════

function generateHayMoiId(userId) {
    // نولد ID رقمي 8 خانات من UUID الخاص بالمستخدم (ثابت دائماً)
    let hash = 0;
    const str = userId.replace(/-/g, '');
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    const positiveHash = Math.abs(hash);
    // نضمن أنه 8 أرقام بالضبط
    const id8 = String(positiveHash % 90000000 + 10000000);
    return id8;
}

function calculateUserLevel(visitsCount, friendsCount) {
    const score = (visitsCount || 0) + (friendsCount || 0) * 3;
    if (score === 0)  return 1;
    if (score < 5)   return 2;
    if (score < 15)  return 3;
    if (score < 30)  return 4;
    if (score < 60)  return 5;
    if (score < 100) return 6;
    if (score < 150) return 7;
    if (score < 220) return 8;
    if (score < 300) return 9;
    return 10;
}

function getLevelProgress(visitsCount, friendsCount) {
    const score = (visitsCount || 0) + (friendsCount || 0) * 3;
    const thresholds = [0, 5, 15, 30, 60, 100, 150, 220, 300, 999];
    const level = calculateUserLevel(visitsCount, friendsCount);
    if (level >= 10) return 100;
    const low  = thresholds[level - 1];
    const high = thresholds[level];
    const progress = Math.round(((score - low) / (high - low)) * 100);
    return Math.min(Math.max(progress, 4), 100);
}

function getLevelIcon(visitsCount, friendsCount) {
    const level = calculateUserLevel(visitsCount, friendsCount);
    const icons = ['🌱','🌿','⭐','🌟','💫','🔥','💎','👑','🏆','🚀'];
    return icons[level - 1] || '🌱';
}

// ═══════════════════════════════════════════════════
// === نظام تعديل الهاشتاكات والبيو (Hashtag Editor) ===
// ═══════════════════════════════════════════════════

const HM_HASHTAG_CATEGORIES = [
    {
        label: '☕ Lifestyle',
        tags: ['#Café', '#Thé', '#Sorties', '#Musique', '#Cinéma', '#Lecture', '#Voyage', '#Sport', '#Gaming', '#Art', '#Cuisine', '#Mode']
    },
    {
        label: '💬 Statut social',
        tags: ['#Libre', '#Je suis libre pour chats', '#Célibataire', '#Discret', '#Sérieux', '#Amitié', '#Rencontre', '#Flirt']
    },
    {
        label: '🌟 Personnalité',
        tags: ['#Sympa', '#Drôle', '#Sérieux', '#Romantique', '#Aventurier', '#Ambitieux', '#Créatif', '#Positif']
    },
    {
        label: '🎯 Recherche',
        tags: ['#Amis', '#Discussion', '#Bonne humeur', '#Partage', '#Confidences', '#Rencontres']
    }
];

function openHashtagEditor(profile, user) {
    const existing = document.getElementById('hm-hashtag-editor-modal');
    if (existing) existing.remove();

    const currentHashtags = (profile.hashtags && Array.isArray(profile.hashtags)) ? [...profile.hashtags] : [];
    const currentBio = profile.bio || '';

    const modal = document.createElement('div');
    modal.id = 'hm-hashtag-editor-modal';

    let selectedTags = [...currentHashtags];
    const MAX_TAGS = 5;

    const buildCategoryHtml = () => HM_HASHTAG_CATEGORIES.map((cat, ci) => `
        <div class="hm-ht-cat">
            <div class="hm-ht-cat-label">${cat.label}</div>
            <div class="hm-ht-pills-row">
                ${cat.tags.map(tag => {
                    const isActive = selectedTags.includes(tag);
                    return `<button class="hm-ht-pill ${isActive ? 'active' : ''}" data-tag="${tag.replace(/"/g, '&quot;')}">${tag}</button>`;
                }).join('')}
            </div>
        </div>
    `).join('');

    modal.innerHTML = `
    <style>
        #hm-hashtag-editor-modal {
            position: fixed; inset: 0; z-index: 4000;
            background: rgba(0,0,0,0.75);
            display: flex; align-items: flex-end; justify-content: center;
            animation: hmFadeIn 0.2s ease;
        }
        @keyframes hmFadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes hmSlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        #hm-hashtag-editor-modal .hm-ht-sheet {
            width: 100%; max-width: 480px;
            background: #13161f;
            border-radius: 28px 28px 0 0;
            padding: 0 0 32px;
            max-height: 92vh;
            overflow-y: auto;
            animation: hmSlideUp 0.35s cubic-bezier(0.34, 1.26, 0.64, 1);
        }
        #hm-hashtag-editor-modal .hm-ht-handle {
            width: 40px; height: 4px;
            background: rgba(255,255,255,0.15);
            border-radius: 2px;
            margin: 14px auto 0;
        }
        #hm-hashtag-editor-modal .hm-ht-top {
            display: flex; align-items: center; justify-content: space-between;
            padding: 18px 20px 10px;
        }
        #hm-hashtag-editor-modal .hm-ht-top-title {
            font-size: 18px; font-weight: 800; color: #fff;
        }
        #hm-hashtag-editor-modal .hm-ht-close {
            background: rgba(255,255,255,0.08); border: none;
            color: rgba(255,255,255,0.6); width: 32px; height: 32px;
            border-radius: 50%; cursor: pointer; font-size: 16px;
            display: flex; align-items: center; justify-content: center;
        }
        /* bio textarea */
        #hm-hashtag-editor-modal .hm-ht-bio-wrap {
            padding: 0 20px 16px;
        }
        #hm-hashtag-editor-modal .hm-ht-bio-label {
            font-size: 12px; font-weight: 700; text-transform: uppercase;
            letter-spacing: .08em; color: rgba(255,255,255,0.38);
            margin-bottom: 8px; display: block;
        }
        #hm-hashtag-editor-modal .hm-ht-bio-input {
            width: 100%; padding: 12px 14px;
            background: rgba(255,255,255,0.05);
            border: 1.5px solid rgba(255,255,255,0.1);
            border-radius: 16px; color: #fff;
            font-size: 14px; font-family: inherit;
            resize: none; outline: none;
            transition: border-color .2s;
            box-sizing: border-box;
        }
        #hm-hashtag-editor-modal .hm-ht-bio-input:focus {
            border-color: #3b82f6;
        }
        /* counter */
        #hm-hashtag-editor-modal .hm-ht-counter {
            font-size: 12px; color: rgba(255,255,255,0.35);
            text-align: right; margin-top: 4px;
        }
        #hm-hashtag-editor-modal .hm-ht-counter.warn { color: #f59e0b; }
        /* selected preview */
        #hm-hashtag-editor-modal .hm-ht-selected-preview {
            margin: 0 20px 16px;
            min-height: 42px;
            background: rgba(59,130,246,0.07);
            border: 1.5px dashed rgba(59,130,246,0.25);
            border-radius: 16px;
            padding: 10px 14px;
            display: flex; flex-wrap: wrap; gap: 7px; align-items: center;
        }
        #hm-hashtag-editor-modal .hm-ht-sel-empty {
            font-size: 12px; color: rgba(255,255,255,0.3);
        }
        #hm-hashtag-editor-modal .hm-ht-sel-chip {
            background: rgba(59,130,246,0.2);
            border: 1px solid rgba(59,130,246,0.45);
            color: #93c5fd;
            font-size: 12px; font-weight: 700;
            padding: 4px 10px; border-radius: 20px;
            display: flex; align-items: center; gap: 5px;
            animation: hmPopIn .2s cubic-bezier(0.34,1.26,0.64,1);
        }
        @keyframes hmPopIn { from {transform:scale(0.7); opacity:0;} to {transform:scale(1); opacity:1;} }
        #hm-hashtag-editor-modal .hm-ht-sel-chip .rm { cursor:pointer; opacity:.7; }
        #hm-hashtag-editor-modal .hm-ht-sel-chip .rm:hover { opacity:1; }
        /* categories */
        #hm-hashtag-editor-modal .hm-ht-cats {
            padding: 0 20px;
        }
        #hm-hashtag-editor-modal .hm-ht-cat {
            margin-bottom: 18px;
        }
        #hm-hashtag-editor-modal .hm-ht-cat-label {
            font-size: 12px; font-weight: 700;
            color: rgba(255,255,255,0.4);
            text-transform: uppercase; letter-spacing: .07em;
            margin-bottom: 10px;
        }
        #hm-hashtag-editor-modal .hm-ht-pills-row {
            display: flex; flex-wrap: wrap; gap: 8px;
        }
        #hm-hashtag-editor-modal .hm-ht-pill {
            background: rgba(255,255,255,0.06);
            border: 1.5px solid rgba(255,255,255,0.1);
            color: rgba(255,255,255,0.75);
            padding: 7px 14px; border-radius: 20px;
            font-size: 13px; font-weight: 600;
            cursor: pointer; font-family: inherit;
            transition: all .2s;
        }
        #hm-hashtag-editor-modal .hm-ht-pill.active {
            background: rgba(59,130,246,0.18);
            border-color: #3b82f6;
            color: #93c5fd;
        }
        #hm-hashtag-editor-modal .hm-ht-pill.maxed:not(.active) {
            opacity: 0.35; cursor: not-allowed;
        }
        /* footer */
        #hm-hashtag-editor-modal .hm-ht-footer {
            display: flex; gap: 10px;
            padding: 20px 20px 0;
        }
        #hm-hashtag-editor-modal .hm-ht-btn-cancel {
            flex: 1; background: rgba(255,255,255,0.06);
            border: 1px solid rgba(255,255,255,0.09);
            color: rgba(255,255,255,0.55);
            padding: 14px; border-radius: 22px;
            font-weight: 700; font-size: 15px;
            cursor: pointer; font-family: inherit;
        }
        #hm-hashtag-editor-modal .hm-ht-btn-save {
            flex: 1.5; background: linear-gradient(135deg, #3b82f6, #6366f1);
            border: none; color: #fff;
            padding: 14px; border-radius: 22px;
            font-weight: 800; font-size: 15px;
            cursor: pointer; font-family: inherit;
            box-shadow: 0 6px 20px rgba(59,130,246,0.3);
            transition: opacity .2s;
        }
        #hm-hashtag-editor-modal .hm-ht-btn-save:active { opacity:.8; }
    </style>

    <div class="hm-ht-sheet">
        <div class="hm-ht-handle"></div>
        <div class="hm-ht-top">
            <span class="hm-ht-top-title">✏️ Modifier la bio</span>
            <button class="hm-ht-close" id="hm-ht-close-btn"><i class="fas fa-times"></i></button>
        </div>

        <!-- Bio textarea -->
        <div class="hm-ht-bio-wrap">
            <span class="hm-ht-bio-label">Bio (texte libre)</span>
            <textarea class="hm-ht-bio-input" id="hm-ht-bio-textarea" rows="3" maxlength="160" placeholder="Décris-toi en quelques mots...">${escapeHtml(currentBio)}</textarea>
            <div class="hm-ht-counter" id="hm-ht-bio-counter">${currentBio.length}/160</div>
        </div>

        <!-- Selected tags preview -->
        <div class="hm-ht-selected-preview" id="hm-ht-sel-preview">
            ${selectedTags.length === 0
                ? `<span class="hm-ht-sel-empty">Aucun hashtag sélectionné (max ${MAX_TAGS})</span>`
                : selectedTags.map(t => `<span class="hm-ht-sel-chip">${escapeHtml(t)} <span class="rm" data-remove="${t.replace(/"/g,'&quot;')}">✕</span></span>`).join('')
            }
        </div>

        <!-- Categories -->
        <div class="hm-ht-cats" id="hm-ht-cats-container">
            ${buildCategoryHtml()}
        </div>

        <!-- Footer -->
        <div class="hm-ht-footer">
            <button class="hm-ht-btn-cancel" id="hm-ht-cancel-btn">Annuler</button>
            <button class="hm-ht-btn-save" id="hm-ht-save-btn"><i class="fas fa-check" style="margin-right:6px;"></i>Enregistrer</button>
        </div>
    </div>
    `;

    document.body.appendChild(modal);
    const _htBottomNav = document.querySelector('.bottom-nav');
    if (_htBottomNav) _htBottomNav.style.display = 'none';

    function _htClose() {
        modal.remove();
        if (_htBottomNav) _htBottomNav.style.display = '';
    }

    // helpers
    function renderPreview() {
        const preview = modal.querySelector('#hm-ht-sel-preview');
        if (selectedTags.length === 0) {
            preview.innerHTML = `<span class="hm-ht-sel-empty">Aucun hashtag sélectionné (max ${MAX_TAGS})</span>`;
        } else {
            preview.innerHTML = selectedTags.map(t =>
                `<span class="hm-ht-sel-chip">${escapeHtml(t)} <span class="rm" data-remove="${t.replace(/"/g,'&quot;')}">✕</span></span>`
            ).join('');
            // remove click
            preview.querySelectorAll('.rm').forEach(rmEl => {
                rmEl.addEventListener('click', () => {
                    selectedTags = selectedTags.filter(s => s !== rmEl.dataset.remove);
                    renderPreview();
                    renderPills();
                });
            });
        }
    }

    function renderPills() {
        const isMax = selectedTags.length >= MAX_TAGS;
        modal.querySelectorAll('.hm-ht-pill').forEach(pill => {
            const tag = pill.dataset.tag;
            const active = selectedTags.includes(tag);
            pill.classList.toggle('active', active);
            pill.classList.toggle('maxed', isMax && !active);
        });
    }

    // pill clicks
    modal.querySelector('#hm-ht-cats-container').addEventListener('click', e => {
        const pill = e.target.closest('.hm-ht-pill');
        if (!pill) return;
        const tag = pill.dataset.tag;
        if (selectedTags.includes(tag)) {
            selectedTags = selectedTags.filter(s => s !== tag);
        } else {
            if (selectedTags.length >= MAX_TAGS) return;
            selectedTags.push(tag);
        }
        renderPreview();
        renderPills();
    });

    // bio counter
    const bioTextarea = modal.querySelector('#hm-ht-bio-textarea');
    const bioCounter = modal.querySelector('#hm-ht-bio-counter');
    bioTextarea.addEventListener('input', () => {
        const len = bioTextarea.value.length;
        bioCounter.textContent = `${len}/160`;
        bioCounter.classList.toggle('warn', len > 130);
    });

    // close
    modal.querySelector('#hm-ht-close-btn').addEventListener('click', () => _htClose());
    modal.querySelector('#hm-ht-cancel-btn').addEventListener('click', () => _htClose());
    modal.addEventListener('click', e => { if (e.target === modal) _htClose(); });

    // save
    modal.querySelector('#hm-ht-save-btn').addEventListener('click', async () => {
        const saveBtn = modal.querySelector('#hm-ht-save-btn');
        const newBio = bioTextarea.value.trim();

        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        saveBtn.disabled = true;

        try {
            const { error } = await sb.from('profiles')
                .update({ bio: newBio || null, hashtags: selectedTags })
                .eq('user_id', user.id);

            if (error) throw error;

            // update local state
            profile.bio = newBio;
            profile.hashtags = selectedTags;
            if (currentUserProfile) {
                currentUserProfile.bio = newBio;
                currentUserProfile.hashtags = selectedTags;
            }

            // update DOM directly without full reload
            const bioTextEl = document.getElementById('profil-bio-text');
            if (bioTextEl) {
                if (newBio) {
                    bioTextEl.className = 'hm-bio-text';
                    bioTextEl.textContent = newBio;
                } else {
                    bioTextEl.className = 'hm-bio-empty';
                    bioTextEl.textContent = 'Ajoutez une biographie ou des hashtags pour vous décrire ✨';
                }
            }

            const hashtagsRow = document.getElementById('hm-hashtags-row');
            if (hashtagsRow) {
                if (selectedTags.length > 0) {
                    hashtagsRow.innerHTML = selectedTags.map(h =>
                        `<span class="hm-hashtag-chip">${escapeHtml(h)}</span>`
                    ).join('');
                } else {
                    hashtagsRow.innerHTML = '';
                }
            }

            _htClose();
            showToast('✅ Bio et hashtags mis à jour !');
        } catch (err) {
            console.error('Erreur hashtags:', err);
            alert('Erreur lors de la sauvegarde : ' + err.message);
            saveBtn.innerHTML = '<i class="fas fa-check" style="margin-right:6px;"></i>Enregistrer';
            saveBtn.disabled = false;
        }
    });
}

// تحديث آخر ظهور عند إخفاء الصفحة أو مغادرتها
window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && currentUser) {
        updateLastSeenInDB();
    }
});

// تحديث التوقيت النسبي - متوقف عند إخفاء الصفحة لتوفير البطارية
function updateRelativeTimes() {
    if (document.visibilityState === 'hidden') return; // لا تشغل لما الصفحة مخفية
    document.querySelectorAll('.card-status-text').forEach(el => {
        if (!el.classList.contains('online')) {
            const card = el.closest('.user-card');
            const userId = card ? card.getAttribute('data-user-id') : null;
            const lastSeen = userId ? lastSeenTimeMap.get(userId) : (el.getAttribute('data-last-seen') || el.getAttribute('data-created-at'));
            if (lastSeen) {
                el.textContent = `Dernière visite : ${formatRelativeTime(lastSeen)}`;
            }
        }
    });
    // وتحديث ترويسة الشات المفتوح حالياً إذا كان غير متصل
    if (activeChatUserId) {
        const chatStatusEl = document.getElementById('chat-user-status');
        if (chatStatusEl && chatStatusEl.textContent !== 'En ligne') {
            const lastSeen = lastSeenTimeMap.get(activeChatUserId) || (activeChatUserProfile ? activeChatUserProfile.created_at : null);
            if (lastSeen) {
                chatStatusEl.textContent = `Dernière visite : ${formatRelativeTime(lastSeen)}`;
            }
        }
    }
}
setInterval(updateRelativeTimes, 120000); // كل 120 ثانية

// === نافذة الفلترة المتقدمة ===
function openAdvancedFilterModal(profiles, listContainer) {
    // إزالة أي مودال موجود مسبقاً
    const existing = document.getElementById('adv-filter-modal');
    if (existing) existing.remove();

    const initialSearchBg = currentGenderFilter === 'female'
        ? '#ec4899'
        : currentGenderFilter === 'male'
            ? '#3b82f6'
            : 'linear-gradient(135deg, #3b82f6, #ec4899)';

    const modal = document.createElement('div');
    modal.id = 'adv-filter-modal';
    modal.style.cssText = [
        'position:fixed',
        'inset:0',
        'background:rgba(0,0,0,0.72)',
        'z-index:2000',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'padding:20px',
        'animation:fadeInModal 0.2s ease',
    ].join(';');

    modal.innerHTML = `
    <style>
        @keyframes haymoi-modal-pop {
            from { transform: scale(0.85); opacity: 0; }
            to   { transform: scale(1);    opacity: 1; }
        }
        #adv-filter-modal .hm-card {
            width: 100%;
            max-width: 400px;
            background: rgba(20, 20, 26, 0.98);
            border: 1px solid rgba(255,255,255,0.09);
            border-radius: 38px;
            overflow: hidden;
            color: #fff;
            animation: haymoi-modal-pop 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        /* ── التبويبات ── */
        #adv-filter-modal .hm-tabs {
            display: flex;
            border-bottom: 1px solid rgba(255,255,255,0.06);
            padding: 0 4px;
        }
        #adv-filter-modal .hm-tab {
            flex: 1;
            background: none;
            border: none;
            color: #64748b;
            font-weight: 700;
            font-size: 14px;
            padding: 16px 8px 13px;
            cursor: pointer;
            position: relative;
            transition: color 0.2s;
            font-family: inherit;
        }
        #adv-filter-modal .hm-tab.active { color: #fff; }
        #adv-filter-modal .hm-tab.active::after {
            content: '';
            position: absolute;
            bottom: -1px;
            left: 10%;
            width: 80%;
            height: 2.5px;
            background: #3b82f6;
            border-radius: 10px;
            box-shadow: 0 0 8px #3b82f6;
        }
        /* ── pills الجنس ── */
        #adv-filter-modal .hm-pills {
            display: flex;
            gap: 9px;
            margin-bottom: 22px;
        }
        #adv-filter-modal .hm-pill {
            flex: 1;
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.1);
            color: rgba(255,255,255,0.75);
            padding: 11px 6px;
            border-radius: 20px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.25s;
            font-family: inherit;
            text-align: center;
        }
        #adv-filter-modal .hm-pill.active {
            background: #fff;
            color: #000;
            border-color: #fff;
        }
        /* ── label فوق الـ select ── */
        #adv-filter-modal .hm-label {
            display: block;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: rgba(255,255,255,0.38);
            margin-bottom: 9px;
        }
        /* ── select المسافة ── */
        #adv-filter-modal .hm-select {
            width: 100%;
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.1);
            color: #fff;
            padding: 12px 18px;
            border-radius: 18px;
            font-size: 14px;
            outline: none;
            appearance: none;
            cursor: pointer;
            font-family: inherit;
            margin-bottom: 20px;
        }
        #adv-filter-modal .hm-select option { background:#1a1a22; }
        /* ── بطاقة VIP ── */
        #adv-filter-modal .hm-vip {
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: linear-gradient(135deg, rgba(251,191,36,0.09), rgba(20,20,22,0.85));
            border: 1px solid rgba(251,191,36,0.28);
            border-radius: 22px;
            padding: 14px 18px;
            margin-bottom: 28px;
            cursor: pointer;
        }
        #adv-filter-modal .hm-vip-label {
            display: flex;
            align-items: center;
            gap: 9px;
            color: #fbbf24;
            font-weight: 800;
            font-size: 13px;
        }
        /* ── Toggle iOS ── */
        #adv-filter-modal .hm-toggle-wrap {
            position: relative;
            width: 44px;
            height: 26px;
            flex-shrink: 0;
        }
        #adv-filter-modal .hm-toggle-wrap input {
            opacity: 0;
            width: 0;
            height: 0;
            position: absolute;
        }
        #adv-filter-modal .hm-toggle-track {
            position: absolute;
            inset: 0;
            background: rgba(255,255,255,0.15);
            border-radius: 13px;
            transition: background 0.3s;
        }
        #adv-filter-modal .hm-toggle-wrap input:checked + .hm-toggle-track {
            background: #fbbf24;
        }
        #adv-filter-modal .hm-toggle-thumb {
            position: absolute;
            top: 3px;
            left: 3px;
            width: 20px;
            height: 20px;
            background: #fff;
            border-radius: 50%;
            transition: transform 0.3s cubic-bezier(0.175,0.885,0.32,1.275);
            pointer-events: none;
        }
        #adv-filter-modal .hm-toggle-wrap input:checked ~ .hm-toggle-thumb {
            transform: translateX(18px);
        }
        /* ── أزرار الأكشن ── */
        #adv-filter-modal .hm-footer {
            display: flex;
            gap: 12px;
        }
        #adv-filter-modal .hm-btn-cancel {
            flex: 1;
            background: rgba(255,255,255,0.06);
            border: 1px solid rgba(255,255,255,0.09);
            color: rgba(255,255,255,0.55);
            padding: 14px;
            border-radius: 22px;
            font-weight: 700;
            font-size: 15px;
            cursor: pointer;
            font-family: inherit;
            transition: background 0.2s;
        }
        #adv-filter-modal .hm-btn-cancel:hover { background: rgba(255,255,255,0.1); }
        #adv-filter-modal .hm-btn-search {
            flex: 1.5;
            border: none;
            color: #fff;
            padding: 14px;
            border-radius: 22px;
            font-weight: 800;
            font-size: 15px;
            cursor: pointer;
            font-family: inherit;
            transition: background 0.4s, box-shadow 0.4s;
            box-shadow: 0 8px 20px rgba(59,130,246,0.25);
        }
    </style>

    <div class="hm-card">
        <!-- التبويبات -->
        <div class="hm-tabs">
            <button class="hm-tab active" data-tab="simple">Simple</button>
            <button class="hm-tab" data-tab="advanced">Avancé</button>
            <button class="hm-tab" data-tab="id">Par ID</button>
        </div>

        <div style="padding:24px 22px 22px;">
            <!-- الجنس -->
            <span class="hm-label">Genre</span>
            <div class="hm-pills">
                <button class="hm-pill ${currentGenderFilter === 'all' ? 'active' : ''}" data-val="all">Tous</button>
                <button class="hm-pill ${currentGenderFilter === 'female' ? 'active' : ''}" data-val="female">
                    <i class="fas fa-venus" style="color:#ec4899;margin-right:4px;"></i>Femmes
                </button>
                <button class="hm-pill ${currentGenderFilter === 'male' ? 'active' : ''}" data-val="male">
                    <i class="fas fa-mars" style="color:#3b82f6;margin-right:4px;"></i>Hommes
                </button>
            </div>

            <!-- المسافة -->
            <span class="hm-label">Distance maximale</span>
            <div style="position:relative;">
                <select id="adv-dist" class="hm-select">
                    <option value="10"    ${currentDistanceFilter === 10 ? 'selected' : ''}>10 km</option>
                    <option value="50"    ${currentDistanceFilter === 50 ? 'selected' : ''}>50 km</option>
                    <option value="100"   ${currentDistanceFilter === 100 ? 'selected' : ''}>100 km</option>
                    <option value="500"   ${currentDistanceFilter === 500 ? 'selected' : ''}>500 km</option>
                    <option value="10000" ${currentDistanceFilter === 10000 ? 'selected' : ''}>Toute distance</option>
                </select>
                <i class="fas fa-chevron-down" style="position:absolute;right:16px;top:50%;transform:translateY(-50%);color:rgba(255,255,255,0.35);font-size:12px;pointer-events:none;"></i>
            </div>

            <!-- VIP -->
            <div class="hm-vip" id="adv-vip-card">
                <div class="hm-vip-label">
                    <i class="fas fa-gem"></i>
                    Réservé aux membres VIP
                </div>
                <label class="hm-toggle-wrap">
                    <input type="checkbox" id="adv-verified" ${requireVerifiedFilter ? 'checked' : ''}>
                    <div class="hm-toggle-track"></div>
                    <div class="hm-toggle-thumb"></div>
                </label>
            </div>

            <!-- الأزرار -->
            <div class="hm-footer">
                <button class="hm-btn-cancel" id="adv-cancel">Annuler</button>
                <button class="hm-btn-search" id="adv-search" style="background:${initialSearchBg};">Rechercher</button>
            </div>
        </div>
    </div>
    `;

    document.body.appendChild(modal);

    // ── منطق التبويبات (ديكوراتيف - Simple هو الافتراضي) ──
    modal.querySelectorAll('.hm-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            modal.querySelectorAll('.hm-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
        });
    });

    // ── منطق pills الجنس ──
    const pillBtns = modal.querySelectorAll('.hm-pill');
    let tempGender = currentGenderFilter;
    pillBtns.forEach(pill => {
        pill.addEventListener('click', () => {
            pillBtns.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            tempGender = pill.getAttribute('data-val');

            const searchBtn = modal.querySelector('#adv-search');
            if (tempGender === 'female') {
                searchBtn.style.background = '#ec4899';
                searchBtn.style.boxShadow = '0 8px 20px rgba(236,72,153,0.3)';
            } else if (tempGender === 'male') {
                searchBtn.style.background = '#3b82f6';
                searchBtn.style.boxShadow = '0 8px 20px rgba(59,130,246,0.3)';
            } else {
                searchBtn.style.background = 'linear-gradient(135deg, #3b82f6, #ec4899)';
                searchBtn.style.boxShadow = '0 8px 20px rgba(59,130,246,0.25)';
            }
        });
    });

    // ── إغلاق بالضغط على الخلفية ──
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });

    modal.querySelector('#adv-cancel').addEventListener('click', () => modal.remove());

    modal.querySelector('#adv-search').addEventListener('click', () => {
        currentGenderFilter = tempGender;
        currentDistanceFilter = parseInt(modal.querySelector('#adv-dist').value);
        requireVerifiedFilter = modal.querySelector('#adv-verified').checked;
        modal.remove();
        renderFilteredList(profiles, listContainer);
    });
}
