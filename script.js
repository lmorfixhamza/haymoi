const SUPABASE_URL = 'https://lytiyycerpoogkgqofpk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5dGl5eWNlcnBvb2drZ3FvZnBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyNzQ5OTksImV4cCI6MjA5Njg1MDk5OX0.bgv9vL0Pb4Xp8wyAR65DrPiGe-rELBL9JqikHgzZLUQ';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// === نظام تتبع الأخطاء البرمجية (Debug System) ===
function debugLog(message, isError = false) {
    console.log("[HayMoi Debug]", message);
    const debugBox = document.getElementById('app-debug-log');
    if (debugBox) {
        const line = document.createElement('div');
        line.style.color = isError ? '#ef4444' : '#22c55e';
        line.style.marginBottom = '4px';
        line.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
        line.style.paddingBottom = '2px';
        line.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        debugBox.appendChild(line);
        debugBox.scrollTop = debugBox.scrollHeight;
    }
}

function initDebugBox() {
    if (!path.includes('app.html')) return;
    if (document.getElementById('app-debug-log')) return;
    
    const box = document.createElement('div');
    box.id = 'app-debug-log';
    box.style.cssText = 'position: fixed; bottom: 80px; left: 10px; right: 10px; height: 180px; background: rgba(15, 23, 42, 0.95); border: 1px solid rgba(239, 68, 68, 0.5); border-radius: 12px; padding: 10px; overflow-y: auto; font-family: monospace; font-size: 11px; z-index: 99999; color: #fff; direction: ltr; text-align: left; display: none; box-shadow: 0 4px 20px rgba(0,0,0,0.5);';
    
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'toggle-debug-btn';
    toggleBtn.style.cssText = 'position: fixed; bottom: 85px; right: 20px; background: #ef4444; color: white; border: none; border-radius: 20px; padding: 6px 12px; font-size: 11px; font-weight: bold; cursor: pointer; z-index: 100000; box-shadow: 0 4px 10px rgba(0,0,0,0.5);';
    toggleBtn.textContent = 'Toggle Debug';
    toggleBtn.addEventListener('click', () => {
        const isHidden = box.style.display === 'none';
        box.style.display = isHidden ? 'block' : 'none';
    });
    
    document.body.appendChild(box);
    document.body.appendChild(toggleBtn);
    debugLog("Debug Panel Initialized successfully.");
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
        alert("يجب تفعيل صلاحية الوصول للموقع الجغرافي لاستخدام التطبيق. سيتم تسجيل خروجك الآن.");
        if (typeof handleLogout === 'function') handleLogout();
        return; // Stop loading app data so they can't enter
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
const isIndexPage   = path.includes('index') || path === '/' || path.endsWith('/') || path === '';
const isSetupPage   = path.includes('profile-setup');
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
        return 'الآن';
    } else if (diffMin < 60) {
        return `منذ ${diffMin} د`;
    } else if (diffHr < 24) {
        return `منذ ${diffHr} س`;
    } else if (diffDay === 1) {
        return 'أمس';
    } else if (diffDay === 2) {
        return 'قبل يومين';
    } else if (diffDay < 7) {
        return `منذ ${diffDay} أيام`;
    } else {
        return date.toLocaleDateString('ar-MA', { month: 'numeric', day: 'numeric' });
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
        const emailEl = document.getElementById('profile-email');
        if (emailEl) {
            emailEl.textContent = user.email || '';
        }

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
    lastSeenHeartbeatInterval = setInterval(updateLastSeenInDB, 30000); // تحديث كل 30 ثانية
}

function stopLastSeenHeartbeat() {
    if (lastSeenHeartbeatInterval) {
        clearInterval(lastSeenHeartbeatInterval);
        lastSeenHeartbeatInterval = null;
    }
}

// === نظام التتبع الفوري لحالة الاتصال (Supabase Presence) ===
let onlineUsers = new Set();
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
            } else {
                if (dot) dot.remove();
                if (statusTextEl) {
                    // إذا كان متصلاً والآن خرج، نحدث آخر ظهور ليكون الوقت الحالي
                    if (statusTextEl.classList.contains('online')) {
                        statusTextEl.setAttribute('data-last-seen', new Date().toISOString());
                    }
                    const lastSeen = statusTextEl.getAttribute('data-last-seen') || statusTextEl.getAttribute('data-created-at');
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
            } else {
                chatStatusEl.textContent = 'غير متصل';
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
    window.switchAppView = function(viewId) {
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

        // إظهار/إخفاء الشريط العلوي (يظهر في قسم الاستكشاف وقسم المحادثات وجهات الاتصال)
        if (appHeader) {
            const showHeader = viewId === 'trouver' || viewId === 'chats' || viewId === 'contacts';
            appHeader.style.display = showHeader ? 'flex' : 'none';
            
            const headerTitle = document.getElementById('header-title');
            if (headerTitle) {
                if (viewId === 'trouver') {
                    headerTitle.textContent = 'Trouver';
                } else if (viewId === 'chats') {
                    headerTitle.textContent = 'Chats';
                } else if (viewId === 'contacts') {
                    headerTitle.textContent = 'Contacts';
                }
            }

            // إظهار أو إخفاء أيقونات الهيدر حسب طلب المستخدم
            const headerAvatar = document.getElementById('header-user-avatar');
            const notifBell = document.getElementById('notif-bell-btn');
            const tabSearch = document.getElementById('tab-search');
            const tabGroups = document.getElementById('tab-groups');
            const tabVip = document.getElementById('tab-vip');

            if (viewId === 'trouver') {
                if (headerAvatar) headerAvatar.style.display = '';
                if (notifBell) notifBell.style.display = '';
                if (tabSearch) tabSearch.style.display = '';
                if (tabGroups) tabGroups.style.display = '';
                if (tabVip) tabVip.style.display = '';
            } else if (viewId === 'chats' || viewId === 'contacts') {
                if (headerAvatar) headerAvatar.style.display = 'none'; // إخفاء الأفاتار بالكامل ليتنحى العنوان لليسار
                if (notifBell) notifBell.style.display = 'none'; // إخفاء الجرس
                if (tabSearch) tabSearch.style.display = ''; // إبقاء البحث
                if (tabGroups) tabGroups.style.display = 'none'; // إخفاء القلب
                if (tabVip) tabVip.style.display = 'none'; // إخفاء الجوهرة
            }
        }

        // إذا انتقل لقسم الدردشات، نحمل المحادثات النشطة
        if (viewId === 'chats') {
            loadActiveChats();
        }

        // شبكة أمان: إعادة تحميل الأعضاء عند الانتقال لقسم الاستكشاف
        if (viewId === 'trouver' && currentUser) {
            debugLog('switchView: trouver tab selected, reloading discovery users...');
            loadDiscoveryUsers(currentUser);
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
            const age = calculateAge(profile.dob);
            const genderText = profile.gender === 'male' ? 'ذكر' : profile.gender === 'female' ? 'أنثى' : '-';
            const genderIcon = profile.gender === 'male' ? 'fa-mars' : 'fa-venus';
            const genderColor = profile.gender === 'male' ? '#00d2ff' : '#ff6b81';
            const initial = (profile.full_name || 'H').charAt(0).toUpperCase();

            // تحديث صورتنا الشخصية في الترويسة العلوية
            const headerAvatar = document.getElementById('header-user-avatar');
            if (headerAvatar) {
                if (profile.avatar_url) {
                    headerAvatar.innerHTML = `<img src="${profile.avatar_url}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
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
                    <div class="profil-bio-section" style="margin-top: 15px; border-top: 1px solid rgba(255, 255, 255, 0.05); padding-top: 15px; text-align: right; width: 100%;">
                        <h4 style="margin-bottom: 10px;"><i class="fas fa-info-circle"></i> معلومات إضافية</h4>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 13.5px; color: var(--text-muted);">
                            ${profile.height ? `<div><strong style="color:var(--text-white);">الطول:</strong> ${escapeHtml(profile.height)}</div>` : ''}
                            ${profile.residence ? `<div><strong style="color:var(--text-white);">الإقامة:</strong> ${escapeHtml(profile.residence)}</div>` : ''}
                            ${profile.profession ? `<div><strong style="color:var(--text-white);">المهنة:</strong> ${escapeHtml(profile.profession)}</div>` : ''}
                            ${profile.company ? `<div><strong style="color:var(--text-white);">الشركة:</strong> ${escapeHtml(profile.company)}</div>` : ''}
                            ${profile.income ? `<div><strong style="color:var(--text-white);">الدخل:</strong> ${escapeHtml(profile.income)}</div>` : ''}
                            ${profile.body_type ? `<div><strong style="color:var(--text-white);">بنية الجسم:</strong> ${escapeHtml(profile.body_type)}</div>` : ''}
                            ${profile.ethnicity ? `<div><strong style="color:var(--text-white);">الأصل:</strong> ${escapeHtml(profile.ethnicity)}</div>` : ''}
                            ${profile.hair_color ? `<div><strong style="color:var(--text-white);">الشعر:</strong> ${escapeHtml(profile.hair_color)}</div>` : ''}
                        </div>
                    </div>
                `;
            }

            const avatarDisplay = profile.avatar_url 
                ? `<img src="${profile.avatar_url}" alt="" loading="lazy">`
                : initial;

            container.innerHTML = `
                <div class="profil-card">
                    <div class="profil-avatar-ring">
                        <div class="profil-avatar-letter" style="border-color: ${genderColor};">${avatarDisplay}</div>
                        <button class="profil-avatar-change-btn" id="change-avatar-btn" title="تغيير الصورة">
                            <i class="fas fa-camera"></i>
                        </button>
                        <input type="file" id="avatar-file-input" accept="image/*" style="display:none;">
                    </div>
                    <h2 class="profil-name">
                        ${profile.full_name || 'مستخدم HayMoi'}
                        ${profile.is_vip ? ' <i class="fas fa-gem" style="color: #fbbf24; font-size: 14px; margin-right: 6px;" title="عضو VIP"></i>' : ''}
                    </h2>
                    <p class="profil-email">${user.email || ''}</p>
                    <div class="profil-stats">
                        <div class="stat-item">
                            <i class="fas ${genderIcon}" style="color: ${genderColor};"></i>
                            <span>${genderText}</span>
                        </div>
                        <div class="stat-divider"></div>
                        <div class="stat-item">
                            <i class="fas fa-calendar-day" style="color: var(--color-primary);"></i>
                            <span>${age} سنة</span>
                        </div>
                    </div>
                    <div class="profil-bio-section">
                        <h4><i class="fas fa-comment-dots"></i> نبذة عني</h4>
                        <p>${profile.bio || 'لا توجد نبذة شخصية بعد.'}</p>
                    </div>
                    ${ownExtraSection}
                    <button id="edit-profile-btn" class="btn btn-submit" style="background: rgba(255, 255, 255, 0.08); color: var(--text-white); margin-bottom: 10px; border: 1px solid rgba(255,255,255,0.1);"><i class="fas fa-edit"></i> تعديل البروفايل</button>
                    <button id="logout-btn-app" class="btn btn-logout"><i class="fas fa-sign-out-alt"></i> تسجيل الخروج</button>
                </div>
            `;

            // ربط زر تعديل البروفايل وزر تسجيل الخروج
            const editBtn = document.getElementById('edit-profile-btn');
            if (editBtn) {
                editBtn.addEventListener('click', () => {
                    window.location.href = 'profile-setup.html';
                });
            }

            const logoutBtnApp = document.getElementById('logout-btn-app');
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
                        showToastNotification(null, 'تم التحديث', 'تم تغيير صورتك الشخصية بنجاح!', 'system');
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
        container.innerHTML = '<p style="text-align:center; color: var(--text-muted);">حدث خطأ أثناء تحميل البيانات.</p>';
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
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
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
    if (activeTopTab !== 'search' || !container.querySelector('.search-filter-container')) {
        container.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; padding:40px 0; gap:12px;">
                <div class="loading-spinner"></div>
                <p style="color:var(--text-muted); font-size:13px;">جاري تحميل الأعضاء القريبين...</p>
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
                    <p style="color:var(--text-muted); font-size:14px;">لا يوجد أعضاء بعد.<br>كن أول من يدعو أصدقاءه!</p>
                </div>
            `;
            return;
        }

        // تصفية التكرارات (إبقاء البروفايل الأول الفريد لكل مستخدم)
        const uniqueProfiles = [];
        const seenUserIds = new Set();
        profiles.forEach(p => {
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
        renderDiscoveryView(filteredProfiles, container);

    } catch (err) {
        console.error("خطأ أثناء جلب الأعضاء:", err);
        debugLog("loadDiscoveryUsers: Error fetching profiles: " + err.message, true);
        container.innerHTML = `<p style="text-align:center; color:var(--text-muted); padding:40px 0;">حدث خطأ أثناء تحميل الأعضاء.</p>`;
    }
}

// دالة رسم المحتوى حسب التبويب العلوي النشط
function renderDiscoveryView(profiles, container) {
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

    // عرض حقل البحث والفلتر دائماً في الأعلى
    const searchBar = document.createElement('div');
    searchBar.className = 'search-filter-container';
    searchBar.innerHTML = `
        <div style="display:flex; gap:12px; align-items:center;">
            <button id="advanced-filter-btn" style="width:48px; height:48px; border-radius:18px; background:rgba(255, 255, 255, 0.05); border:1px solid rgba(255, 255, 255, 0.08); color:white; font-size:18px; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:0.2s; flex-shrink:0;">
                <i class="fas fa-filter"></i>
            </button>
            <div class="search-input-wrapper" style="flex:1;">
                <i class="fas fa-search search-icon"></i>
                <input type="text" id="discovery-search-input" placeholder="ابحث بواسطة الـ ID..." value="${escapeHtml(searchFilterQuery)}" autocomplete="off">
                ${searchFilterQuery ? '<button id="clear-search-btn" style="background:none; border:none; color:var(--text-muted); cursor:pointer;"><i class="fas fa-times"></i></button>' : ''}
            </div>
        </div>
    `;
    container.appendChild(searchBar);

    // حاوية تصفية النتائج
    const listContainer = document.createElement('div');
    listContainer.className = 'users-list-sub-container';
    container.appendChild(listContainer);

    const input = searchBar.querySelector('#discovery-search-input');
    
    input.addEventListener('input', (e) => {
        searchFilterQuery = e.target.value;
        renderFilteredList(profiles, listContainer);
        
        // تحديث زر الحذف
        let clearBtn = searchBar.querySelector('#clear-search-btn');
        if (searchFilterQuery) {
            if (!clearBtn) {
                clearBtn = document.createElement('button');
                clearBtn.id = 'clear-search-btn';
                clearBtn.style.cssText = 'background:none; border:none; color:var(--text-muted); cursor:pointer;';
                clearBtn.innerHTML = '<i class="fas fa-times"></i>';
                searchBar.querySelector('.search-input-wrapper').appendChild(clearBtn);
                clearBtn.addEventListener('click', () => {
                    searchFilterQuery = '';
                    input.value = '';
                    renderFilteredList(profiles, listContainer);
                    clearBtn.remove();
                });
            }
        } else {
            if (clearBtn) clearBtn.remove();
        }
    });

    // فتح نافذة الفلترة المتقدمة
    searchBar.querySelector('#advanced-filter-btn').addEventListener('click', () => {
        openAdvancedFilterModal(profiles, listContainer);
    });

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
        filtered = filtered.filter(p => p.is_vip);
    }
    
    if (query) {
        filtered = filtered.filter(p => {
            const name = (p.full_name || '').toLowerCase();
            const bio = (p.bio || '').toLowerCase();
            const residence = (p.residence || '').toLowerCase();
            const profession = (p.profession || '').toLowerCase();
            const userId = (p.user_id || '').toLowerCase();
            return userId.includes(query);
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
    const bio = profile.bio || 'لا يوجد وصف';
    const isOnline = onlineUsers.has(profile.user_id);

    // حساب وسيلة التسجيل بشكل تلقائي وجمالي ليطابق لقطة الشاشة
    let provider = 'google';
    if (profile.email) {
        if (profile.email.includes('gmail')) provider = 'google';
        else if (profile.email.includes('facebook') || profile.email.includes('fb')) provider = 'facebook';
        else if (profile.email.includes('tiktok')) provider = 'tiktok';
    } else {
        const hash = profile.user_id ? profile.user_id.charCodeAt(0) + (profile.full_name ? profile.full_name.charCodeAt(0) : 0) : index;
        const providers = ['facebook', 'google', 'tiktok'];
        provider = providers[hash % providers.length];
    }

    let socialIconHtml = '';
    if (provider === 'facebook') {
        socialIconHtml = `<span class="social-badge facebook" title="سجل عبر Facebook"><i class="fab fa-facebook-f"></i></span>`;
    } else if (provider === 'google') {
        socialIconHtml = `<span class="social-badge google" title="سجل عبر Google"><i class="fab fa-google"></i></span>`;
    } else if (provider === 'tiktok') {
        socialIconHtml = `<span class="social-badge tiktok" title="سجل عبر TikTok"><i class="fab fa-tiktok"></i></span>`;
    }

    // حساب المسافة بدقة مع الأيقونة
    let distanceTextHTML = '';
    if (currentUserProfile && currentUserProfile.latitude && currentUserProfile.longitude && profile.latitude && profile.longitude) {
        const dist = calculateDistance(currentUserProfile.latitude, currentUserProfile.longitude, profile.latitude, profile.longitude);
        if (dist !== null) {
            const distValue = dist < 1 ? `${Math.round(dist * 1000)}m` : `${dist.toFixed(1)}km`;
            distanceTextHTML = `<span style="display:inline-flex; align-items:center; gap:3px;" dir="ltr"><i class="fas fa-location-dot" style="color: #60a5fa; font-size:10px;"></i>${distValue}</span>`;
        }
    }

    const avatarContent = profile.avatar_url 
        ? `<img src="${profile.avatar_url}" alt="${escapeHtml(profile.full_name || '')}" loading="lazy">`
        : initial;

    const lastSeenTime = profile.last_seen || profile.created_at;
    const statusText = isOnline 
        ? '<span style="color:#22c55e; font-weight:700;">متصل الآن</span>' 
        : formatRelativeTime(lastSeenTime);

    card.innerHTML = `
        <div class="user-avatar-wrapper ${genderClass} ${profile.is_vip ? 'vip-ring' : ''}">
            <div class="user-avatar-inner">
                ${avatarContent}
            </div>
            ${isOnline ? '<span class="online-dot"></span>' : ''}
        </div>
        <div class="user-info">
            <div class="user-name-row">
                <span class="user-name">${escapeHtml(profile.full_name || 'مستخدم')}</span>
                ${profile.is_vip ? '<i class="fas fa-gem card-vip-icon" title="عضو VIP"></i>' : ''}
            </div>
            <div class="user-meta-row">
                <span class="gender-age-pill ${genderClass}">
                    <i class="${profile.gender === 'female' ? 'fas fa-venus' : 'fas fa-mars'}"></i> ${age !== '-' ? age : ''}
                </span>
                ${socialIconHtml}
            </div>
            <p class="user-bio">${escapeHtml(bio)}</p>
            <div class="user-card-bottom">
                <div class="card-actions">
                    <button class="card-action-btn like-btn" title="إعجاب">
                        <i class="far fa-heart"></i>
                    </button>
                    <button class="card-action-btn chat-btn" title="دردشة">
                        <i class="far fa-comment"></i>
                    </button>
                </div>
            </div>
        </div>
        <div class="card-right-stats">
            <span class="distance-text">${distanceTextHTML || '<span dir="ltr"><i class="fas fa-location-dot" style="color: #60a5fa; font-size:10px; margin-right:3px;"></i>?</span>'}</span>
            <span class="card-status-sep"> · </span>
            <span class="card-status-text ${isOnline ? 'online' : ''}" data-created-at="${profile.created_at}" data-last-seen="${lastSeenTime}">${statusText}</span>
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
                    profile.full_name || 'مستخدم',
                    'لقد أرسلت إعجاباً!',
                    'like'
                );
            } else {
                icon.classList.remove('fas');
                icon.classList.add('far');
                likeBtn.classList.remove('liked');
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

    return card;
}

// === فتح نافذة تفاصيل العضو (Modal) ===
function openUserModal(profile) {
    // إزالة أي نافذة سابقة
    const oldModal = document.getElementById('user-detail-modal');
    if (oldModal) oldModal.remove();

    const age = calculateAge(profile.dob);
    const genderClass = profile.gender === 'female' ? 'female' : 'male';
    const genderText = profile.gender === 'male' ? 'ذكر' : profile.gender === 'female' ? 'أنثى' : '-';
    const genderSymbol = profile.gender === 'female' ? '♀' : '♂';
    const initial = (profile.full_name || '?').charAt(0).toUpperCase();

    // حساب المسافة الحقيقية
    let distanceText = '';
    if (currentUserProfile && currentUserProfile.latitude && currentUserProfile.longitude && profile.latitude && profile.longitude) {
        const dist = calculateDistance(currentUserProfile.latitude, currentUserProfile.longitude, profile.latitude, profile.longitude);
        if (dist !== null) {
            if (dist < 1) {
                distanceText = `على بعد ${Math.round(dist * 1000)} متر`;
            } else {
                distanceText = `على بعد ${dist.toFixed(1)} كم`;
            }
        }
    }

    // بناء الصناديق الإضافية للبروفايل
    let extraBoxes = '';
    if (profile.height) {
        extraBoxes += `
            <div class="modal-detail-box">
                <span class="detail-label-modal"><i class="fas fa-arrows-alt-v" style="color:var(--color-primary); margin-left:4px;"></i>الطول</span>
                <span class="detail-value-modal">${escapeHtml(profile.height)}</span>
            </div>
        `;
    }
    if (profile.residence) {
        extraBoxes += `
            <div class="modal-detail-box">
                <span class="detail-label-modal"><i class="fas fa-home" style="color:var(--color-primary); margin-left:4px;"></i>الإقامة</span>
                <span class="detail-value-modal">${escapeHtml(profile.residence)}</span>
            </div>
        `;
    }
    if (profile.profession) {
        extraBoxes += `
            <div class="modal-detail-box">
                <span class="detail-label-modal"><i class="fas fa-briefcase" style="color:var(--color-primary); margin-left:4px;"></i>المهنة</span>
                <span class="detail-value-modal">${escapeHtml(profile.profession)}</span>
            </div>
        `;
    }
    if (profile.company) {
        extraBoxes += `
            <div class="modal-detail-box">
                <span class="detail-label-modal"><i class="fas fa-building" style="color:var(--color-primary); margin-left:4px;"></i>المؤسسة</span>
                <span class="detail-value-modal">${escapeHtml(profile.company)}</span>
            </div>
        `;
    }
    if (profile.income) {
        extraBoxes += `
            <div class="modal-detail-box">
                <span class="detail-label-modal"><i class="fas fa-wallet" style="color:var(--color-primary); margin-left:4px;"></i>الدخل</span>
                <span class="detail-value-modal">${escapeHtml(profile.income)}</span>
            </div>
        `;
    }
    if (profile.body_type) {
        extraBoxes += `
            <div class="modal-detail-box">
                <span class="detail-label-modal"><i class="fas fa-child" style="color:var(--color-primary); margin-left:4px;"></i>البنية</span>
                <span class="detail-value-modal">${escapeHtml(profile.body_type)}</span>
            </div>
        `;
    }
    if (profile.ethnicity) {
        extraBoxes += `
            <div class="modal-detail-box">
                <span class="detail-label-modal"><i class="fas fa-globe" style="color:var(--color-primary); margin-left:4px;"></i>الأصل</span>
                <span class="detail-value-modal">${escapeHtml(profile.ethnicity)}</span>
            </div>
        `;
    }
    if (profile.hair_color) {
        extraBoxes += `
            <div class="modal-detail-box">
                <span class="detail-label-modal"><i class="fas fa-cut" style="color:var(--color-primary); margin-left:4px;"></i>الشعر</span>
                <span class="detail-value-modal">${escapeHtml(profile.hair_color)}</span>
            </div>
        `;
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
                <!-- خلفية ضبابية إذا كانت هناك صورة -->
                ${profile.avatar_url ? `<img src="${profile.avatar_url}" style="position:absolute; top:0; left:0; width:100%; height:100%; object-fit:cover; filter:blur(20px) brightness(0.5); z-index:0;" loading="lazy">` : ''}
                
                <!-- دائرة الصورة المركزية مثل القصص (Stories) -->
                <div style="position:absolute; top:45%; left:50%; transform:translate(-50%, -50%); z-index:1; width:140px; height:140px; border-radius:50%; border:4px solid ${profile.gender === 'female' ? '#ff3399' : '#1a75ff'}; box-shadow:0 0 25px rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; background:#1c1c1e; overflow:hidden;">
                    ${profile.avatar_url ? `<img src="${profile.avatar_url}" style="width:100%; height:100%; object-fit:cover;" loading="lazy">` : `<span style="font-size:60px; color:white; font-weight:bold;">${initial}</span>`}
                </div>

                <!-- طبقة التدرج السفلى لاسم المستخدم -->
                <div style="position:absolute; bottom:0; left:0; right:0; height:150px; background:linear-gradient(to top, #1c1c1e, transparent); padding:20px; display:flex; flex-direction:column; justify-content:flex-end; z-index:2;">
                    <div style="display:flex; align-items:center; gap:8px;" dir="ltr">
                        <h2 style="margin:0; font-size:26px; font-weight:800; color:white; line-height:1.2;">
                            ${escapeHtml(profile.full_name || 'مستخدم')}
                        </h2>
                        <span style="font-size:22px; font-weight:400; color:#e4e4e7; margin-left:6px;">${age !== '-' ? age : ''}</span>
                        ${profile.is_vip ? '<i class="fas fa-gem" style="color: #fbbf24; font-size: 18px;" title="عضو VIP"></i>' : ''}
                    </div>
                    <div style="display:flex; align-items:center; gap:10px; margin-top:6px;">
                        <span class="gender-age-pill ${genderClass}" style="box-shadow:none; padding:2px 8px; font-size:11px;">
                            <i class="${profile.gender === 'female' ? 'fas fa-venus' : 'fas fa-mars'}"></i> ${genderText}
                        </span>
                        ${distanceText ? `<span style="color:#a1a1aa; font-size:13px; display:flex; align-items:center; gap:4px;"><i class="fas fa-location-dot" style="color:var(--color-primary);"></i>${distanceText}</span>` : ''}
                    </div>
                </div>
            </div>

            <!-- التفاصيل السفلية -->
            <div style="padding:20px;">
            <div class="modal-details-grid">
                <div class="modal-detail-box">
                    <span class="detail-label-modal">الجنس</span>
                    <span class="detail-value-modal">${genderText}</span>
                </div>
                <div class="modal-detail-box">
                    <span class="detail-label-modal">العمر</span>
                    <span class="detail-value-modal">${age !== '-' ? age : '-'}</span>
                </div>
                ${extraBoxes}
            </div>
            <div class="modal-bio-box">
                <h4><i class="fas fa-comment-dots"></i> نبذة شخصية</h4>
                <p>${profile.bio || 'هذا المستخدم لم يكتب نبذة شخصية بعد.'}</p>
            </div>
            <button class="btn-chat-start" id="btn-start-chat">
                <i class="fas fa-paper-plane"></i>
                بدء محادثة
            </button>
            <div class="modal-action-row">
                <button class="btn-modal-action" id="btn-modal-block">
                    <i class="fas fa-ban"></i> حظر
                </button>
                <button class="btn-modal-action danger" id="btn-modal-report">
                    <i class="fas fa-flag"></i> إبلاغ
                </button>
            </div>
            </div> <!-- نهاية حاوية التفاصيل -->
        </div>
    `;

    document.body.appendChild(modal);

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
        if (confirm(`هل تريد حظر ${profile.full_name || 'هذا المستخدم'}؟\nلن يظهر في قائمتك ولن تستطيع التواصل معه.`)) {
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

    if (chatNameEl) chatNameEl.textContent = receiverProfile.full_name || 'مستخدم';
    if (chatAvatarEl) {
        const initial = (receiverProfile.full_name || '?').charAt(0).toUpperCase();
        const genderClass = receiverProfile.gender === 'female' ? 'female' : 'male';
        chatAvatarEl.className = `chat-user-avatar ${genderClass}`;
        if (receiverProfile.avatar_url) {
            chatAvatarEl.innerHTML = `<img src="${receiverProfile.avatar_url}" alt="" loading="lazy">`;
        } else {
            chatAvatarEl.textContent = initial;
        }
    }
    if (chatStatusEl) {
        const isOnline = onlineUsers.has(receiverProfile.user_id);
        if (isOnline) {
            chatStatusEl.textContent = 'متصل الآن';
            chatStatusEl.style.color = '#22c55e';
        } else {
            const lastSeen = receiverProfile.last_seen || receiverProfile.created_at;
            chatStatusEl.textContent = lastSeen ? `آخر ظهور: ${formatRelativeTime(lastSeen)}` : 'غير متصل';
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
                <i class="fas fa-spinner fa-spin" style="margin-left:8px;"></i> جاري تحميل الرسائل...
            </div>
        `;
    }

    // تحميل الرسائل السابقة
    await loadChatMessages();

    // تعليم كل الرسائل كمقروءة
    markAllMessagesAsRead(receiverProfile.user_id);

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
                    <p style="font-size:13px;">لا توجد رسائل سابقة. ابدأ المحادثة الآن!</p>
                </div>
            `;
        }
        
        // النزول لأسفل الشات تلقائياً
        container.scrollTop = container.scrollHeight;

    } catch (err) {
        console.error("خطأ أثناء جلب الرسائل:", err);
        container.innerHTML = `<p style="text-align:center; color:var(--text-muted); padding:20px;">فشل تحميل الرسائل.</p>`;
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
        alert("فشل إرسال الرسالة: " + err.message);
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
            <img src="${msg.media_url}" alt="صورة" loading="lazy">
            <span class="msg-time">${timeStr} ${readBadge}</span>
        `;
        bubble.querySelector('img').addEventListener('click', () => {
            openImageLightbox(msg.media_url);
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
                <button class="audio-play-btn" data-url="${msg.media_url}" data-playing="false">
                    <i class="fas fa-play"></i>
                </button>
                <div class="audio-waveform">${waveBars}</div>
                <span class="audio-duration">${durationText}</span>
            </div>
            <span class="msg-time">${timeStr} ${readBadge}</span>
        `;
        const playBtn = bubble.querySelector('.audio-play-btn');
        playBtn.addEventListener('click', () => {
            playAudioMessage(playBtn, msg.media_url, bubble);
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
    return str.replace(/[&<>"']/g, function(m) { return map[m]; });
}

// 7. جلب قائمة المحادثات النشطة (Chats Tab)
async function loadActiveChats() {
    const container = document.getElementById('chats-list-container');
    if (!container || !currentUser) return;

    container.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; padding:40px 0; gap:12px;">
            <div class="loading-spinner"></div>
            <p style="color:var(--text-muted); font-size:13px;">جاري تحميل المحادثات...</p>
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
                    <p style="color:var(--text-muted); font-size:14px;">لا توجد محادثات نشطة حالياً.<br>ابدأ الدردشة مع أشخاص قريبين منك!</p>
                </div>
            `;
            return;
        }

        // استخراج قائمة المستخدمين الفريدين وآخر رسالة
        const chatPartnersMap = new Map();
        messages.forEach(msg => {
            const partnerId = msg.sender_id === currentUser.id ? msg.receiver_id : msg.sender_id;
            if (partnerId === currentUser.id) return; // تخطي الدردشة مع النفس
            if (!chatPartnersMap.has(partnerId)) {
                chatPartnersMap.set(partnerId, {
                    content: msg.content,
                    time: new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                });
            }
        });

        const partnerIds = Array.from(chatPartnersMap.keys()).filter(id => !blockedUserIds.has(id));

        if (partnerIds.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:50px 20px; text-align:center;">
                    <i class="fas fa-comments" style="font-size:40px; color:var(--text-muted); opacity:0.4; margin-bottom:12px;"></i>
                    <p style="color:var(--text-muted); font-size:14px;">لا توجد محادثات نشطة حالياً.<br>ابدأ الدردشة مع أشخاص قريبين منك!</p>
                </div>
            `;
            return;
        }

        // جلب الملفات الشخصية لهؤلاء المستخدمين
        const { data: profiles, error: profileErr } = await sb
            .from('profiles')
            .select('*')
            .in('user_id', partnerIds);

        if (profileErr) throw profileErr;

        container.innerHTML = '';
        if (profiles && profiles.length > 0) {
            // تصفية التكرارات (إبقاء البروفايل الأول الفريد لكل شريك)
            const uniqueProfiles = [];
            const seenUserIds = new Set();
            profiles.forEach(p => {
                if (!seenUserIds.has(p.user_id)) {
                    seenUserIds.add(p.user_id);
                    uniqueProfiles.push(p);
                }
            });

            uniqueProfiles.forEach((profile, index) => {
                const lastChat = chatPartnersMap.get(profile.user_id);
                const initial = (profile.full_name || '?').charAt(0).toUpperCase();
                const genderClass = profile.gender === 'female' ? 'female' : 'male';
                const genderSymbol = profile.gender === 'female' ? '♀' : '♂';

                const item = document.createElement('div');
                item.className = `chat-item ${genderClass}`;
                item.setAttribute('data-user-id', profile.user_id);

                const isOnline = onlineUsers.has(profile.user_id);
                const age = calculateAge(profile.dob);

                // حساب وسيلة التسجيل بشكل تلقائي وجمالي ليطابق لقطة الشاشة
                let provider = 'google';
                if (profile.email) {
                    if (profile.email.includes('gmail')) provider = 'google';
                    else if (profile.email.includes('facebook') || profile.email.includes('fb')) provider = 'facebook';
                    else if (profile.email.includes('tiktok')) provider = 'tiktok';
                } else {
                    const hash = profile.user_id ? profile.user_id.charCodeAt(0) + (profile.full_name ? profile.full_name.charCodeAt(0) : 0) : index;
                    const providers = ['facebook', 'google', 'tiktok'];
                    provider = providers[hash % providers.length];
                }

                let socialIconHtml = '';
                if (provider === 'facebook') {
                    socialIconHtml = `<span class="social-badge facebook" title="سجل عبر Facebook"><i class="fab fa-facebook-f"></i></span>`;
                } else if (provider === 'google') {
                    socialIconHtml = `<span class="social-badge google" title="سجل عبر Google"><i class="fab fa-google"></i></span>`;
                } else if (provider === 'tiktok') {
                    socialIconHtml = `<span class="social-badge tiktok" title="سجل عبر TikTok"><i class="fab fa-tiktok"></i></span>`;
                }

                // حساب المسافة بدقة وتنسيق حالة الاتصال
                let distanceTextHTML = '';
                if (currentUserProfile && currentUserProfile.latitude && currentUserProfile.longitude && profile.latitude && profile.longitude) {
                    const dist = calculateDistance(currentUserProfile.latitude, currentUserProfile.longitude, profile.latitude, profile.longitude);
                    if (dist !== null) {
                        const distValue = dist < 1 ? `${Math.round(dist * 1000)}m` : `${dist.toFixed(1)}km`;
                        distanceTextHTML = `<span style="color: var(--text-white); font-weight: 600; display:inline-flex; align-items:center; gap:3px;"><i class="fas fa-location-dot" style="color: #60a5fa; font-size:10px;"></i>${distValue}</span>`;
                    }
                }

                const lastSeenTime = profile.last_seen || profile.created_at;
                let statusText = isOnline 
                    ? '<span style="color:#22c55e; font-weight:700;">متصل الآن</span>' 
                    : `آخر ظهور: ${formatRelativeTime(lastSeenTime).replace("منذ ", "")}`;
                
                // إذا كان النص طويلا، يمكننا التخلي عن كلمة "آخر ظهور:" لتوفير المساحة
                if (!isOnline && distanceTextHTML) {
                    statusText = `منذ ${formatRelativeTime(lastSeenTime)}`;
                }

                const rightMetaText = distanceTextHTML 
                    ? `<span dir="rtl" style="display:inline-flex; align-items:center; gap:6px; font-size:11px;">${statusText} <span style="opacity:0.3;">•</span> <span dir="ltr">${distanceTextHTML}</span></span>` 
                    : `<span style="font-size:11px;">${statusText}</span>`;

                item.innerHTML = `
                    <div class="chat-item-avatar-wrapper" style="position: relative; flex-shrink: 0;">
                        <div class="chat-item-avatar ${genderClass}">
                            ${profile.avatar_url ? `<img src="${profile.avatar_url}" alt="" loading="lazy">` : initial}
                        </div>
                        ${isOnline ? '<span class="online-dot"></span>' : ''}
                    </div>
                    <div class="chat-item-details">
                        <div class="chat-item-name-row">
                            <span class="chat-item-name">
                                ${profile.full_name || 'مستخدم'}
                                ${profile.is_vip ? ' <i class="fas fa-gem" style="color: #fbbf24; font-size: 10px; margin-right: 4px;" title="عضو VIP"></i>' : ''}
                            </span>
                        </div>
                        <div class="chat-item-badge-row" style="display: flex; align-items: center; gap: 6px; margin-top: 2px;">
                            <span class="gender-badge ${genderClass}">${genderSymbol} ${age !== '-' ? age : ''}</span>
                            ${socialIconHtml}
                        </div>
                        <p class="chat-item-lastmsg">${escapeHtml(lastChat.content)}</p>
                    </div>
                    <div class="chat-item-meta" style="text-align: left; display: flex; flex-direction: column; align-items: flex-end; justify-content: flex-start; flex-shrink: 0;">
                        <span class="chat-item-time">${rightMetaText}</span>
                    </div>
                `;

                item.addEventListener('click', () => {
                    openChatWindow(profile);
                });

                container.appendChild(item);
            });
        } else {
            container.innerHTML = `
                <div class="empty-state" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:50px 20px; text-align:center;">
                    <i class="fas fa-comments" style="font-size:40px; color:var(--text-muted); opacity:0.4; margin-bottom:12px;"></i>
                    <p style="color:var(--text-muted); font-size:14px;">لا توجد محادثات نشطة حالياً.<br>ابدأ الدردشة مع أشخاص قريبين منك!</p>
                </div>
            `;
        }

    } catch (err) {
        console.error("خطأ أثناء جلب قائمة المحادثات:", err);
        container.innerHTML = `<p style="text-align:center; color:var(--text-muted); padding:20px;">فشل تحميل المحادثات.</p>`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const loginBtn    = document.getElementById('login-btn');
    const tiktokBtn   = document.getElementById('tiktok-btn');
    const facebookBtn = document.getElementById('facebook-btn');
    const logoutBtn   = document.getElementById('logout-btn');

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
            alert('تسجيل الدخول عبر TikTok غير مدعوم مباشرة من Supabase. خاصك تفعّل OAuth مخصص من لوحة التحكم.');
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
                <button class="dropdown-item" id="dd-view-profile">
                    <i class="fas fa-user"></i> الملف الشخصي
                </button>
                <div class="dropdown-divider"></div>
                <button class="dropdown-item danger" id="dd-block-user">
                    <i class="fas fa-ban"></i> حظر هذا المستخدم
                </button>
                <button class="dropdown-item danger" id="dd-report-user">
                    <i class="fas fa-flag"></i> إبلاغ
                </button>
            `;
            chatMenuBtn.parentElement.style.position = 'relative';
            chatMenuBtn.parentElement.appendChild(menu);

            menu.querySelector('#dd-view-profile').addEventListener('click', () => {
                menu.remove();
                if (activeChatUserProfile) openUserModal(activeChatUserProfile);
            });

            menu.querySelector('#dd-block-user').addEventListener('click', async () => {
                menu.remove();
                if (activeChatUserProfile && confirm(`هل تريد حظر ${activeChatUserProfile.full_name || 'هذا المستخدم'}؟`)) {
                    await blockUser(activeChatUserId);
                    closeChatWindow();
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

    // زر إرسال الصور
    if (chatImgBtn && chatImgInput) {
        chatImgBtn.addEventListener('click', () => {
            chatImgInput.click();
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
        alert('حجم الصورة كبير! الحد الأقصى 5 ميغابايت.');
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
        <span class="msg-time">جاري الرفع...</span>
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
                content: '📷 صورة',
                type: 'image',
                media_url: publicUrl
            }]);

        if (msgError) throw msgError;

        // إزالة مؤشر التحميل
        tempBubble.remove();

    } catch (err) {
        console.error('خطأ أثناء رفع الصورة:', err);
        tempBubble.remove();
        alert('فشل رفع الصورة: ' + err.message);
    }
}

// فتح الصورة بالحجم الكامل (Lightbox)
function openImageLightbox(imageUrl) {
    const lightbox = document.createElement('div');
    lightbox.className = 'image-lightbox';
    lightbox.innerHTML = `
        <button class="lightbox-close"><i class="fas fa-times"></i></button>
        <img src="${imageUrl}" alt="صورة">
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
        alert('يرجى السماح بالوصول للميكروفون!');
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
            <span style="color:rgba(255,255,255,0.5); font-size:13px;">جاري الرفع...</span>
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
        alert('فشل رفع الملف الصوتي: ' + err.message);
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
        
        showToastNotification(null, 'تم الحظر', 'تم حظر هذا المستخدم بنجاح', 'system');
    } catch (err) {
        console.error('خطأ أثناء الحظر:', err);
        if (err.code === '42P01') {
            alert('فشل الحظر:\nيرجى تشغيل كود SQL في Supabase أولاً لإنشاء جدول blocks!');
        } else {
            alert('فشل الحظر: ' + err.message);
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
            alert('فشل إلغاء الحظر:\nيرجى تشغيل كود SQL في Supabase أولاً لإنشاء جدول blocks!');
        } else {
            alert('فشل إلغاء الحظر: ' + err.message);
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
        'محتوى مسيء أو مضايقة',
        'ملف شخصي مزيف',
        'رسائل غير مرغوب فيها (Spam)',
        'محتوى غير لائق',
        'احتيال أو نصب',
        'سبب آخر'
    ];

    overlay.innerHTML = `
        <div class="report-modal">
            <h3><i class="fas fa-flag" style="color:#ef4444; margin-left:8px;"></i> إبلاغ عن ${escapeHtml(profile.full_name || 'مستخدم')}</h3>
            <div class="report-reason-list">
                ${reasons.map((r, i) => `<button class="report-reason-btn" data-reason="${escapeHtml(r)}">${r}</button>`).join('')}
            </div>
            <textarea class="report-details-input" placeholder="أضف تفاصيل إضافية (اختياري)..."></textarea>
            <div class="report-actions">
                <button class="btn-report-submit" id="submit-report-btn">
                    <i class="fas fa-paper-plane" style="margin-left:6px;"></i> إرسال البلاغ
                </button>
                <button class="btn-report-cancel" id="cancel-report-btn">إلغاء</button>
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
            alert('يرجى اختيار سبب الإبلاغ!');
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
            showToastNotification(null, 'تم الإبلاغ', 'شكراً! سيتم مراجعة البلاغ قريباً', 'system');
        } catch (err) {
            console.error('خطأ أثناء الإبلاغ:', err);
            if (err.code === '42P01') {
                alert('فشل إرسال البلاغ:\nيرجى تشغيل كود SQL في Supabase أولاً لإنشاء جدول reports!');
            } else {
                alert('فشل إرسال البلاغ: ' + err.message);
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
                const senderName = sender ? sender.full_name : 'مستخدم';
                const senderGender = sender ? sender.gender : 'male';
                const senderAvatar = sender ? sender.avatar_url : null;

                // عرض Toast
                showToastNotification(
                    { name: senderName, gender: senderGender, avatar_url: senderAvatar, user_id: newMsg.sender_id },
                    senderName,
                    newMsg.content || '📷 صورة',
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
        const { data, error } = await sb
            .from('messages')
            .select('id', { count: 'exact', head: true })
            .eq('receiver_id', currentUser.id)
            .eq('is_read', false);
        
        const count = data ? data.length : 0;
        
        // تحديث شارة تبويب Chats
        const chatsBadge = document.getElementById('chats-unread-badge');
        if (chatsBadge) {
            if (count > 0) {
                chatsBadge.textContent = count > 99 ? '99+' : count;
                chatsBadge.style.display = 'flex';
            } else {
                chatsBadge.style.display = 'none';
            }
        }

        // تحديث أيقونة الجرس
        const bellBadge = document.getElementById('notif-bell-badge');
        if (bellBadge) {
            if (count > 0) {
                bellBadge.textContent = count > 99 ? '99+' : count;
                bellBadge.style.display = 'flex';
            } else {
                bellBadge.style.display = 'none';
            }
        }
    } catch (err) {
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
        
        updateUnreadBadge();
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
            avatarHtml = `<div class="toast-avatar ${genderClass}"><img src="${senderInfo.avatar_url}" alt=""></div>`;
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
        <span class="toast-time">الآن</span>
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
            alert('فشل رفع الصورة:\nيرجى تشغيل كود SQL في Supabase أولاً لإضافة عمود avatar_url لجدول profiles!');
        } else {
            alert('فشل رفع الصورة: ' + err.message);
        }
        return null;
    }
}

// دالة مساعدة لعرض الأفاتار (صورة أو حرف)
function getAvatarHtml(profile, sizeClass = '') {
    if (profile && profile.avatar_url) {
        return `<img src="${profile.avatar_url}" alt="${escapeHtml(profile.full_name || '')}" loading="lazy">`;
    }
    return (profile && profile.full_name ? profile.full_name : '?').charAt(0).toUpperCase();
}

// ═══════════════════════════════════════════════════
// === ترقية وإلغاء العضوية المميزة VIP (VIP Simulation) ===
// ═══════════════════════════════════════════════════

async function upgradeToVIP() {
    if (!currentUser) {
        alert("يرجى تسجيل الدخول أولاً!");
        return;
    }

    if (!confirm("هل تريد الاشتراك في العضوية المميزة HayMoi VIP؟\nستحصل على شارة 💎 بجانب اسمك وتظهر في مقدمة قائمة الأعضاء!")) {
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

        showToastNotification(null, 'تهانينا! 🎉', 'لقد أصبحت عضواً VIP مميزاً الآن!', 'system');
        
        // إعادة تحميل البروفايل وقائمة الأعضاء
        await loadOwnProfile(currentUser);
        if (currentUser) loadDiscoveryUsers(currentUser);
        
    } catch (err) {
        console.error('خطأ أثناء ترقية VIP:', err);
        if (err.code === '42703' || (err.message && err.message.includes('is_vip'))) {
            alert('فشل الترقية لـ VIP:\nيرجى تشغيل كود SQL في Supabase أولاً لإضافة عمود is_vip لجدول profiles!');
        } else {
            alert('فشل الترقية لـ VIP: ' + err.message);
        }
    }
}

async function downgradeFromVIP() {
    if (!currentUser) return;

    if (!confirm("هل تريد إلغاء اشتراك VIP والعودة للحساب العادي؟")) {
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

        showToastNotification(null, 'تم إلغاء الاشتراك', 'تمت العودة للحساب العادي بنجاح', 'system');
        
        await loadOwnProfile(currentUser);
        if (currentUser) loadDiscoveryUsers(currentUser);
        
    } catch (err) {
        console.error('خطأ أثناء إلغاء VIP:', err);
        if (err.code === '42703' || (err.message && err.message.includes('is_vip'))) {
            alert('فشل إلغاء VIP:\nيرجى تشغيل كود SQL في Supabase أولاً لإضافة عمود is_vip لجدول profiles!');
        } else {
            alert('فشل إلغاء VIP: ' + err.message);
        }
    }
}

// تحديث آخر ظهور عند إخفاء الصفحة أو مغادرتها
window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && currentUser) {
        updateLastSeenInDB();
    }
});

// تحديث التوقيت النسبي لجميع البطاقات غير المتصلة كل 30 ثانية لتحديث "آخر ظهور" تلقائياً
setInterval(() => {
    document.querySelectorAll('.card-status-text').forEach(el => {
        if (!el.classList.contains('online')) {
            const lastSeen = el.getAttribute('data-last-seen') || el.getAttribute('data-created-at');
            if (lastSeen) {
                el.textContent = `آخر ظهور: ${formatRelativeTime(lastSeen)}`;
            }
        }
    });
    // وتحديث ترويسة الشات المفتوح حالياً إذا كان غير متصل
    if (activeChatUserId) {
        const chatStatusEl = document.getElementById('chat-user-status');
        if (chatStatusEl && chatStatusEl.textContent !== 'متصل الآن') {
            const lastSeen = activeChatUserProfile ? (activeChatUserProfile.last_seen || activeChatUserProfile.created_at) : null;
            if (lastSeen) {
                chatStatusEl.textContent = `آخر ظهور: ${formatRelativeTime(lastSeen)}`;
            }
        }
    }
}, 30000);

// === نافذة الفلترة المتقدمة ===
function openAdvancedFilterModal(profiles, listContainer) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.7); z-index:2000; display:flex; align-items:center; justify-content:center; animation:fadeInModal 0.2s ease; padding: 20px;';

    modal.innerHTML = `
        <div class="user-modal-card" style="width:100%; max-width:400px; background:#1c1c1e; border-radius:24px; overflow:hidden; color:var(--text-white); animation:slideUpModal 0.3s ease; padding:0;">
            <!-- Header Tabs -->
            <div style="display:flex; background:rgba(255,255,255,0.03); color:var(--text-white); font-weight:bold;">
                <div style="flex:1; text-align:center; padding:15px; opacity:0.7; cursor:pointer;">بالـ ID</div>
                <div style="flex:1; text-align:center; padding:15px; opacity:0.7; cursor:pointer;">متقدم</div>
                <div style="flex:1; text-align:center; padding:15px; border-bottom:3px solid var(--color-primary); cursor:pointer;">بسيط</div>
            </div>

            <div style="padding:24px;">
                <!-- Gender -->
                <h4 style="margin-top:0; color:var(--text-muted); font-weight:normal; margin-bottom:12px;">الجنس</h4>
                <div class="ios-segmented-control">
                    <div class="adv-gender-btn ${currentGenderFilter==='all'?'active':''}" data-val="all">
                        الكل
                    </div>
                    <div class="adv-gender-btn ${currentGenderFilter==='female'?'active':''}" data-val="female">
                        <i class="fas fa-venus" style="color:#ec4899; margin-left:4px;"></i> أنثى
                    </div>
                    <div class="adv-gender-btn ${currentGenderFilter==='male'?'active':''}" data-val="male">
                        <i class="fas fa-mars" style="color:#3b82f6; margin-left:4px;"></i> ذكر
                    </div>
                </div>

                <!-- Distance -->
                <h4 style="color:#666; font-weight:normal; margin-bottom:12px;">المسافة القصوى</h4>
                <select id="adv-dist" style="width:100%; padding:12px; border:1px solid rgba(255,255,255,0.1); background:#2a2a2d; border-radius:12px;; font-size:16px; margin-bottom:24px; outline:none; color:var(--text-white); cursor:pointer;">
                    <option value="10" ${currentDistanceFilter===10?'selected':''}>10 كم</option>
                    <option value="50" ${currentDistanceFilter===50?'selected':''}>50 كم</option>
                    <option value="100" ${currentDistanceFilter===100?'selected':''}>100 كم</option>
                    <option value="500" ${currentDistanceFilter===500?'selected':''}>500 كم</option>
                    <option value="10000" ${currentDistanceFilter===10000?'selected':''}>أي مسافة</option>
                </select>

                <!-- Verified VIP Checkbox -->
                <label class="vip-filter-label" style="display:flex; align-items:center; justify-content:space-between; cursor:pointer; font-size:16px; margin-bottom:30px; font-weight:800; background:linear-gradient(135deg, rgba(251, 191, 36, 0.05), rgba(20, 20, 22, 0.8)); padding:18px 15px; border-radius:14px; border:1px solid rgba(251, 191, 36, 0.2); box-shadow: 0 4px 15px rgba(0,0,0,0.2);">
                    <div class="ios-toggle vip-toggle">
                        <input type="checkbox" id="adv-verified" ${requireVerifiedFilter?'checked':''}>
                        <div class="toggle-bg"></div>
                    </div>
                    <span style="color:#fbbf24; display:flex; align-items:center; gap:8px;">
                        Réservé aux membres VIP <i class="fas fa-gem" style="font-size:14px;"></i>
                    </span>
                </label>

                <!-- Action Buttons -->
                <div style="display:flex; gap:12px;">
                    <button id="adv-cancel" style="flex:1; padding:14px; background:rgba(255,255,255,0.08); color:white; border:none; border-radius:12px; font-weight:bold; font-size:16px; cursor:pointer; transition:0.2s;">إلغاء</button>
                    <button id="adv-search" style="flex:1; padding:14px; background:${currentGenderFilter==='female' ? '#ec4899' : currentGenderFilter==='male' ? '#3b82f6' : 'linear-gradient(45deg, #3b82f6, #ec4899)'}; color:white; border:none; border-radius:12px; font-weight:bold; font-size:16px; cursor:pointer; transition:0.5s;">بحث</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const genderBtns = modal.querySelectorAll('.adv-gender-btn');
    let tempGender = currentGenderFilter;
    genderBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            genderBtns.forEach(b => b.classList.remove('active'));
            const target = e.currentTarget;
            target.classList.add('active');
            tempGender = target.getAttribute('data-val');
            
            const searchBtn = modal.querySelector('#adv-search');
            if (tempGender === 'female') {
                searchBtn.style.background = '#ec4899';
            } else if (tempGender === 'male') {
                searchBtn.style.background = '#3b82f6';
            } else {
                searchBtn.style.background = 'linear-gradient(45deg, #3b82f6, #ec4899)';
            }
        });
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
